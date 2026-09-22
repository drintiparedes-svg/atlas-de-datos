"""Índice de vectores por nodo: texto representativo, cálculo y archivo lateral `*.vectors.json`."""
from __future__ import annotations

import json
from pathlib import Path

from .base import Provider, cosine

SEARCHABLE_KINDS = ("element", "section", "vocabulary", "source", "project_root")


def node_text(n: dict, profile: dict | None = None) -> str:
    """Texto que representa al nodo para el índice: nombre, descripción o nota, facetas legibles."""
    parts = [n.get("name", "")]
    if n.get("description"):
        parts.append(n["description"])
    if n.get("note"):
        parts.append(n["note"])
    f = n.get("facets") or {}
    for k in ("data_type", "info_domain", "sensitivity", "element_kind"):
        if f.get(k):
            label = f[k]
            if profile:
                label = profile.get("facets", {}).get(k, {}).get("values", {}).get(f[k], {}).get("label", f[k])
            parts.append(str(label))
    if n.get("value_domain"):
        parts.append(" ".join(map(str, n["value_domain"][:12])))
    return ". ".join(str(p) for p in parts if p)


def build_index(agf: dict, provider: Provider, profile: dict | None = None) -> dict:
    nodes = [n for n in agf["nodes"] if n["kind"] in SEARCHABLE_KINDS]
    texts = [node_text(n, profile) for n in nodes]
    vecs = provider.embed(texts, "passage") if texts else []
    return {"provider": provider.name, "model": provider.model, "dim": provider.dim or (len(vecs[0]) if vecs else 0),
            "project_id": agf["project"]["id"], "ids": [n["id"] for n in nodes], "vectors": [[round(x, 5) for x in v] for v in vecs]}


def sidecar_path(agf_path: str | Path) -> Path:
    p = Path(agf_path)
    name = p.name
    if name.endswith(".agf.json"):
        name = name[: -len(".agf.json")]
    else:
        name = p.stem
    return p.with_name(name + ".vectors.json")


def save_index(index: dict, agf_path: str | Path) -> Path:
    out = sidecar_path(agf_path)
    out.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return out


def load_index(agf_path: str | Path) -> dict | None:
    p = sidecar_path(agf_path)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def top_k(query_vec: list[float], index: dict, k: int = 10, exclude: set[str] | None = None) -> list[tuple[str, float]]:
    scored = [(nid, cosine(query_vec, v)) for nid, v in zip(index["ids"], index["vectors"]) if not exclude or nid not in exclude]
    scored.sort(key=lambda x: -x[1])
    return scored[:k]
