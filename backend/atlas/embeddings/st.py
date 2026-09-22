"""Proveedor `st`: sentence-transformers con modelos abiertos multilingües.

Predeterminado intfloat/multilingual-e5-small (MIT). Los modelos e5 esperan prefijos
«query: » y «passage: ». Instalación: pip install "atlas-de-datos[ai]" (o sentence-transformers).
"""
from __future__ import annotations

from .base import Provider

DEFAULT_MODEL = "intfloat/multilingual-e5-small"


class SentenceTransformersProvider(Provider):
    name = "st"

    def __init__(self, model: str | None = None):
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as e:  # pragma: no cover
            raise RuntimeError("sentence-transformers no está instalado: pip install 'atlas-de-datos[ai]'") from e
        self.model = model or DEFAULT_MODEL
        self._m = SentenceTransformer(self.model)
        self.dim = int(self._m.get_sentence_embedding_dimension() or 0)
        self._e5 = "e5" in self.model.lower()

    def embed(self, texts: list[str], kind: str = "passage") -> list[list[float]]:
        if self._e5:
            texts = [f"{'query' if kind == 'query' else 'passage'}: {t}" for t in texts]
        out = self._m.encode(texts, normalize_embeddings=True, batch_size=32, show_progress_bar=False)
        return [[float(x) for x in row] for row in out]
