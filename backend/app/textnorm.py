"""Persian text normalization shared by indexing and querying."""
import re

_MAP = str.maketrans({
    "ي": "ی", "ى": "ی", "ئ": "ی", "ك": "ک", "ة": "ه", "ۀ": "ه", "أ": "ا", "إ": "ا", "آ": "ا", "ؤ": "و",
    "‌": " ", "‏": " ", "‎": " ", "ـ": "",
    **{c: str(i) for i, c in enumerate("۰۱۲۳۴۵۶۷۸۹")},
    **{c: str(i) for i, c in enumerate("٠١٢٣٤٥٦٧٨٩")},
})
_DIACRITICS = re.compile(r"[ً-ٰٟ]")
_NONWORD = re.compile(r"[^\w\s]+")
_SPACES = re.compile(r"\s+")


def normalize(text: str) -> str:
    if not text:
        return ""
    t = _DIACRITICS.sub("", text.translate(_MAP)).lower()
    t = _NONWORD.sub(" ", t)
    return _SPACES.sub(" ", t).strip()
