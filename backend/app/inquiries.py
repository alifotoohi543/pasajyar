"""Agent ↔ shop inquiries: send questions, track replies, follow up with alternatives.

Shop phone numbers in the dataset are fake, so a shop answers either from the seller panel
(/seller) or — unless a seller has "claimed" it there — through a clearly labelled, deterministic
simulation whose answers are derived from the dataset (price freshness, opening hours, installments).
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import time
import uuid
from typing import Any

from . import catalog, config, db, geo

Json = dict[str, Any]

SENT, SEEN, ANSWERED, NO_ANSWER = "sent", "seen", "answered", "no_answer"
PENDING = (SENT, SEEN)

QUESTIONS = {
    "stock": "الان موجود است؟",
    "price": "قیمت نهایی نقدی چند است؟",
    "installment": "امکان خرید اقساطی دارید؟ با چه سرویسی؟",
    "warranty": "گارانتی‌اش چیست و چند ماهه است؟",
    "color": "چه رنگ/مدل‌هایی موجود دارید؟",
    "hours": "امروز تا چه ساعتی باز هستید؟",
    "hold": "اگر موجود است، لطفاً تا ساعت {visit} برایم کنار بگذارید.",
}
DEFAULT_QUESTIONS = ["stock", "price"]
MAX_SHOPS_PER_BATCH = 8


def _question_text(key: str, visit_at: str | None) -> str:
    return QUESTIONS[key].format(visit=visit_at or "امروز عصر")


def compose(product_title: str, listed_price: int | None, questions: list[str], visit_at: str | None,
            note: str | None) -> str:
    """The message the agent sends to a shop."""
    lines = ["سلام، وقت بخیر.",
             f"از طرف یک مشتری درباره «{product_title}» پیام می‌دهم"
             + (f" که در ترب با قیمت {listed_price:,} تومان ثبت کرده‌اید." if listed_price else ".")]
    lines += [f"{i}. {_question_text(q, visit_at)}" for i, q in enumerate(questions, 1)]
    if visit_at:
        lines.append(f"مشتری حدود ساعت {visit_at} حضوری مراجعه می‌کند.")
    if note:
        lines.append(f"توضیح مشتری: {note}")
    lines.append("ممنون از پاسخ‌تان 🙏")
    return "\n".join(lines)


def create(client_id: str, product_id: str, offer_ids: list[str], questions: list[str], visit_at: str | None,
           note: str | None, lat: float, lon: float) -> str | None:
    questions = [q for q in dict.fromkeys(questions) if q in QUESTIONS] or DEFAULT_QUESTIONS
    cat = db.catalog()
    product = cat.execute("SELECT title FROM products WHERE product_id=?", (product_id,)).fetchone()
    if product is None:
        return None
    batch_id, now, rows = uuid.uuid4().hex[:12], time.time(), []
    for oid in list(dict.fromkeys(offer_ids))[:MAX_SHOPS_PER_BATCH]:
        o = cat.execute("SELECT shop_id, price, price_flag FROM offers WHERE offer_id=? AND product_id=?",
                        (oid, product_id)).fetchone()
        if o is None:
            continue
        listed = o["price"] if o["price_flag"] == "ok" else None
        rows.append((uuid.uuid4().hex[:12], batch_id, client_id, product_id, product["title"], oid, o["shop_id"], listed,
                     json.dumps(questions), visit_at, note, compose(product["title"], listed, questions, visit_at, note),
                     SENT, now, None, None, None, lat, lon))
    if not rows:
        return None
    with db.state() as c:
        c.executemany("INSERT INTO inquiries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    return batch_id


# ---------------------------------------------------------------- simulation (demo only)

def _rand(seed: str, n: int) -> float:
    """Deterministic pseudo-random number in [0, 1) so a given inquiry always gets the same answer."""
    return int(hashlib.md5(f"{seed}:{n}".encode()).hexdigest(), 16) % 10_000 / 10_000


_NOTES_YES = ["بفرمایید، منتظرتان هستیم.", "موجود داریم، فقط زودتر تشریف بیاورید.",
              "قیمت امروز همین است، فردا ممکن است تغییر کند."]
_NOTES_NO = ["متأسفانه فعلاً تمام کرده‌ایم.", "این مدل را نداریم ولی مدل مشابه داریم، تشریف بیاورید ببینید.",
             "هفته بعد شارژ می‌شود."]
_WARRANTIES = ["۱۸ ماه گارانتی شرکتی", "۶ ماه گارانتی فروشگاه", "تست و تحویل حضوری، بدون گارانتی"]
_COLORS = ["مشکی", "سفید", "آبی", "نقره‌ای"]
_AVAIL_BY_FRESHNESS = {"fresh": 0.8, "recent": 0.65, "old": 0.45, "stale": 0.3, "unknown": 0.4}


def _simulated_reply(row: sqlite3.Row, shop: sqlite3.Row | None) -> Json:
    r = lambda n: _rand(row["id"], n)
    offer = db.catalog().execute("SELECT changed_at FROM offers WHERE offer_id=?", (row["offer_id"],)).fetchone()
    fresh = catalog.freshness(offer["changed_at"])["level"] if offer else "unknown"
    available = r(3) < _AVAIL_BY_FRESHNESS[fresh]
    qs = json.loads(row["questions"])
    reply: Json = {"available": available, "simulated": True}
    if available:
        base = row["listed_price"] or (catalog.product_rows([row["product_id"]]) or [{"median_price": None}])[0]["median_price"]
        if base and ("price" in qs or row["listed_price"] is None):
            drift = -0.03 + r(4) * 0.09 if fresh in ("fresh", "recent") else 0.02 + r(4) * 0.2  # stale prices drift up
            reply["price"] = int(round(base * (1 + drift), -4))
        if "installment" in qs:
            providers = json.loads(shop["installment_providers"] or "[]") if shop else []
            reply["installment"] = f"بله، با {'، '.join(providers)}" if providers else "نه، فقط نقدی و کارت"
        if "warranty" in qs:
            reply["warranty"] = _WARRANTIES[int(r(5) * len(_WARRANTIES))]
        if "color" in qs:
            reply["colors"] = _COLORS[: 1 + int(r(6) * 3)]
        if "hold" in qs:
            reply["hold_until"] = row["visit_at"] or "۲ ساعت"
        reply["note"] = _NOTES_YES[int(r(7) * len(_NOTES_YES))]
    else:
        reply["note"] = _NOTES_NO[int(r(8) * len(_NOTES_NO))]
    if "hours" in qs and shop:
        reply["hours"] = catalog.open_status(shop["shop_id"])["label"]
    return reply


def _advance(c: sqlite3.Connection, row: sqlite3.Row, claimed: set[str]) -> None:
    """Move one pending inquiry along its simulated timeline."""
    if row["shop_id"] in claimed:
        return  # a human answers from the seller panel
    shop = catalog.shop_index().get(row["shop_id"])
    shop_state = catalog.open_status(shop["shop_id"])["state"] if shop else "unknown"
    age = time.time() - row["created_at"]
    silent = _rand(row["id"], 1) < (config.SIM_SILENT_CLOSED_P if shop_state == "closed" else config.SIM_SILENT_OPEN_P)
    reply_after = config.SIM_REPLY_MIN_S + _rand(row["id"], 2) * (config.SIM_REPLY_MAX_S - config.SIM_REPLY_MIN_S)
    seen_at = row["created_at"] + config.SIM_SEEN_S

    if row["status"] == SENT and age >= config.SIM_SEEN_S and not (silent and shop_state == "closed"):
        c.execute("UPDATE inquiries SET status=?, seen_at=? WHERE id=?", (SEEN, seen_at, row["id"]))
    if silent:
        if age >= config.SIM_TIMEOUT_S:
            c.execute("UPDATE inquiries SET status=? WHERE id=?", (NO_ANSWER, row["id"]))
        return
    if age >= reply_after:
        c.execute("UPDATE inquiries SET status=?, answered_at=?, reply=?, seen_at=COALESCE(seen_at, ?) WHERE id=?",
                  (ANSWERED, row["created_at"] + reply_after,
                   json.dumps(_simulated_reply(row, shop), ensure_ascii=False), seen_at, row["id"]))


def _load(where: str, args: tuple) -> list[sqlite3.Row]:
    """Fetch inquiries, advancing pending simulated ones first."""
    with db.state() as c:
        rows = c.execute(f"SELECT * FROM inquiries WHERE {where} ORDER BY created_at DESC", args).fetchall()
        pending = [r for r in rows if r["status"] in PENDING]
        if pending:
            claimed = {x[0] for x in c.execute("SELECT shop_id FROM claimed_shops")}
            for r in pending:
                _advance(c, r, claimed)
            rows = c.execute(f"SELECT * FROM inquiries WHERE {where} ORDER BY created_at DESC", args).fetchall()
    return rows


# ---------------------------------------------------------------- read models

def _view(row: sqlite3.Row) -> Json:
    shop = catalog.shop_index().get(row["shop_id"])
    keys = json.loads(row["questions"])
    return {
        "id": row["id"], "batch_id": row["batch_id"], "product_id": row["product_id"],
        "product_title": row["product_title"], "offer_id": row["offer_id"], "listed_price": row["listed_price"],
        "questions": [_question_text(q, row["visit_at"]) for q in keys], "question_keys": keys,
        "visit_at": row["visit_at"], "note": row["note"], "message": row["message"], "status": row["status"],
        "created_at": row["created_at"], "seen_at": row["seen_at"], "answered_at": row["answered_at"],
        "reply": json.loads(row["reply"]) if row["reply"] else None,
        "shop": catalog.shop_brief(shop, row["user_lat"], row["user_lon"]) if shop else None,
    }


def _price_of(i: Json) -> float:
    return (i["reply"] or {}).get("price") or i["listed_price"] or 9e18


def summarize(batch_id: str, items: list[Json]) -> Json:
    done = [i for i in items if i["status"] in (ANSWERED, NO_ANSWER)]
    yes = [i for i in items if i["reply"] and i["reply"].get("available")]
    return {
        "batch_id": batch_id, "product_id": items[0]["product_id"], "product_title": items[0]["product_title"],
        "created_at": min(i["created_at"] for i in items), "visit_at": items[0]["visit_at"],
        "items": sorted(items, key=lambda i: (i["status"] != ANSWERED, not (i["reply"] or {}).get("available"), _price_of(i))),
        "counts": {"total": len(items), "done": len(done), "available": len(yes), "pending": len(items) - len(done)},
    }


def batches(client_id: str) -> list[Json]:
    grouped: dict[str, list[Json]] = {}
    for r in _load("client_id=?", (client_id,)):
        grouped.setdefault(r["batch_id"], []).append(_view(r))
    return [summarize(b, items) for b, items in grouped.items()]


def batch(batch_id: str) -> Json | None:
    rows = _load("batch_id=?", (batch_id,))
    if not rows:
        return None
    s = summarize(batch_id, [_view(r) for r in rows])
    s["agent"] = follow_up(s, rows[0]["user_lat"], rows[0]["user_lon"])
    return s


def follow_up(s: Json, lat: float, lon: float) -> Json:
    """The agent's next step once replies (or silence) come in."""
    yes = [i for i in s["items"] if i["reply"] and i["reply"].get("available") and i["shop"]]
    out: Json = {"state": "waiting", "message": "منتظر پاسخ فروشگاه‌ها هستم…", "best": None,
                 "route": None, "more_shops": [], "alternatives": []}
    if yes:
        # Cheapest confirmed price, lightly penalised by distance (≈5% per kilometre).
        best = min(yes, key=lambda i: _price_of(i) * (1 + i["shop"]["distance_m"] / 20000))
        price = best["reply"].get("price") or best["listed_price"]
        verb = "کرد" if len(yes) == 1 else "کردند"
        out.update(state="found", best=best["id"], route=visit_route(yes, lat, lon),
                   message=f"{len(yes)} فروشگاه موجودی را تأیید {verb}. بهترین گزینه: «{best['shop']['name']}»"
                           + (f" با {price:,} تومان" if price else "")
                           + f"، {catalog.fmt_dist(best['shop']['distance_m'])} از شما.")
    finished = s["counts"]["pending"] == 0
    if finished and not yes:
        out.update(state="none", message="هیچ‌کدام از فروشگاه‌ها موجودی را تأیید نکردند. این گزینه‌ها را پیشنهاد می‌کنم:")
    if finished and len(yes) < 2:
        asked = {i["shop"]["shop_id"] for i in s["items"] if i["shop"]}
        ranked = catalog.rank_offers(s["product_id"], lat, lon, radius_km=15)["items"]
        out["more_shops"] = [x for x in ranked if x["shop"]["shop_id"] not in asked][:4]
        out["alternatives"] = catalog.alternatives(s["product_id"], lat, lon)[:4]
    return out


