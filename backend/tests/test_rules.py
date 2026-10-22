from datetime import datetime

import pytest

from app import catalog, geo
from app.i18n import fa_digits, localize
from app.textnorm import normalize


@pytest.mark.parametrize("text,expected", [
    ("هندزفری زیر ۳ میلیون", (None, 3_000_000)),
    ("گوشی تا 15 میلیون", (None, 15_000_000)),
    ("ساعت بین ۲ تا ۵ میلیون", (2_000_000, 5_000_000)),
    ("کابل حداکثر ۵۰۰ هزار تومان", (None, 500_000)),
    ("لپتاپ بالای ۴۰ میلیون", (40_000_000, None)),
    ("جارو برقی", (None, None)),
])
def test_parse_budget(text, expected):
    assert catalog.parse_budget(text)[:2] == expected


def test_normalize_unifies_arabic_letters_digits_and_zwnj():
    assert normalize("كيف‌پول ۱۲") == "کیف پول 12"


def test_keywords_drop_filler_words():
    assert catalog.keywords("یه هندزفری بلوتوث میخوام برای دویدن") == ["هندزفری", "بلوتوث", "دویدن"]


def test_fa_digits_keeps_model_names_latin():
    assert fa_digits("Soundcore R50i با 2,190,000 تومان") == "Soundcore R50i با ۲٬۱۹۰٬۰۰۰ تومان"


def test_localize_only_touches_text_fields():
    out = localize({"price": 1200, "label": "تا 19:00", "shop_id": "shop_12", "reasons": ["3 روز پیش"]})
    assert out == {"price": 1200, "label": "تا ۱۹:۰۰", "shop_id": "shop_12", "reasons": ["۳ روز پیش"]}


HOURS = {d: {"status": "declared", "shifts": [{"start_time": "10:00:00", "end_time": "19:00:00"}]}
         for d in ("sat", "sun", "mon", "tue", "wed")}
HOURS["thu"] = {"status": "declared", "shifts": [{"start_time": "10:00:00", "end_time": "14:00:00"}]}
HOURS["fri"] = {"status": "closed", "shifts": []}


def at(day, hhmm):  # 2026-10-24 is a Saturday
    base = {"sat": 24, "sun": 25, "mon": 26, "tue": 27, "wed": 28, "thu": 29, "fri": 30}[day]
    h, m = map(int, hhmm.split(":"))
    return datetime(2026, 10, base, h, m, tzinfo=geo.TEHRAN)


def test_open_status_open_closing_soon_and_closed():
    assert geo.open_status(HOURS, at("sat", "12:00"))["state"] == "open"
    soon = geo.open_status(HOURS, at("sat", "18:30"))
    assert soon["state"] == "open" and soon["closing_soon"]
    assert geo.open_status(HOURS, at("sat", "08:00"))["opens_at"] == "امروز 10:00"


def test_open_status_skips_friday_to_saturday():
    st = geo.open_status(HOURS, at("thu", "20:00"))
    assert st["state"] == "closed" and st["opens_at"] == "شنبه 10:00"


def test_open_status_unknown_without_hours():
    assert geo.open_status({}, at("sat", "12:00"))["state"] == "unknown"


def test_overnight_shift_spills_past_midnight():
    hours = {"sat": {"status": "declared", "shifts": [{"start_time": "18:00:00", "end_time": "02:00:00"}]}}
    assert geo.open_status(hours, at("sun", "01:00"))["state"] == "open"


def test_travel_minutes_switches_mode():
    assert geo.travel_minutes(750) == (10, "walk")
    assert geo.travel_minutes(5000)[1] == "ride"
