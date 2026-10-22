"""Understanding the shopper's need and recommending models.

The LLM is optional: every function has a deterministic, rule-based fallback so the app keeps
working when the budget cap is hit or the provider is unreachable.
"""
from __future__ import annotations

from typing import Any

from . import catalog, llm

Json = dict[str, Any]

INTENT_SYS = """تو دستیار خرید حضوری در بازار تهران هستی. پیام کاربر را به JSON تبدیل کن:
{"keywords": "عبارت جستجوی کوتاه محصول به فارسی، همان‌طور که در عنوان کالاهای ترب می‌آید",
 "alt_keywords": ["حداکثر ۲ عبارت جایگزین/مترادف"],
 "budget_min": عدد تومان یا null, "budget_max": عدد تومان یا null,
 "brand": "برند یا null", "use_case": "کاربرد/نیاز کاربر یا null",
 "must_have": ["ویژگی‌های مهم برای این نیاز، حداکثر ۴"],
 "understood": "یک جمله کوتاه: چه فهمیدی",
 "advice": "۱-۲ جمله نکته خرید برای کسی که مدل مناسب را نمی‌داند",
 "questions": [{"q": "سؤال کوتاه برای دقیق‌کردن نیاز", "options": ["۲ تا ۴ گزینه کوتاه"]}]}
questions فقط وقتی نیاز مبهم است (حداکثر ۲). ۱ میلیون = 1000000 تومان. فقط JSON."""

RECO_SYS = """تو مشاور خرید هستی. از بین کالاهای فهرست، حداکثر ۳ مورد که با نیاز کاربر بهتر جور است انتخاب کن.
فقط از اطلاعات داده‌شده استفاده کن و چیزی از خودت درباره مشخصات نساز. خروجی JSON:
{"picks": [{"product_id": "...", "reason": "دلیل کوتاه فارسی، با اشاره به قیمت/مشخصه/تعداد فروشنده"}],
 "tip": "یک جمله نکته برای انتخاب نهایی"}"""


def _rules(message: str) -> Json:
    bmin, bmax, rest = catalog.parse_budget(message)
    return {
        "keywords": " ".join(catalog.keywords(rest)) or message, "alt_keywords": [],
        "budget_min": bmin, "budget_max": bmax, "brand": None, "use_case": None, "must_have": [],
        "understood": None, "advice": None, "questions": [], "source": "rules",
    }


def _str_list(v: Any, n: int) -> list[str]:
    return [x for x in (v or []) if isinstance(x, str) and x.strip()][:n] if isinstance(v, list) else []


def understand(message: str, use_llm: bool = True) -> Json:
    base = _rules(message)
    out = llm.chat_json(INTENT_SYS, message) if use_llm else None
    if not out or not isinstance(out.get("keywords"), str) or not out["keywords"].strip():
        return base

    merged = dict(base)
    for k in ("keywords", "brand", "use_case", "understood", "advice"):
        if isinstance(out.get(k), str) and out[k].strip():
            merged[k] = out[k].strip()
    for k in ("budget_min", "budget_max"):
        v = out.get(k)
        if isinstance(v, (int, float)) and v > 0:
            merged[k] = int(v)
    merged["alt_keywords"] = _str_list(out.get("alt_keywords"), 2)
    merged["must_have"] = _str_list(out.get("must_have"), 4)
    merged["questions"] = [
        {"q": q["q"], "options": _str_list(q.get("options"), 4)}
        for q in (out.get("questions") or [])
        if isinstance(q, dict) and isinstance(q.get("q"), str) and _str_list(q.get("options"), 4)
    ][:2]
    merged["source"] = "llm"
    return merged


def _spec_summary(specs: list[Json], n: int = 8) -> str:
    short = [f"{s.get('key')}: {s['value']}" for s in specs if s.get("value") and len(str(s["value"])) < 40]
    return "؛ ".join(short[:n])


def recommend(need: str, items: list[Json]) -> Json:
    """Pick up to three products for the need, with a short grounded reason each."""
    if not items:
        return {"picks": [], "tip": None, "source": "rules"}
    lines = []
    for p in items[:8]:
        detail = catalog.product_detail(p["product_id"]) or {}
        lines.append(f"- id={p['product_id']} | {p['title']} | قیمت میانه {p['price']['median'] or 'نامشخص'} تومان | "
                     f"{p['offer_count']} فروشنده | {_spec_summary(detail.get('specs', []))}")
    out = llm.chat_json(RECO_SYS, f"نیاز کاربر: {need}\nکالاها:\n" + "\n".join(lines))
    ids = {p["product_id"] for p in items}
    if out and isinstance(out.get("picks"), list):
        picks = [{"product_id": x["product_id"], "reason": str(x.get("reason") or "")}
                 for x in out["picks"] if isinstance(x, dict) and x.get("product_id") in ids][:3]
        if picks:
            tip = out.get("tip") if isinstance(out.get("tip"), str) else None
            return {"picks": picks, "tip": tip, "source": "llm"}

    top = sorted(items[:8], key=lambda p: (-p["near"]["count"], p["price"]["median"] or 9e18))[:3]
    return {
        "picks": [{"product_id": p["product_id"],
                   "reason": f"در {p['near']['count']} فروشگاه نزدیک ثبت شده" if p["near"]["count"] else "بیشترین فروشنده"}
                  for p in top],
        "tip": None, "source": "rules",
    }
