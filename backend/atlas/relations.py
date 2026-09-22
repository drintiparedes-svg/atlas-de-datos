"""Relaciones propuestas entre elementos (PLAN §6). Nunca se fusionan nodos: todo es arista `proposed`.

  same_as   entre fuentes distintas: nombre normalizado idéntico (0.95) o similitud combinada ≥ umbral
            (n-gramas de caracteres, Jaccard de palabras y coseno de vectores si hay índice).
  relates   vecinos semánticos dentro y entre fuentes (predicate: similar_to) para que un usuario no experto
            descubra «qué se parece a esto» sin modelo en el navegador.
"""
from __future__ import annotations

from .embeddings.base import cosine
from .text import char_ngrams, norm, tokens

DATA_KINDS = {"field", "column", "concept"}
STOP = {"de", "del", "la", "el", "los", "las", "en", "al", "y", "o", "con", "por", "a", "un", "una", "the", "of"}


def _jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def name_similarity(a: str, b: str) -> float:
    """Similitud léxica 0..1: mezcla de trigramas de caracteres y palabras (sin palabras vacías)."""
    ga, gb = set(char_ngrams(a)), set(char_ngrams(b))
    ta, tb = set(tokens(a)) - STOP, set(tokens(b)) - STOP
    return 0.5 * _jaccard(ga, gb) + 0.5 * _jaccard(ta, tb)


def propose(agf: dict, index: dict | None = None, same_as_threshold: float = 0.85, relates_threshold: float = 0.55,
            neighbors: int = 3) -> list[dict]:
    els = [n for n in agf["nodes"] if n["kind"] == "element"]
    vec = {nid: v for nid, v in zip(index["ids"], index["vectors"])} if index else {}
    existing = {(e["kind"], e["source"], e["target"]) for e in agf["edges"]}
    out: list[dict] = []
    k = sum(1 for e in agf["edges"] if e.get("id", "").startswith("r"))
    cand: dict[str, list[tuple[float, str, str]]] = {}
    for i, a in enumerate(els):
        for b in els[i + 1:]:
            lex = name_similarity(a["name"], b["name"])
            sem = cosine(vec[a["id"]], vec[b["id"]]) if a["id"] in vec and b["id"] in vec else None
            score = lex if sem is None else 0.5 * lex + 0.5 * max(0.0, sem)
            exact = norm(a["name"]) == norm(b["name"])
            same_words = (set(tokens(a["name"])) - STOP) == (set(tokens(b["name"])) - STOP) and bool(set(tokens(a["name"])) - STOP)
            cross = a.get("source_id") != b.get("source_id")
            datalike = all((x.get("facets") or {}).get("element_kind", "field") in DATA_KINDS for x in (a, b))
            if cross and datalike and (exact or same_words or score >= same_as_threshold):
                k += 1
                why = ("nombre normalizado idéntico" if exact else "mismas palabras (sin conectores ni guiones)" if same_words
                       else f"similitud léxica {lex:.2f}" + (f", semántica {sem:.2f}" if sem is not None else ""))
                e = {"id": f"r{k}", "kind": "same_as", "source": a["id"], "target": b["id"], "origin": "inferred",
                     "status": "proposed", "confidence": round(0.95 if exact else 0.9 if same_words else score, 3), "rationale": why, "layer": "link"}
                if ("same_as", a["id"], b["id"]) not in existing:
                    out.append(e)
            elif score >= relates_threshold and a.get("parent_id") != b.get("parent_id"):
                cand.setdefault(a["id"], []).append((score, b["id"], f"similitud {score:.2f}"))
                cand.setdefault(b["id"], []).append((score, a["id"], f"similitud {score:.2f}"))
    seen = set()
    for src, lst in cand.items():
        for score, tgt, why in sorted(lst, reverse=True)[:neighbors]:
            key = tuple(sorted((src, tgt)))
            if key in seen or ("relates", src, tgt) in existing:
                continue
            seen.add(key)
            k += 1
            out.append({"id": f"r{k}", "kind": "relates", "source": src, "target": tgt, "predicate": "similar_to",
                        "origin": "inferred", "status": "proposed", "confidence": round(score, 3), "rationale": why, "layer": "sim"})
    return out
