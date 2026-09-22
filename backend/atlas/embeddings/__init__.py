"""Proveedores de vectores (embeddings) para búsqueda semántica y propuestas de relación.

Proveedores:
  hash    Determinista y sin dependencias ni red: n-gramas de caracteres y palabras proyectados
          por hashing a 256 dimensiones. Se replica de forma idéntica en el visor (TypeScript),
          por lo que las consultas libres del navegador funcionan sin modelo. Es una similitud
          léxica robusta a tildes y errores; no captura sinónimos.
  st      Modelos abiertos vía sentence-transformers. Predeterminado: intfloat/multilingual-e5-small
          (licencia MIT, 384 dimensiones, multilingüe). Alternativa: paraphrase-multilingual-MiniLM-L12-v2.
          Descarga los pesos una sola vez (Hugging Face) y luego opera sin red (HF_HUB_OFFLINE=1).
  ollama  Modelos abiertos servidos localmente por Ollama (p. ej. nomic-embed-text, bge-m3) en
          http://localhost:11434. Sin datos fuera del equipo.

Selección: variable ATLAS_EMBEDDINGS = off | hash | st[:modelo] | ollama[:modelo], o parámetro --provider.
Con AI_ENABLED=false (predeterminado) solo se permite `hash`.
"""
from __future__ import annotations

import os

from .base import Provider
from .hashing import HashProvider


def get_provider(spec: str | None = None) -> Provider | None:
    spec = (spec or os.environ.get("ATLAS_EMBEDDINGS") or "hash").strip()
    if spec in ("off", "none", ""):
        return None
    name, _, model = spec.partition(":")
    ai_enabled = os.environ.get("AI_ENABLED", "false").lower() in ("1", "true", "yes")
    if name == "hash":
        return HashProvider()
    if not ai_enabled:
        raise RuntimeError(f"El proveedor «{name}» requiere AI_ENABLED=true (guardrail: sin modelos externos por defecto). "
                           "Use --provider hash o exporte AI_ENABLED=true.")
    if name == "st":
        from .st import SentenceTransformersProvider
        return SentenceTransformersProvider(model or None)
    if name == "ollama":
        from .ollama import OllamaProvider
        return OllamaProvider(model or None)
    raise ValueError(f"proveedor de embeddings desconocido: {spec}")


__all__ = ["Provider", "HashProvider", "get_provider"]
