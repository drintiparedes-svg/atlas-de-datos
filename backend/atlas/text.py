"""Normalización de texto compartida (idéntica a frontend/src/lib/text.ts)."""
import hashlib
import re
import unicodedata

_DIACRITICS = re.compile(r"[̀-ͯ]")


def strip_accents(s: str) -> str:
    return _DIACRITICS.sub("", unicodedata.normalize("NFD", s))


def norm(s: str) -> str:
    """Minúsculas, sin tildes, espacios colapsados. Para comparar y buscar."""
    return re.sub(r"\s+", " ", strip_accents(s or "").lower()).strip()


def slug(s: str) -> str:
    """Regla de identificadores estables (docs/SPEC.md §4.6)."""
    s = strip_accents(s or "").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def short_hash(s: str, n: int = 6) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:n]


def tokens(s: str) -> list[str]:
    return [t for t in re.split(r"[^a-z0-9]+", norm(s)) if len(t) > 1]


def char_ngrams(s: str, n: int = 3) -> list[str]:
    t = " " + norm(s) + " "
    return [t[i:i + n] for i in range(max(0, len(t) - n + 1))]
