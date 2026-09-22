from __future__ import annotations

import math
from abc import ABC, abstractmethod


class Provider(ABC):
    name: str = "base"
    model: str = ""
    dim: int = 0

    @abstractmethod
    def embed(self, texts: list[str], kind: str = "passage") -> list[list[float]]:
        """kind: 'passage' (documentos) o 'query' (consultas). Vectores normalizados (norma L2 = 1)."""

    def embed_one(self, text: str, kind: str = "query") -> list[float]:
        return self.embed([text], kind)[0]


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def normalize(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]
