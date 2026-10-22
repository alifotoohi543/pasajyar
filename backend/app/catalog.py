"""Product search, shop/offer ranking and alternatives over the Torob dataset (app.db)."""
from __future__ import annotations

import json
import math
import re
import sqlite3
import time
from collections import Counter
from collections.abc import Iterable
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

from . import db, geo
from .textnorm import normalize

Row = sqlite3.Row
Json = dict[str, Any]

STOPWORDS = frozenset(normalize(
    "میخوام می خوام میخواستم یه یک برای واسه دنبال هستم خوب خوبی ارزون ارزان ارزونترین بهترین قیمت "
    "مناسب لطفا لطفاً چی کدوم کدام تا زیر حداکثر حداقل بالای بین تومن تومان میلیون هزار با و که از در "
    "رو را به هم اینکه باشه باشد دارم میخواهم بخرم خرید نزدیک نزدیکم من "
    "نمیدونم نمی دونم بگیرم بگیریم چه چیزی کنم کدومش مدل مدلی ام م هست خونه مغازه برام"
).split())

# Search ordering: text relevance first, then how widely the product is sold (overall and nearby).
W_RELEVANCE, W_SELLERS, W_NEARBY = 3.0, 1.0, 0.8
PENALTY_NO_PRICE, PENALTY_OVER_BUDGET = 2.0, 1.0

# Shop ranking for a single product; weights sum to 1, bonuses are added on top.
W_PRICE, W_DISTANCE, W_OPEN, W_FRESH = 0.40, 0.30, 0.15, 0.15
BONUS_INSTALLMENT, BONUS_WARRANTY = 0.05, 0.03
DISTANCE_DECAY_M = 3000
OPEN_SCORE = {"open": 1.0, "unknown": 0.5, "closed": 0.2}
FRESH_SCORE = {"fresh": 1.0, "recent": 0.75, "old": 0.4, "stale": 0.15, "unknown": 0.2}

FLAG_LABEL = {
    "missing": "قیمت ثبت نشده — از فروشنده بپرسید",
    "suspicious_low": "قیمت ثبت‌شده غیرعادی (خیلی کم) — احتمالاً اشتباه ثبت شده",
    "suspicious_high": "قیمت ثبت‌شده غیرعادی (خیلی زیاد)",
    "outlier_low": "خیلی ارزان‌تر از بقیه فروشنده‌ها — قبل از رفتن استعلام بگیرید",
    "outlier_high": "خیلی گران‌تر از بقیه فروشنده‌ها",
}
EMPTY_NEAR: Json = {"count": 0, "nearest_m": None, "open_now": 0}


# ---------------------------------------------------------------- small helpers

def days_since(ts: str | None) -> int | None:
    if not ts:
        return None
    try:
        return max(0, (datetime.now(timezone.utc) - datetime.fromisoformat(ts)).days)
    except ValueError:
        return None


def ago(days: int) -> str:
    if days < 1:
        return "امروز"
    if days < 30:
        return f"{days} روز پیش"
    if days < 365:
        return f"{days // 30} ماه پیش"
    return f"{days // 365} سال پیش"


def freshness(ts: str | None) -> Json:
    """How old the *registered price* is — explicitly not a stock signal."""
    d = days_since(ts)
    if d is None:
        return {"level": "unknown", "days": None, "label": "زمان ثبت قیمت نامشخص"}
    level = "fresh" if d <= 7 else "recent" if d <= 30 else "old" if d <= 120 else "stale"
    return {"level": level, "days": d, "label": "امروز به‌روز شده" if d == 0 else f"{ago(d)} به‌روز شده"}


def fmt_dist(m: float) -> str:
    return f"{round(m)} متر" if m < 1000 else f"{m / 1000:.1f} کیلومتر"


def _json(text: str | None, default: Any) -> Any:
    try:
        return json.loads(text) if text else default
    except ValueError:
        return default


