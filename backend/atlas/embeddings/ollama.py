"""Proveedor `ollama`: modelos abiertos servidos localmente (http://localhost:11434/api/embed)."""
from __future__ import annotations

import json
import os
import urllib.request

from .base import Provider, normalize

DEFAULT_MODEL = "nomic-embed-text"


class OllamaProvider(Provider):
    name = "ollama"

    def __init__(self, model: str | None = None, host: str | None = None):
        self.model = model or DEFAULT_MODEL
        self.host = (host or os.environ.get("OLLAMA_HOST") or "http://localhost:11434").rstrip("/")
        self.dim = 0

    def embed(self, texts: list[str], kind: str = "passage") -> list[list[float]]:
        body = json.dumps({"model": self.model, "input": texts}).encode("utf-8")
        req = urllib.request.Request(self.host + "/api/embed", data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.loads(r.read().decode("utf-8"))
        vecs = [normalize([float(x) for x in v]) for v in data["embeddings"]]
        if vecs:
            self.dim = len(vecs[0])
        return vecs
