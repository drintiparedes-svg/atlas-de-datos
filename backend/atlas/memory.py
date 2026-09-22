"""Memoria para agentes (PLAN §8, SPEC §20): memory.jsonl y fichas markdown por elemento.

Niveles de confianza: validated → confiable; proposed → hipótesis (se exporta solo con --include-proposed,
siempre marcada); rejected → excluido. Cada hecho cita fuente y localizador.
"""
from __future__ import annotations

import json
from pathlib import Path

from .text import slug


def _label(profile: dict, facet: str, value: str | None) -> str:
    if not value:
        return "sin clasificar"
    return profile.get("facets", {}).get(facet, {}).get("values", {}).get(value, {}).get("label", value)


def export(agf: dict, out_dir: str | Path, profile: dict, include_proposed: bool = False) -> dict:
    out = Path(out_dir)
    (out / "fichas").mkdir(parents=True, exist_ok=True)
    allowed = {"validated"} | ({"proposed"} if include_proposed else set())
    nodes = {n["id"]: n for n in agf["nodes"]}
    src_name = {s["id"]: s["name"] for s in agf["sources"]}
    kept_nodes = [n for n in agf["nodes"] if n.get("status", "proposed") in allowed]
    kept_ids = {n["id"] for n in kept_nodes}
    kept_edges = [e for e in agf["edges"] if e["source"] in kept_ids and e["target"] in kept_ids and e.get("status", "validated") in allowed | {"validated"}]
    with open(out / "memory.jsonl", "w", encoding="utf-8") as f:
        for n in kept_nodes:
            rec = {"type": "node", "id": n["id"], "kind": n["kind"], "name": n["name"], "facets": n.get("facets", {}),
                   "trust": "confiable" if n.get("status") == "validated" else "hipotesis",
                   "source": src_name.get(n.get("source_id", ""), None), "provenance": n.get("provenance"),
                   "description": n.get("description") or n.get("note")}
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        for e in kept_edges:
            rec = {"type": "edge", "kind": e["kind"], "source": e["source"], "target": e["target"],
                   "trust": "confiable" if e.get("status", "validated") == "validated" else "hipotesis",
                   "confidence": e.get("confidence"), "rationale": e.get("rationale"), "predicate": e.get("predicate")}
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    n_fichas = 0
    for n in kept_nodes:
        if n["kind"] != "element":
            continue
        (out / "fichas" / f"{slug(n['name']) or n['id']}.md").write_text(ficha(n, nodes, kept_edges, src_name, profile), encoding="utf-8")
        n_fichas += 1
    return {"nodes": len(kept_nodes), "edges": len(kept_edges), "fichas": n_fichas, "dir": str(out)}


def ficha(n: dict, nodes: dict, edges: list[dict], src_name: dict, profile: dict) -> str:
    f = n.get("facets", {})
    sec = nodes.get(n.get("section_id") or "")
    parent = nodes.get(n.get("parent_id") or "")
    sec_label = (f"{sec['number']:02d} · {sec['name']}" if sec and sec.get("number") is not None else (sec or {}).get("name", ""))
    fm = [f"id: {n['id']}",
          f"tipo_elemento: {_label(profile, 'element_kind', f.get('element_kind'))}",
          f"tipo_dato: {_label(profile, 'data_type', f.get('data_type'))}",
          f"dominio: {_label(profile, 'info_domain', f.get('info_domain'))}",
          f"sensibilidad: {_label(profile, 'sensitivity', f.get('sensitivity'))}",
          f"fuente: \"[[{src_name.get(n.get('source_id', ''), '')}]]\"",
          f"seccion: \"[[{sec_label}]]\""]
    if parent is not None and parent is not sec:
        fm.append(f"subseccion: \"[[{parent['name']}]]\"")
    fm.append(f"estado: {'validado' if n.get('status') == 'validated' else 'propuesto'}")
    for k, o in (n.get("facet_origin") or {}).items():
        if o == "inferred":
            fm.append(f"origen_{k}: inferido")
    body = [n.get("note") or n.get("description") or ""]
    rel = []
    for e in edges:
        if e["source"] == n["id"] or e["target"] == n["id"]:
            other = nodes.get(e["target"] if e["source"] == n["id"] else e["source"])
            if not other or other["kind"] in ("section", "project_root", "source"):
                continue
            verb = {"precedes": "Anterior a" if e["source"] == n["id"] else "Posterior a", "coded_with": "Codificada con",
                    "same_as": "Equivale a", "relates": "Se relaciona con", "references": "Referencia a" if e["source"] == n["id"] else "Referenciada por",
                    "derived_from": "Derivada de"}.get(e["kind"], e["kind"])
            mark = "" if e.get("status") == "validated" else " (propuesto)"
            rel.append(f"{verb} [[{other['name']}]]{mark}.")
    if rel:
        body.append("\n".join(rel))
    prov = n.get("provenance") or {}
    if prov:
        loc = ", ".join(f"{k} {v}" for k, v in (prov.get("locator") or {}).items())
        body.append(f"Evidencia: {src_name.get(n.get('source_id', ''), '')}, {loc}.")
    return "---\n" + "\n".join(fm) + "\n---\n" + "\n\n".join(b for b in body if b) + "\n"
