"""Build data/app.db (SQLite + FTS5) from the raw Torob CSVs.

Usage: python -I scripts/build_db.py data/raw data/app.db
"""
import json
import re
import sqlite3
import statistics
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.textnorm import normalize

LOW_PRICE, HIGH_PRICE = 1_000, 100_000_000_000  # toman
RATIO_LOW, RATIO_HIGH = 0.2, 5.0  # vs. product median

FA_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
STOP = r"(?=،|,|$)"


def nul(v):
    if v is None or (isinstance(v, float) and v != v) or v == "null":
        return None
    return v


def jload(v, default):
    v = nul(v)
    if v is None:
        return default
    try:
        return json.loads(v)
    except (TypeError, ValueError):
        return default


def parse_address(addr):
    """Pull mall / floor / unit / plaque out of a free-text Tehran address."""
    out = {"passage": None, "floor": None, "unit": None, "plaque": None}
    if not addr:
        return out
    m = re.search(r"((?:پاساژ|مجتمع(?: تجاری)?|بازار(?:چه)?|مرکز خرید|سرای|تیمچه)\s+[^،,]+)", addr)
    if m:
        out["passage"] = m.group(1).strip()
    m = re.search(r"طبقه\s*([^،,]+)" + STOP, addr)
    if m:
        out["floor"] = m.group(1).strip().translate(FA_DIGITS)
    m = re.search(r"واحد\s*([^،,]+)" + STOP, addr)
    if m:
        out["unit"] = m.group(1).strip().translate(FA_DIGITS)
    m = re.search(r"پلاک\s*([^،,]+)" + STOP, addr)
    if m:
        out["plaque"] = m.group(1).strip().translate(FA_DIGITS)
    return out


SCHEMA = """
CREATE TABLE shops(
  shop_id TEXT PRIMARY KEY, name TEXT, name_is_real INTEGER,
  address TEXT, location_label TEXT, lat REAL, lon REAL,
  passage TEXT, floor TEXT, unit TEXT, plaque TEXT,
  categories TEXT, phone TEXT, instagram TEXT, website TEXT,
  weekly_hours TEXT, has_hours INTEGER,
  installment TEXT, installment_providers TEXT, has_installment INTEGER,
  fast_delivery INTEGER, offer_count INTEGER DEFAULT 0
);
CREATE TABLE shop_categories(shop_id TEXT, category TEXT);
CREATE TABLE products(
  product_id TEXT PRIMARY KEY, title TEXT, brand TEXT, category TEXT, model TEXT,
  images TEXT, specs TEXT,
  offer_count INTEGER, priced_count INTEGER,
  min_price INTEGER, median_price INTEGER, max_price INTEGER, last_changed TEXT
);
CREATE TABLE offers(
  offer_id TEXT PRIMARY KEY, product_id TEXT, shop_id TEXT,
  price INTEGER, price_flag TEXT, seller_title TEXT, description TEXT,
  warranty_provider TEXT, warranty_months INTEGER, warranty_desc TEXT,
  changed_at TEXT
);
CREATE VIRTUAL TABLE products_fts USING fts5(
  product_id UNINDEXED, title, brand, category, model, seller_titles,
  tokenize = 'unicode61 remove_diacritics 2'
);
"""

INDEXES = """
CREATE INDEX ix_offers_product ON offers(product_id);
CREATE INDEX ix_offers_shop ON offers(shop_id);
CREATE INDEX ix_products_category ON products(category);
CREATE INDEX ix_shopcat_cat ON shop_categories(category);
CREATE INDEX ix_shops_geo ON shops(lat, lon);
"""


def src(raw, name):
    """Prefer plain CSV, fall back to the gzipped seed copy."""
    p = raw / f"{name}.csv"
    return p if p.exists() else raw / f"{name}.csv.gz"


