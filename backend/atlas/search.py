"""Búsqueda híbrida para la CLI y para pruebas: léxica (nombre normalizado, tokens) + vectores del índice."""
from __future__ import annotations

from .embeddings.base import cosine
from .text import norm, tokens


def lexical_score(query: str, n: dict) -> float:
    q, name = norm(query), norm(n.get("name", ""))
    if not q:
        return 0.0
    if q == name:
        return 1.0
    if q in name:
        return 0.8
    qt, nt = set(tokens(q)), set(tokens(name + " " + (n.get("description") or n.get("note") or "")))
    return 0.6 * len(qt & nt) / len(qt) if qt else 0.0


def search(agf: dict, query: str, index: dict | None = None, qvec: list[float] | None = None, k: int = 10) -> list[dict]:
    vec = {nid: v for nid, v in zip(index["ids"], index["vectors"])} if index else {}
    out = []
    for n in agf["nodes"]:
        if n["kind"] not in ("element", "section", "vocabulary", "source"):
            continue
        lex = lexical_score(query, n)
        sem = cosine(qvec, vec[n["id"]]) if qvec is not None and n["id"] in vec else 0.0
        score = max(lex, 0.9 * sem) if lex or sem > 0.3 else 0.0
        if score > 0.15:
            out.append({"id": n["id"], "name": n["name"], "kind": n["kind"], "score": round(score, 3), "lexical": round(lex, 3), "semantic": round(sem, 3)})
    out.sort(key=lambda x: -x["score"])
    return out[:k]


EDGE_COST = {"contains": 3.0, "shares": 2.0, "relates": 8.0}


def shortest_path(agf: dict, a: str, b: str, max_cost: float = 40.0) -> list[dict] | None:
    """Camino de menor costo (no dirigido) con aristas explicadas (SPEC §20.6, herramienta path).
    Las aristas de contención cuestan 3 y las semánticas (precedes, same_as, references, relates…) 1,
    para que el camino explique una relación y no solo la jerarquía del documento."""
    import heapq
    adj: dict[str, list[tuple[str, dict]]] = {}
    for e in agf["edges"]:
        if e.get("status") == "rejected":
            continue
        adj.setdefault(e["source"], []).append((e["target"], e))
        adj.setdefault(e["target"], []).append((e["source"], e))
    dist: dict[str, float] = {a: 0.0}
    prev: dict[str, tuple[str, dict] | None] = {a: None}
    pq = [(0.0, a)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist.get(u, float("inf")) or d > max_cost:
            continue
        if u == b:
            break
        for v, e in adj.get(u, []):
            nd = d + EDGE_COST.get(e["kind"], 1.0)
            if nd < dist.get(v, float("inf")):
                dist[v] = nd; prev[v] = (u, e); heapq.heappush(pq, (nd, v))
    if b not in prev:
        return None
    path = []
    cur = b
    while prev[cur]:
        u2, e2 = prev[cur]
        path.append({"from": u2, "to": cur, "edge": e2})
        cur = u2
    return list(reversed(path))
