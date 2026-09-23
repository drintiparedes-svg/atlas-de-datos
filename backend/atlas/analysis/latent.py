"""Patrones ocultos: codificador de grafo con una capa de atención (tipo transformer sobre el vecindario) entrenado
para predecir enlaces. Espejo en numpy de frontend/src/analysis/latent.ts (misma arquitectura y objetivo; los
generadores aleatorios difieren, por lo que los pares concretos pueden variar entre navegador y CLI).

Salidas: relaciones latentes (pares sin enlace con alta probabilidad), comunidades (k-medias por coseno),
flujos de fechas y posibles reubicaciones. Solo metadata (regla M4); todo es hipótesis `inferred`/`proposed`.
"""
from __future__ import annotations

import time

import numpy as np

from ..embeddings.hashing import HashProvider
from ..text import tokens

STOP = {"de", "del", "la", "el", "los", "las", "en", "al", "y", "o", "con", "por", "a", "un", "una", "the", "of", "para"}


def node_text(n: dict) -> str:
    f = n.get("facets") or {}
    return ". ".join(str(x) for x in [n.get("name", ""), n.get("description") or n.get("note") or "", f.get("data_type") or "", f.get("info_domain") or "", f.get("element_kind") or ""] if x)


def train_latent(agf: dict, dim: int = 32, epochs: int = 120, lr: float = 0.03, seed: int = 7, negatives: int = 2,
                 top_pairs: int = 40, min_score: float = 0.8, communities: int | None = None) -> dict:
    t0 = time.time()
    rng = np.random.default_rng(seed)
    nodes = [n for n in agf["nodes"] if n["kind"] in ("element", "section")]
    idx = {n["id"]: i for i, n in enumerate(nodes)}
    N = len(nodes)
    hp = HashProvider()
    X = np.array([hp.embed_one(node_text(n), "passage") for n in nodes], dtype=float)   # N × F
    F = X.shape[1]
    edges, holdout = [], []
    for e in agf["edges"]:
        if e.get("status") == "rejected":
            continue
        a, b = idx.get(e["source"]), idx.get(e["target"])
        if a is None or b is None or a == b:
            continue
        w = 0.5 if e["kind"] == "relates" else 1.0
        if e["kind"] in ("same_as", "precedes") and rng.random() < 0.15:
            holdout.append((a, b)); continue
        edges.append((a, b, w))
    adj = [[] for _ in range(N)]
    adjset = set()
    for a, b, _ in edges:
        adj[a].append(b); adj[b].append(a); adjset.add((a, b)); adjset.add((b, a))
    known = set(adjset)
    for a, b in holdout:
        known.add((a, b)); known.add((b, a))
    nb = [[i] + adj[i] for i in range(N)]
    D = dim
    Win = rng.uniform(-0.3, 0.3, (D, F)); Q = rng.uniform(-0.3, 0.3, (D, D)); K = rng.uniform(-0.3, 0.3, (D, D)); V = rng.uniform(-0.3, 0.3, (D, D))
    scale = 1 / np.sqrt(D)
    sigmoid = lambda x: 1 / (1 + np.exp(-x))  # noqa: E731

    def forward():
        H = X @ Win.T; QH = H @ Q.T; KH = H @ K.T; VH = H @ V.T
        Z = np.zeros_like(H); AL = []
        for i in range(N):
            js = nb[i]
            e = (KH[js] @ QH[i]) * scale
            e = np.exp(e - e.max()); al = e / e.sum()
            Z[i] = H[i] + al @ VH[js]
            AL.append(al)
        return H, QH, KH, VH, Z, AL

    loss_start = loss_end = 0.0
    E = np.array([(a, b) for a, b, _ in edges], dtype=int); W = np.array([w for _, _, w in edges])
    for ep in range(epochs):
        H, QH, KH, VH, Z, AL = forward()
        dZ = np.zeros_like(Z); loss = 0.0; count = 0
        # positivos
        s = np.einsum("ij,ij->i", Z[E[:, 0]], Z[E[:, 1]]); p = sigmoid(s)
        loss += float(-(W * np.log(p + 1e-9)).sum()); count += len(E)
        g = W * (p - 1)
        np.add.at(dZ, E[:, 0], g[:, None] * Z[E[:, 1]]); np.add.at(dZ, E[:, 1], g[:, None] * Z[E[:, 0]])
        # negativos
        for _ in range(negatives):
            c = rng.integers(0, N, len(E))
            ok = np.array([ci != a and (a, ci) not in adjset for a, ci in zip(E[:, 0], c)])
            if not ok.any():
                continue
            a_, c_, w_ = E[ok, 0], c[ok], W[ok] / negatives
            s = np.einsum("ij,ij->i", Z[a_], Z[c_]); p = sigmoid(s)
            loss += float(-(w_ * np.log(1 - p + 1e-9)).sum()); count += len(a_)
            g = w_ * p
            np.add.at(dZ, a_, g[:, None] * Z[c_]); np.add.at(dZ, c_, g[:, None] * Z[a_])
        loss /= max(1, count)
        if ep == 0:
            loss_start = loss
        loss_end = loss
        dH = dZ.copy(); dQH = np.zeros_like(H); dKH = np.zeros_like(H); dVH = np.zeros_like(H)
        for i in range(N):
            js = nb[i]; al = AL[i]; gz = dZ[i]
            dal = VH[js] @ gz
            dVH[js] += al[:, None] * gz
            de = al * (dal - float(al @ dal)) * scale
            dQH[i] += de @ KH[js]
            dKH[js] += de[:, None] * QH[i]
        dQ = dQH.T @ H; dK = dKH.T @ H; dV = dVH.T @ H
        dH += dQH @ Q + dKH @ K + dVH @ V
        dWin = dH.T @ X
        step = lr / max(1, count / 40)
        Win -= step * dWin; Q -= step * dQ; K -= step * dK; V -= step * dV
    H, QH, KH, VH, Z, AL = forward()
    score = lambda a, b: float(sigmoid(Z[a] @ Z[b]))  # noqa: E731
    auc = None
    if len(holdout) >= 3:
        wins = total = 0
        for a, b in holdout:
            for _ in range(20):
                c = int(rng.integers(0, N))
                if c == a or (a, c) in adjset:
                    continue
                total += 1; wins += score(a, b) > score(a, c)
        auc = wins / total if total else None
    els = [i for i, n in enumerate(nodes) if n["kind"] == "element"]
    cand = []
    for x in range(len(els)):
        for y in range(x + 1, len(els)):
            a, b = els[x], els[y]
            if (a, b) in known or nodes[a].get("parent_id") == nodes[b].get("parent_id"):
                continue
            s = score(a, b)
            if s < min_score:
                continue
            shared = [nodes[j]["id"] for j in adj[a] if j in adj[b] and nodes[j]["kind"] == "element"]
            ta = set(tokens(nodes[a]["name"])) - STOP; tb = [t for t in tokens(nodes[b]["name"]) if t in ta and t not in STOP]
            why = "; ".join(w for w in [f"{len(shared)} vecino(s) en común" if shared else "", f"comparten «{'», «'.join(tb[:3])}»" if tb else "",
                                        "mismo tipo de dato" if (nodes[a].get("facets") or {}).get("data_type") == (nodes[b].get("facets") or {}).get("data_type") else "mismo contexto de sección"] if w)
            cand.append({"a": nodes[a]["id"], "b": nodes[b]["id"], "score": round(s, 3), "shared": shared, "why": why or "cercanía en el espacio aprendido",
                         "same_source": nodes[a].get("source_id") == nodes[b].get("source_id")})
    cand.sort(key=lambda c: -c["score"])
    pairs = cand[:top_pairs]
    # comunidades
    U = Z[els] / (np.linalg.norm(Z[els], axis=1, keepdims=True) + 1e-9)
    k = communities or max(2, min(8, round(np.sqrt(len(els) / 2))))
    centers = U[:k].copy(); assign = np.zeros(len(els), dtype=int)
    for _ in range(15):
        assign = (U @ centers.T).argmax(axis=1)
        for j in range(k):
            m = U[assign == j]
            if len(m):
                c = m.sum(axis=0); centers[j] = c / (np.linalg.norm(c) + 1e-9)
    comms = []
    for j in range(k):
        members = [els[i] for i in range(len(els)) if assign[i] == j]
        if len(members) < 2:
            continue
        freq: dict[str, int] = {}
        for i in members:
            for t in set(t for t in tokens(nodes[i]["name"]) if t not in STOP and len(t) > 2):
                freq[t] = freq.get(t, 0) + 1
        top = [t for t, _ in sorted(freq.items(), key=lambda x: -x[1])[:3]]
        coh = float(np.mean([U[els.index(i)] @ centers[j] for i in members]))
        comms.append({"id": j, "label": " · ".join(top) or f"grupo {j + 1}", "members": [nodes[i]["id"] for i in members], "cohesion": round(coh, 3)})
    comms.sort(key=lambda c: -len(c["members"]))
    return {"pairs": pairs, "communities": comms,
            "training": {"nodes": N, "edges": len(edges), "epochs": epochs, "lossStart": round(loss_start, 4), "lossEnd": round(loss_end, 4),
                         "holdoutAuc": None if auc is None else round(auc, 3), "seed": seed, "dim": dim, "ms": int((time.time() - t0) * 1000)}}


def as_edges(pairs: list[dict], start: int = 0) -> list[dict]:
    """Convierte pares latentes en aristas `relates` (predicate latent) propuestas."""
    return [{"id": f"lt{start + i + 1}", "kind": "relates", "source": p["a"], "target": p["b"], "predicate": "latent", "layer": "latent",
             "origin": "inferred", "status": "proposed", "confidence": p["score"], "rationale": "modelo de atención: " + p["why"]} for i, p in enumerate(pairs)]