def visit_route(items: list[Json], lat: float, lon: float, max_stops: int = 5) -> Json:
    """Greedy nearest-neighbour visiting order plus a Google Maps multi-stop link."""
    left, here, order = list(items), (lat, lon), []
    while left:
        nxt = min(left, key=lambda i: geo.haversine_m(here[0], here[1], i["shop"]["lat"], i["shop"]["lon"]))
        order.append(nxt)
        left.remove(nxt)
        here = (nxt["shop"]["lat"], nxt["shop"]["lon"])
    order = order[:max_stops]
    points = [f"{lat},{lon}"] + [f"{i['shop']['lat']},{i['shop']['lon']}" for i in order]
    return {"stops": [{"inquiry_id": i["id"], "shop_id": i["shop"]["shop_id"], "name": i["shop"]["name"],
                       "passage": i["shop"]["passage"], "open": i["shop"]["open"]} for i in order],
            "link": "https://www.google.com/maps/dir/" + "/".join(points)}


# ---------------------------------------------------------------- seller side

def seller_inbox(shop_id: str) -> list[Json]:
    """Opening the panel claims the shop: from now on a human answers instead of the simulation."""
    now = time.time()
    with db.state() as c:
        c.execute("INSERT OR IGNORE INTO claimed_shops VALUES(?, ?)", (shop_id, now))
        c.execute("UPDATE inquiries SET status=?, seen_at=? WHERE shop_id=? AND status=?", (SEEN, now, shop_id, SENT))
        rows = c.execute("SELECT * FROM inquiries WHERE shop_id=? ORDER BY created_at DESC LIMIT 50", (shop_id,)).fetchall()
    return [_view(r) for r in rows]


def seller_reply(inquiry_id: str, reply: Json) -> bool:
    reply = {k: v for k, v in reply.items() if v not in (None, "")} | {"simulated": False}
    with db.state() as c:
        n = c.execute("UPDATE inquiries SET status=?, answered_at=?, reply=?, seen_at=COALESCE(seen_at, ?) WHERE id=?",
                      (ANSWERED, time.time(), json.dumps(reply, ensure_ascii=False), time.time(), inquiry_id)).rowcount
    return n > 0


def release_shop(shop_id: str) -> None:
    with db.state() as c:
        c.execute("DELETE FROM claimed_shops WHERE shop_id=?", (shop_id,))


def demo_shops(limit: int = 12) -> list[Json]:
    """Shops that received inquiries recently — the seller-panel picker."""
    with db.state() as c:
        rows = c.execute("SELECT shop_id, COUNT(*) AS n, MAX(created_at) AS t FROM inquiries "
                         "GROUP BY shop_id ORDER BY t DESC LIMIT ?", (limit,)).fetchall()
    idx = catalog.shop_index()
    return [{"shop_id": r["shop_id"], "name": idx[r["shop_id"]]["name"], "count": r["n"]} for r in rows if r["shop_id"] in idx]