def first_image(images: str | None) -> str | None:
    imgs = _json(images, [])
    return imgs[0] if imgs else None


# ---------------------------------------------------------------- shops

@lru_cache(maxsize=1)
def shop_index() -> dict[str, Row]:
    return {r["shop_id"]: r for r in db.catalog().execute("SELECT * FROM shops")}


@lru_cache(maxsize=8192)
def _open_status(shop_id: str, minute: int) -> Json:
    s = shop_index()[shop_id]
    return geo.open_status(_json(s["weekly_hours"], {}))


def open_status(shop_id: str) -> Json:
    return _open_status(shop_id, int(time.time() // 60))


def shop_brief(s: Row, lat: float | None = None, lon: float | None = None) -> Json:
    out: Json = {
        "shop_id": s["shop_id"], "name": s["name"], "name_is_real": bool(s["name_is_real"]),
        "address": s["address"], "area": s["location_label"], "lat": s["lat"], "lon": s["lon"],
        "passage": s["passage"], "floor": s["floor"], "unit": s["unit"], "plaque": s["plaque"],
        "open": open_status(s["shop_id"]),
        "installment": _json(s["installment_providers"], []),
        "installment_channels": sorted({p.get("channel") for p in _json(s["installment"], []) if p.get("channel")}),
        "fast_delivery": None if s["fast_delivery"] is None else bool(s["fast_delivery"]),
        "offer_count": s["offer_count"],
    }
    if lat is not None and lon is not None:
        d = geo.haversine_m(lat, lon, s["lat"], s["lon"])
        minutes, mode = geo.travel_minutes(d)
        out.update(distance_m=round(d), travel_min=minutes, travel_mode=mode)
    return out


def same_passage(s: Row, limit: int = 12) -> list[Json]:
    if not s["passage"]:
        return []
    rows = [r for r in shop_index().values() if r["passage"] == s["passage"] and r["shop_id"] != s["shop_id"]]
    return [{"shop_id": r["shop_id"], "name": r["name"], "floor": r["floor"], "unit": r["unit"] or r["plaque"]}
            for r in rows[:limit]]


def shop_detail(shop_id: str, lat: float, lon: float) -> Json | None:
    s = shop_index().get(shop_id)
    if s is None:
        return None
    out = shop_brief(s, lat, lon)
    out.update(
        categories=_json(s["categories"], []),
        phone=s["phone"], instagram=s["instagram"], website=s["website"],
        week=geo.week_table(_json(s["weekly_hours"], {})),
        payments=_json(s["installment"], []),
        links=geo.map_links(s["lat"], s["lon"], s["passage"], s["location_label"]),
        neighbours=same_passage(s),
    )
    rows = db.catalog().execute(
        "SELECT o.price, o.price_flag, o.changed_at, p.product_id, p.title, p.images FROM offers o "
        "JOIN products p USING(product_id) WHERE o.shop_id=? ORDER BY o.changed_at DESC LIMIT 60", (shop_id,))
    out["products"] = [{"product_id": r["product_id"], "title": r["title"], "image": first_image(r["images"]),
                        "price": r["price"], "price_ok": r["price_flag"] == "ok", "freshness": freshness(r["changed_at"])}
                       for r in rows]
    return out


@lru_cache(maxsize=1)
def areas() -> list[Json]:
    rows = db.catalog().execute(
        "SELECT location_label AS name, COUNT(*) AS n, AVG(lat) AS lat, AVG(lon) AS lon FROM shops "
        "WHERE location_label IS NOT NULL AND offer_count > 0 "
        "GROUP BY location_label HAVING n >= 15 ORDER BY n DESC LIMIT 16")
    return [dict(r) for r in rows]


# ---------------------------------------------------------------- rule-based query understanding

_NUM = r"(\d+(?:[.,/]\d+)?)"
_UNIT = r"\s*(میلیون|میلیونی|م|هزار|تومن|تومان|ت)?"


def _amount(num: str, unit: str | None) -> int:
    v = float(num.replace("/", ".").replace(",", "."))
    if unit in ("میلیون", "میلیونی", "م"):
        return int(v * 1_000_000)
    if unit == "هزار":
        return int(v * 1_000)
    return int(v) if v > 10_000 else int(v * 1_000_000)  # a bare small number means millions


def parse_budget(text: str) -> tuple[int | None, int | None, str]:
    """Extract (min, max, remaining_text) from phrases like «زیر ۳ میلیون» or «بین ۲ تا ۵ میلیون»."""
    t = normalize(text)
    m = re.search(rf"بین\s*{_NUM}{_UNIT}\s*(?:تا|و)\s*{_NUM}{_UNIT}", t)
    if m:
        unit2 = m.group(4) or m.group(2)
        return _amount(m.group(1), m.group(2) or unit2), _amount(m.group(3), unit2), t[:m.start()] + t[m.end():]
    m = re.search(rf"(?:زیر|تا|حداکثر|کمتر از|نهایتا|ماکزیمم)\s*{_NUM}{_UNIT}", t)
    if m:
        return None, _amount(m.group(1), m.group(2)), t[:m.start()] + t[m.end():]
    m = re.search(rf"(?:بالای|بیشتر از|حداقل)\s*{_NUM}{_UNIT}", t)
    if m:
        return _amount(m.group(1), m.group(2)), None, t[:m.start()] + t[m.end():]
    return None, None, t


def keywords(text: str) -> list[str]:
    return [w for w in normalize(text).split() if w not in STOPWORDS and (len(w) > 1 or w.isdigit())]


def _fts_query(tokens: Iterable[str], op: str = "AND") -> str | None:
    toks = [t.replace('"', "") for t in tokens if t]
    return f" {op} ".join(f'"{t}"*' for t in toks) if toks else None


# ---------------------------------------------------------------- availability & cards

def availability(product_ids: list[str], lat: float, lon: float, radius_km: float | None = None,
                 installment: bool = False) -> dict[str, Json]:
    """Per product: how many shops list it (within radius), nearest distance, how many are open now."""
    if not product_ids:
        return {}
    marks = ",".join("?" * len(product_ids))
    shops = shop_index()
    out: dict[str, Json] = {}
    for r in db.catalog().execute(f"SELECT product_id, shop_id FROM offers WHERE product_id IN ({marks})", product_ids):
        s = shops.get(r["shop_id"])
        if s is None or (installment and not s["has_installment"]):
            continue
        d = geo.haversine_m(lat, lon, s["lat"], s["lon"])
        if radius_km and d > radius_km * 1000:
            continue
        a = out.setdefault(r["product_id"], dict(EMPTY_NEAR))
        a["count"] += 1
        if a["nearest_m"] is None or d < a["nearest_m"]:
            a["nearest_m"] = round(d)
        if open_status(s["shop_id"])["state"] == "open":
            a["open_now"] += 1
    return out


def product_card(r: Row, near: Json | None = None) -> Json:
    lo, med, hi = r["min_price"], r["median_price"], r["max_price"]
    return {
        "product_id": r["product_id"], "title": r["title"], "brand": r["brand"], "category": r["category"],
        "image": first_image(r["images"]),
        "price": {"min": lo, "median": med, "max": hi, "priced_offers": r["priced_count"],
                  "wide_spread": bool(lo and hi and hi / max(lo, 1) > 2.5)},
        "offer_count": r["offer_count"],
        "freshness": freshness(r["last_changed"]),
        "near": near or dict(EMPTY_NEAR),
    }


def product_rows(ids: list[str]) -> list[Row]:
    if not ids:
        return []
    marks = ",".join("?" * len(ids))
    rows = {r["product_id"]: r for r in db.catalog().execute(f"SELECT * FROM products WHERE product_id IN ({marks})", ids)}
    return [rows[i] for i in ids if i in rows]


def cards(ids: list[str], lat: float, lon: float, radius_km: float = 10) -> list[Json]:
    rows = product_rows(ids)
    near = availability([r["product_id"] for r in rows], lat, lon, radius_km)
    return [product_card(r, near.get(r["product_id"])) for r in rows]


def product_detail(pid: str) -> Json | None:
    rows = product_rows([pid])
    if not rows:
        return None
    r = rows[0]
    out = product_card(r)
    out.update(images=_json(r["images"], [])[:6], model=r["model"], specs=_json(r["specs"], []))
    return out


# ---------------------------------------------------------------- search

def search(q: str, budget_min: int | None = None, budget_max: int | None = None, category: str | None = None,
           brand: str | None = None, lat: float = 0, lon: float = 0, radius_km: float | None = None,
           installment: bool = False, extra_terms: Iterable[str] = (), limit: int = 24) -> Json:
    toks = keywords(q)
    queries = [_fts_query(toks)] + [_fts_query(keywords(t)) for t in extra_terms]
    if len(toks) > 2:  # graceful degradation for long free-text queries
        queries.append(_fts_query(toks, "OR"))

    seen: set[str] = set()
    cand: list[Row] = []
    for i, fq in enumerate(queries):
        if not fq:
            continue
        try:
            rows = db.catalog().execute(
                "SELECT p.*, bm25(products_fts, 0, 6, 3, 2, 3, 1) AS rank FROM products_fts "
                "JOIN products p USING(product_id) WHERE products_fts MATCH ? ORDER BY rank LIMIT 400", (fq,)).fetchall()
        except sqlite3.OperationalError:  # malformed FTS expression from odd user input
            continue
        for r in rows:
            if r["product_id"] not in seen:
                seen.add(r["product_id"])
                cand.append(r)
        if i == 0 and len(cand) >= 60:
            break

    cats = Counter(r["category"] for r in cand if r["category"])
    brands = Counter(r["brand"] for r in cand if r["brand"])

    def keep(r: Row) -> bool:
        if category and r["category"] != category:
            return False
        if brand and r["brand"] != brand:
            return False
        if budget_max and (r["median_price"] is None or r["min_price"] > budget_max * 1.05):
            return False
        return not (budget_min and r["median_price"] is not None and r["median_price"] < budget_min * 0.95)

    cand = [r for r in cand if keep(r)]
    near = availability([r["product_id"] for r in cand[:300]], lat, lon, radius_km, installment)
    if installment:
        cand = [r for r in cand if near.get(r["product_id"], EMPTY_NEAR)["count"] > 0]

    best_rank = min((r["rank"] for r in cand), default=-1.0) or -1.0  # bm25: more negative = better

    def score(r: Row) -> float:
        s = (W_RELEVANCE * r["rank"] / best_rank
             + W_SELLERS * math.log1p(r["offer_count"])
             + W_NEARBY * math.log1p(near.get(r["product_id"], EMPTY_NEAR)["count"]))
        if r["priced_count"] == 0:
            s -= PENALTY_NO_PRICE
        if budget_max and r["median_price"] and r["median_price"] > budget_max:
            s -= PENALTY_OVER_BUDGET
        return s

    cand.sort(key=score, reverse=True)
    return {
        "query": q, "tokens": toks, "total": len(cand),
        "items": [product_card(r, near.get(r["product_id"])) for r in cand[:limit]],
        "facets": {
            "categories": [{"name": k, "count": v} for k, v in cats.most_common(8)],
            "brands": [{"name": k, "count": v} for k, v in brands.most_common(10)],
        },
    }


# ---------------------------------------------------------------- shops for one product

def warranty_label(o: Row) -> str | None:
    p = o["warranty_provider"]
    if not p:
        return None
    if "گارانتی" in p or "بدون" in p:
        return p
    return f"گارانتی {p}" + (f" {o['warranty_months']} ماهه" if o["warranty_months"] else "")


def _has_warranty(label: str | None) -> bool:
    return bool(label) and "بدون" not in label


def _rank_one(o: Row, b: Json, cheapest: int | None, n_priced: int) -> Json:
    fr = freshness(o["changed_at"])
    price_ok = o["price_flag"] == "ok"
    reasons: list[str] = []
    cautions: list[str] = []

    if price_ok and cheapest and n_priced > 1:
        if o["price"] == cheapest:
            reasons.append("ارزان‌ترین قیمت ثبت‌شده")
        elif o["price"] <= cheapest * 1.05:
            reasons.append("قیمت نزدیک به کمترین")
    if not price_ok:
        cautions.append(FLAG_LABEL[o["price_flag"]])
    if b["distance_m"] <= 1000:
        reasons.append(f"نزدیک ({fmt_dist(b['distance_m'])})")
    state = b["open"]["state"]
    if state == "open":
        reasons.append(b["open"]["label"])
    elif state == "closed":
        cautions.append(b["open"]["label"])
    if fr["level"] == "fresh":
        reasons.append("قیمت همین هفته به‌روز شده")
    elif fr["level"] in ("old", "stale"):
        cautions.append(f"قیمت {ago(fr['days'])} ثبت شده — ممکن است تغییر کرده باشد")
    if b["installment"]:
        reasons.append("خرید اقساطی: " + "، ".join(b["installment"]))
    w = warranty_label(o)
    if _has_warranty(w):
        reasons.append(w)

    score = (W_PRICE * ((cheapest / o["price"]) if price_ok and cheapest else 0.3)
             + W_DISTANCE * math.exp(-b["distance_m"] / DISTANCE_DECAY_M)
             + W_OPEN * OPEN_SCORE[state]
             + W_FRESH * FRESH_SCORE[fr["level"]]
             + (BONUS_INSTALLMENT if b["installment"] else 0)
             + (BONUS_WARRANTY if _has_warranty(w) else 0))
    return {
        "offer_id": o["offer_id"], "price": o["price"], "price_flag": o["price_flag"], "price_ok": price_ok,
        "seller_title": o["seller_title"], "description": o["description"], "warranty": w, "freshness": fr,
        "shop": b, "score": round(score, 3), "reasons": reasons, "cautions": cautions,
        "stock": "unverified",  # a listing is not confirmed stock; only a seller reply confirms it
    }


SORT_KEYS = {
    "best": lambda x: -x["score"],
    "price": lambda x: (not x["price_ok"], x["price"] or 9e18),
    "distance": lambda x: x["shop"]["distance_m"],
    "fresh": lambda x: x["freshness"]["days"] if x["freshness"]["days"] is not None else 1e9,
}


def rank_offers(pid: str, lat: float, lon: float, radius_km: float | None = None, installment: bool = False,
                open_now: bool = False, warranty: bool = False, sort: str = "best") -> Json:
    rows = db.catalog().execute("SELECT * FROM offers WHERE product_id=?", (pid,)).fetchall()
    shops = shop_index()
    ok_prices = [r["price"] for r in rows if r["price_flag"] == "ok"]
    cheapest = min(ok_prices, default=None)
    items: list[Json] = []
    hidden: Counter[str] = Counter()
    for o in rows:
        s = shops.get(o["shop_id"])
        if s is None:
            continue
        b = shop_brief(s, lat, lon)
        if radius_km and b["distance_m"] > radius_km * 1000:
            hidden["radius"] += 1
        elif installment and not b["installment"]:
            hidden["installment"] += 1
        elif open_now and b["open"]["state"] != "open":
            hidden["open_now"] += 1
        elif warranty and not _has_warranty(warranty_label(o)):
            hidden["warranty"] += 1
        else:
            items.append(_rank_one(o, b, cheapest, len(ok_prices)))

    # One row per shop: keep its best-scoring listing and count the others.
    per_shop: dict[str, Json] = {}
    for it in sorted(items, key=SORT_KEYS["best"]):
        sid = it["shop"]["shop_id"]
        if sid in per_shop:
            per_shop[sid]["other_listings"] += 1
        else:
            per_shop[sid] = {**it, "other_listings": 0}
    items = sorted(per_shop.values(), key=SORT_KEYS.get(sort, SORT_KEYS["best"]))
    if items and sort == "best":
        items[0]["badge"] = "پیشنهاد دستیار"
    return {"items": items, "hidden": dict(hidden), "total": len(rows), "clusters": clusters(items)}


def clusters(items: list[Json]) -> list[Json]:
    """Shops for the same product inside one mall — compare them all in a single visit."""
    groups: dict[str, list[str]] = {}
    for it in items:
        if p := it["shop"]["passage"]:
            ids = groups.setdefault(p, [])
            if it["shop"]["shop_id"] not in ids:
                ids.append(it["shop"]["shop_id"])
    return [{"passage": k, "shop_ids": v, "count": len(v)} for k, v in groups.items() if len(v) > 1]


def maybe_shops(pid: str, lat: float, lon: float, limit: int = 8) -> list[Json]:
    """Shops active in the product's category that did NOT list it — stock is unknown, shown separately."""
    rows = product_rows([pid])
    if not rows or not rows[0]["category"]:
        return []
    c = db.catalog()
    have = {x[0] for x in c.execute("SELECT shop_id FROM offers WHERE product_id=?", (pid,))}
    ids = [x[0] for x in c.execute("SELECT shop_id FROM shop_categories WHERE category=?", (rows[0]["category"],))]
    shops = shop_index()
    out = [{**shop_brief(shops[i], lat, lon), "stock": "category_only"} for i in ids if i not in have and i in shops]
    out.sort(key=lambda s: s["distance_m"])
    return out[:limit]


def alternatives(pid: str, lat: float, lon: float, budget_max: int | None = None, installment: bool = False,
                 limit: int = 6) -> list[Json]:
    """Same-category products in a similar price band that are listed in shops near the user."""
    rows = product_rows([pid])
    if not rows or not rows[0]["category"]:
        return []
    ref_row = rows[0]
    ref = ref_row["median_price"]
    lo, hi = (ref * 0.6, ref * 1.4) if ref else (0, 9e18)
    if budget_max:
        hi = min(hi, budget_max * 1.05)
    cand = db.catalog().execute(
        "SELECT * FROM products WHERE category=? AND product_id<>? AND priced_count>0 "
        "AND median_price BETWEEN ? AND ? ORDER BY offer_count DESC LIMIT 200",
        (ref_row["category"], pid, lo, hi)).fetchall()
    base_title = normalize(ref_row["title"])
    base_tokens = set(base_title.split())
    near = availability([x["product_id"] for x in cand], lat, lon, 8, installment)

    scored: list[tuple[float, Json]] = []
    for x in cand:
        n = near.get(x["product_id"])
        title = normalize(x["title"])
        if not n or title == base_title:
            continue
        similarity = len(base_tokens & set(title.split())) / max(1, len(base_tokens))
        same_brand = bool(x["brand"]) and x["brand"] == ref_row["brand"]
        price_close = 1 - abs((x["median_price"] or 0) - (ref or 0)) / max(ref or 1, 1)
        s = 2 * similarity + (0.5 if same_brand else 0) + 0.8 * price_close + 0.4 * math.log1p(n["count"])

        why = [f"همان برند ({x['brand']})"] if same_brand else []
        if ref and x["median_price"]:
            diff = (x["median_price"] - ref) / ref
            why.append("ارزان‌تر" if diff < -0.05 else "گران‌تر" if diff > 0.05 else "هم‌قیمت")
        why.append(f"در {n['count']} فروشگاه نزدیک" + (f" (نزدیک‌ترین {fmt_dist(n['nearest_m'])})" if n["nearest_m"] else ""))
        scored.append((s, {**product_card(x, n), "why": "، ".join(why)}))
    scored.sort(key=lambda t: -t[0])
    return [card for _, card in scored[:limit]]
