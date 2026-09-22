"""Proveedor `hash`: vectores léxicos deterministas sin red. Espejo exacto de frontend/src/search/hash.ts.

Algoritmo:
  tokens = palabras normalizadas (sin tildes) + trigramas de caracteres con espacios de borde
  cada token t suma sign(h) en la dimensión |h| mod D, con h = FNV-1a 32 bits de t
  las palabras pesan 2.0, los trigramas 1.0; el vector se normaliza (L2).
"""
from __future__ import annotations

from .base import Provider, normalize
from ..text import char_ngrams, tokens

D = 256


def fnv1a(s: str) -> int:
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


class HashProvider(Provider):
    name = "hash"
    model = "fnv1a-trigram-256"
    dim = D

    def embed(self, texts: list[str], kind: str = "passage") -> list[list[float]]:
        return [self._one(t) for t in texts]

    @staticmethod
    def _one(text: str) -> list[float]:
        v = [0.0] * D
        for w in tokens(text):
            h = fnv1a("w:" + w)
            v[h % D] += 2.0 if (h & 0x80000000) == 0 else -2.0
        for g in char_ngrams(text, 3):
            h = fnv1a("g:" + g)
            v[h % D] += 1.0 if (h & 0x80000000) == 0 else -1.0
        return normalize(v)
