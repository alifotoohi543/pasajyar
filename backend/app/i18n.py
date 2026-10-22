"""Persian presentation helpers applied at the API boundary."""
from __future__ import annotations

import re
from typing import Any

from fastapi.responses import JSONResponse

# Only human-readable fields are localised; ids, numbers, URLs and coordinates stay untouched.
FA_KEYS = frozenset({
    "label", "reasons", "cautions", "message", "why", "text", "hours", "hold_until", "opens_at", "closes_at",
    "understood", "advice", "reason", "tip", "note", "floor", "unit", "plaque", "warranty", "colors",
    "installment", "questions", "use_case", "must_have",
})
_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
_THOUSANDS = re.compile(r"(?<=\d),(?=\d{3})")
_STANDALONE_NUMBER = re.compile(r"(?<![A-Za-z0-9])[0-9]+(?![A-Za-z0-9])")  # keeps model names like "R50i" Latin


def fa_digits(text: str) -> str:
    text = _THOUSANDS.sub("٬", text)
    return _STANDALONE_NUMBER.sub(lambda m: m.group().translate(_DIGITS), text)


def localize(value: Any, active: bool = False) -> Any:
    if isinstance(value, dict):
        return {k: localize(v, k in FA_KEYS) for k, v in value.items()}
    if isinstance(value, list):
        return [localize(v, active) for v in value]
    if active and isinstance(value, str):
        return fa_digits(value)
    return value


class PersianJSONResponse(JSONResponse):
    def render(self, content: Any) -> bytes:
        return super().render(localize(content))
