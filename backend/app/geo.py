"""Distance, opening hours (Tehran time) and map deep links."""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

Hours = dict[str, Any]
Shift = tuple[int, int]  # minutes from midnight; end may exceed 1440 for overnight shifts

TEHRAN = timezone(timedelta(hours=3, minutes=30))  # Iran has observed no DST since 2022
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]  # datetime.weekday() order
WEEK_ORDER = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"]  # Persian week
FA_DAYS = {"sat": "شنبه", "sun": "یکشنبه", "mon": "دوشنبه", "tue": "سه‌شنبه",
           "wed": "چهارشنبه", "thu": "پنجشنبه", "fri": "جمعه"}
EARTH_RADIUS_M = 6_371_000
WALK_M_PER_MIN, RIDE_M_PER_MIN, WALK_LIMIT_M = 75, 250, 1500
CLOSING_SOON_MIN = 60


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def travel_minutes(meters: float) -> tuple[int, str]:
    """Rough Tehran estimate: walking up to 1.5 km, otherwise metro/taxi at ~15 km/h."""
    if meters <= WALK_LIMIT_M:
        return max(1, round(meters / WALK_M_PER_MIN)), "walk"
    return max(5, round(meters / RIDE_M_PER_MIN)), "ride"


def _minutes(t: str) -> int:
    h, m, *_ = (int(x) for x in t.split(":"))
    return h * 60 + m


def fmt(minutes: int) -> str:
    minutes %= 1440
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def day_shifts(hours: Hours | None, day: str) -> tuple[str, list[Shift]]:
    """-> ("open" | "closed" | "unknown", shifts). Torob's "unsupported" status means not declared."""
    d = (hours or {}).get(day)
    if not d or d.get("status") not in ("declared", "closed"):
        return "unknown", []
    if d["status"] == "closed":
        return "closed", []
    shifts = []
    for s in d.get("shifts") or []:
        a, b = _minutes(s["start_time"]), _minutes(s["end_time"])
        if a != b:
            shifts.append((a, b if b > a else b + 1440))
    return ("open", shifts) if shifts else ("unknown", [])


def open_status(hours: Hours | None, at: datetime | None = None) -> dict[str, Any]:
    """Current state for a shop: open (until when), closed (opens when) or unknown."""
    if not hours:
        return {"state": "unknown", "label": "ساعت کاری ثبت نشده"}
    now = (at or datetime.now(TEHRAN)).astimezone(TEHRAN)
    wd, cur = now.weekday(), now.hour * 60 + now.minute

    for _, end in day_shifts(hours, DAYS[(wd - 1) % 7])[1]:  # yesterday's shift running past midnight
        if end > 1440 and cur < end - 1440:
            return {"state": "open", "label": f"باز است تا {fmt(end)}", "closes_at": fmt(end)}

    state, shifts = day_shifts(hours, DAYS[wd])
    for start, end in shifts:
        if start <= cur < end:
            soon = end - cur <= CLOSING_SOON_MIN
            return {"state": "open", "label": f"باز است تا {fmt(end)}" + (" (به‌زودی می‌بندد)" if soon else ""),
                    "closes_at": fmt(end), "closing_soon": soon}
    if state == "unknown" and all(day_shifts(hours, d)[0] != "open" for d in DAYS):
        return {"state": "unknown", "label": "ساعت کاری نامشخص"}
    for start, _ in shifts:
        if cur < start:
            return {"state": "closed", "label": f"بسته — امروز از {fmt(start)} باز می‌شود", "opens_at": f"امروز {fmt(start)}"}
    for i in range(1, 8):
        day = DAYS[(wd + i) % 7]
        st, sh = day_shifts(hours, day)
        if st == "open":
            when = "فردا" if i == 1 else FA_DAYS[day]
            return {"state": "closed", "label": f"بسته — {when} از {fmt(sh[0][0])}", "opens_at": f"{when} {fmt(sh[0][0])}"}
    return {"state": "unknown", "label": "ساعت کاری نامشخص"}


def week_table(hours: Hours | None) -> list[dict[str, str]]:
    rows = []
    for d in WEEK_ORDER:
        st, sh = day_shifts(hours, d)
        text = "تعطیل" if st == "closed" else "نامشخص" if st == "unknown" else "، ".join(f"{fmt(a)} تا {fmt(b)}" for a, b in sh)
        rows.append({"day": FA_DAYS[d], "status": st, "text": text})
    return rows


def map_links(lat: float, lon: float, passage: str | None = None, area: str | None = None) -> dict[str, str]:
    links = {
        "google": f"https://www.google.com/maps/search/?api=1&query={lat},{lon}",
        "google_route": f"https://www.google.com/maps/dir/?api=1&destination={lat},{lon}",
        "neshan": f"https://neshan.org/maps/@{lat},{lon},17z",
        "balad": f"https://balad.ir/location?latitude={lat}&longitude={lon}&zoom=17",
    }
    if passage:  # the mall is easy to find by name even when the exact unit is not
        q = " ".join(x for x in (passage, area, "تهران") if x)
        links["google_passage"] = f"https://www.google.com/maps/search/?api=1&query={quote(q)}"
    return links
