"""Consolidación de varias fuentes AGF en un proyecto (PLAN §5.2, nivel Proyecto).

- Cada fuente conserva su subgrafo (root de la fuente pasa a ser nodo `source`).
- Colisiones de identificador entre fuentes: sufijo `~hash6(source_id)` (SPEC §4.6).
- Los vocabularios se comparten (voc:<key>) y no se duplican.
- Aristas `shares` entre fuentes con ≥ k `same_as` validados o propuestos (k = 2 por defecto).
"""
from __future__ import annotations

from datetime import datetime, timezone

from .text import short_hash, slug


def merge(sources: list[dict], project_id: str, project_name: str, shares_k: int = 2) -> dict:
    nodes: list[dict] = [{"id": "prj", "kind": "project_root", "name": project_name, "origin": "manual", "status": "proposed", "confidence": 1.0}]
    edges: list[dict] = []
    findings: list[dict] = []
    srcs: list[dict] = []
    seen_ids: set[str] = {"prj"}
    seen_edges: set[tuple] = set()
    ecount = 0
    fcount = 0
    for agf in sources:
        src = dict(agf["sources"][0])
        sid = src["id"]
        remap: dict[str, str] = {}
        root = next(n for n in agf["nodes"] if n["kind"] == "project_root")
        remap[root["id"]] = sid
        srcs.append(src)
        nodes.append({"id": sid, "kind": "source", "name": src["name"], "title": src.get("title") or root["name"],
                      "source_id": sid, "facets": {"source_type": src.get("facets", {}).get("source_type", "otro")},
                      "origin": "extracted", "status": src.get("status", "proposed"), "confidence": 1.0,
                      "adapter": src.get("adapter"), "ingested_at": src.get("ingested_at")})
        seen_ids.add(sid)
        edges.append({"id": f"e{(ecount := ecount + 1)}", "kind": "contains", "source": "prj", "target": sid})
        for n in agf["nodes"]:
            if n["kind"] == "project_root":
                continue
            if n["kind"] == "vocabulary":
                if n["id"] not in seen_ids:
                    nodes.append(dict(n)); seen_ids.add(n["id"])
                remap[n["id"]] = n["id"]
                continue
            nid = n["id"]
            if nid in seen_ids:
                nid = f"{n['id']}~{short_hash(sid)}"
            remap[n["id"]] = nid
            seen_ids.add(nid)
            m = dict(n); m["id"] = nid
            if m.get("parent_id"):
                m["parent_id"] = remap.get(m["parent_id"], m["parent_id"])
            if m.get("section_id"):
                m["section_id"] = remap.get(m["section_id"], m["section_id"])
            m["source_id"] = sid
            nodes.append(m)
        for e in agf["edges"]:
            s, t = remap.get(e["source"], e["source"]), remap.get(e["target"], e["target"])
            key = (e["kind"], s, t)
            if key in seen_edges:
                continue
            seen_edges.add(key)
            m = dict(e); m["id"] = f"e{(ecount := ecount + 1)}"; m["source"] = s; m["target"] = t
            edges.append(m)
        for f in agf.get("findings", []):
            m = dict(f); m["id"] = f"f{(fcount := fcount + 1)}"; m["node_ids"] = [remap.get(x, x) for x in f.get("node_ids", [])]
            m["source_id"] = sid
            findings.append(m)
    # fix parent_id remaps for elements whose parent is a section renamed in a later source
    return {"agf_version": "1.0", "project": {"id": project_id, "name": project_name}, "profile": "default",
            "sources": srcs, "nodes": nodes, "edges": edges, "findings": findings,
            "built_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")}


def add_shares(agf: dict, k: int = 2) -> int:
    """Arista `shares` entre fuentes con ≥ k pares same_as (peso = número de pares)."""
    src_of = {n["id"]: n.get("source_id") for n in agf["nodes"]}
    pairs: dict[tuple[str, str], int] = {}
    for e in agf["edges"]:
        if e["kind"] == "same_as" and e.get("status") != "rejected":
            a, b = src_of.get(e["source"]), src_of.get(e["target"])
            if a and b and a != b:
                key = tuple(sorted((a, b)))
                pairs[key] = pairs.get(key, 0) + 1
    agf["edges"] = [e for e in agf["edges"] if e["kind"] != "shares"]
    n = 0
    for (a, b), w in pairs.items():
        if w >= k:
            n += 1
            agf["edges"].append({"id": f"s{n}", "kind": "shares", "source": a, "target": b, "weight": w,
                                 "origin": "inferred", "status": "proposed", "confidence": min(1.0, w / 5)})
    return n


def inventory(agf: dict, profile: dict | None = None) -> dict:
    """Métricas de «qué tiene la base» (PLAN §9)."""
    nodes = agf["nodes"]
    els = [n for n in nodes if n["kind"] == "element"]
    srcs = agf["sources"]
    def count(items, key):
        out: dict[str, int] = {}
        for it in items:
            v = key(it) or "sin_clasificar"
            out[v] = out.get(v, 0) + 1
        return dict(sorted(out.items(), key=lambda x: -x[1]))
    matrix: dict[str, dict[str, int]] = {}
    for e in els:
        row = matrix.setdefault(e.get("source_id", "?"), {})
        d = e.get("facets", {}).get("info_domain") or "sin_clasificar"
        row[d] = row.get(d, 0) + 1
    same_as = [e for e in agf["edges"] if e["kind"] == "same_as"]
    bridge: dict[str, set] = {}
    src_of = {n["id"]: n.get("source_id") for n in nodes}
    for e in same_as:
        for a, b in ((e["source"], e["target"]), (e["target"], e["source"])):
            bridge.setdefault(a, {src_of.get(a)}).add(src_of.get(b))
    bridges = sorted([(nid, len(s)) for nid, s in bridge.items() if len(s) >= 2], key=lambda x: -x[1])
    orphans = [e["id"] for e in els if not e.get("parent_id") or not e.get("facets", {}).get("data_type")]
    validated = sum(1 for n in nodes if n.get("status") == "validated")
    return {
        "sources_by_type": count(srcs, lambda s: s.get("facets", {}).get("source_type")),
        "elements_by_kind": count(els, lambda e: e.get("facets", {}).get("element_kind")),
        "elements_by_data_type": count(els, lambda e: e.get("facets", {}).get("data_type")),
        "elements_by_domain": count(els, lambda e: e.get("facets", {}).get("info_domain")),
        "elements_by_sensitivity": count(els, lambda e: e.get("facets", {}).get("sensitivity")),
        "source_x_domain": matrix,
        "bridge_elements": bridges[:50],
        "orphans": orphans,
        "findings_by_priority": count(agf.get("findings", []), lambda f: f.get("priority")),
        "validation_coverage_pct": round(100 * validated / (len(nodes) or 1), 1),
        "unclassified_pct": {f: round(100 * sum(1 for e in els if not e.get("facets", {}).get(f)) / (len(els) or 1), 1)
                             for f in ("data_type", "info_domain", "sensitivity")},
        "totals": {"sources": len(srcs), "sections": sum(1 for n in nodes if n["kind"] == "section"), "elements": len(els),
                   "edges": len(agf["edges"]), "same_as_proposed": sum(1 for e in same_as if e.get("status") == "proposed")},
    }