def main(raw_dir, db_path):
    t0 = time.time()
    raw, db_path = Path(raw_dir), Path(db_path)
    db_path.unlink(missing_ok=True)
    con = sqlite3.connect(db_path)
    con.executescript(SCHEMA)

    # ---- offers (needed first for product price stats) ----
    o = pd.read_csv(src(raw, "offers"), dtype=str, keep_default_na=False)
    o["price"] = pd.to_numeric(o.price_toman.replace("null", None), errors="coerce")
    by_product = {}
    for pid, price in zip(o.product_id, o.price, strict=False):
        if price == price:
            by_product.setdefault(pid, []).append(price)
    median = {pid: statistics.median(v) for pid, v in by_product.items()}

    def flag(pid, price):
        if price != price:
            return "missing"
        if price <= LOW_PRICE:
            return "suspicious_low"
        if price >= HIGH_PRICE:
            return "suspicious_high"
        med = median.get(pid)
        if med and len(by_product[pid]) >= 3:
            r = price / med
            if r < RATIO_LOW:
                return "outlier_low"
            if r > RATIO_HIGH:
                return "outlier_high"
        return "ok"

    rows = []
    for r in o.itertuples(index=False):
        w = jload(r.warranty, {}) or {}
        price = r.price
        rows.append((
            r.offer_id, r.product_id, r.shop_id,
            int(price) if price == price and price < 9e18 else None,
            flag(r.product_id, price), r.seller_title, nul(r.description) or None,
            w.get("provider"), w.get("period_months"), w.get("description"),
            nul(r.last_price_changed_at),
        ))
    con.executemany("INSERT INTO offers VALUES(?,?,?,?,?,?,?,?,?,?,?)", rows)
    print(f"offers: {len(rows)}  ({time.time()-t0:.0f}s)")

    # product price stats over trustworthy offers only
    stats = {}
    for pid, price, fl, ch in con.execute("SELECT product_id, price, price_flag, changed_at FROM offers"):
        s = stats.setdefault(pid, {"n": 0, "p": [], "last": None})
        s["n"] += 1
        if fl == "ok":
            s["p"].append(price)
        if ch and (s["last"] is None or ch > s["last"]):
            s["last"] = ch
    seller_titles = o.groupby("product_id").seller_title.apply(lambda x: " ".join(x.unique()[:5]))
    shop_offer_count = o.shop_id.value_counts().to_dict()
    del o

    # ---- products ----
    n_products = 0
    for p in pd.read_csv(src(raw, "products"), dtype=str, keep_default_na=False, chunksize=20_000):
        prow, frow = [], []
        for r in p.itertuples(index=False):
            s = stats.get(r.product_id, {"n": 0, "p": [], "last": None})
            ps = sorted(s["p"])
            prow.append((
                r.product_id, r.persian_title, nul(r.brand_name), nul(r.category_name), nul(r.model),
                nul(r.image_urls), nul(r.specs), s["n"], len(ps),
                ps[0] if ps else None, int(statistics.median(ps)) if ps else None,
                ps[-1] if ps else None, s["last"],
            ))
            frow.append((
                r.product_id, normalize(r.persian_title), normalize(nul(r.brand_name) or ""),
                normalize(nul(r.category_name) or ""), normalize(nul(r.model) or ""),
                normalize(seller_titles.get(r.product_id, "")),
            ))
        con.executemany("INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", prow)
        con.executemany("INSERT INTO products_fts VALUES(?,?,?,?,?,?)", frow)
        n_products += len(prow)
    print(f"products: {n_products}  ({time.time()-t0:.0f}s)")

    # ---- shops ----
    s = pd.read_csv(src(raw, "shops"), dtype=str, keep_default_na=False)
    srow, crow = [], []
    for r in s.itertuples(index=False):
        addr = nul(r.address)
        a = parse_address(addr)
        cats = jload(r.category_names, [])
        contacts = jload(r.contacts, [])
        phone = next((c.get("display_number") for c in contacts if c.get("channel") == "phone"), None)
        insta = jload(r.instagram, None)
        hours = jload(r.weekly_hours, {})
        pay = jload(r.payment_options, [])
        providers = sorted({x.get("provider_name") for x in pay if x.get("provider_name")})
        fd = nul(r.supports_fast_delivery)
        website = nul(r.website_url)
        srow.append((
            r.shop_id, r.name, int(bool(insta or website)),
            addr, nul(r.location_label), float(r.lat), float(r.lon),
            a["passage"], a["floor"], a["unit"], a["plaque"],
            json.dumps(cats, ensure_ascii=False), phone,
            insta.get("profile_url") if insta else None, website,
            json.dumps(hours, ensure_ascii=False), int(bool(hours)),
            json.dumps(pay, ensure_ascii=False), json.dumps(providers, ensure_ascii=False), int(bool(providers)),
            None if fd is None else int(fd == "True"),
            shop_offer_count.get(r.shop_id, 0),
        ))
        crow += [(r.shop_id, c) for c in cats]
    con.executemany("INSERT INTO shops VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", srow)
    con.executemany("INSERT INTO shop_categories VALUES(?,?)", crow)
    print(f"shops: {len(srow)}  ({time.time()-t0:.0f}s)")

    con.executescript(INDEXES)
    con.commit()
    con.execute("INSERT INTO products_fts(products_fts) VALUES('optimize')")
    con.commit()
    con.execute("VACUUM")
    con.close()
    print(f"done in {time.time()-t0:.0f}s -> {db_path} ({db_path.stat().st_size/1e6:.0f} MB)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
