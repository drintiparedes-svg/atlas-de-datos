"""Construcción del Atlas Graph Format 1.0 desde el IR (PLAN §3) y validación contra el esquema.

Identificadores estables (SPEC §4.6): sec:<src>:<n>, sec:<src>:<n>.<k>, el:<slug>, voc:<key>.
Toda faceta inferida declara `facet_origin`, `facet_confidence` y `facet_rationale`.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from functools import lru_cache

import jsonschema
import yaml

from . import CONFIG_DIR, SCHEMA_PATH
from .infer.rules import (infer_data_type, infer_info_domain, infer_section_domain, infer_sensitivity,
                          infer_vocabulary, load_standards)
from .ir import IRDocument, IRSection
from .text import norm, short_hash, slug


@lru_cache(maxsize=1)
def load_schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def validate(agf: dict) -> None:
    """Valida contra schemas/agf-1.0.json y la integridad referencial de aristas y hallazgos."""
    jsonschema.validate(agf, load_schema())
    ids = {n["id"] for n in agf["nodes"]}
    dup = len(agf["nodes"]) - len(ids)
    if dup:
        raise ValueError(f"{dup} identificadores de nodo duplicados")
    for e in agf["edges"]:
        if e["source"] not in ids or e["target"] not in ids:
            raise ValueError(f"arista con extremo inexistente: {e}")
    for f in agf.get("findings", []):
        for nid in f.get("node_ids", []):
            if nid not in ids:
                raise ValueError(f"hallazgo {f['id']} apunta a nodo inexistente {nid}")


def load_timeline(domain: str = "oncologia") -> list[list[str]]:
    p = CONFIG_DIR / "timelines" / f"{domain}.yaml"
    if not p.exists():
        return []
    return (yaml.safe_load(p.read_text(encoding="utf-8")) or {}).get("edges", [])


def build(doc: IRDocument, project_id: str | None = None, project_name: str | None = None,
          root_name: str | None = None, timeline: str | None = "oncologia", infer_domains: bool = True) -> dict:
    """IR → AGF de una sola fuente. Los grupos no se guardan: el visor los calcula (regla 1 del contrato)."""
    src_id = "src_" + slug(doc.title or doc.filename.rsplit(".", 1)[0])[:40]
    now = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    nodes: list[dict] = []
    edges: list[dict] = []
    ecount = 0

    def edge(kind, s, t, **extra):
        nonlocal ecount
        ecount += 1
        edges.append({"id": f"e{ecount}", "kind": kind, "source": s, "target": t, **extra})

    # raíz (decisión D6: nombre propuesto por el sistema si el documento no lo declara)
    root_declared = bool(root_name)
    rname = root_name or doc.title or doc.filename
    nodes.append({"id": "root", "kind": "project_root", "name": rname, "source_id": src_id,
                  "origin": "manual" if root_declared else "inferred", "status": "proposed", "confidence": 1.0 if root_declared else 0.6,
                  "rationale": None if root_declared else "Nombre de la raíz propuesto desde el título del documento; confirmar (decisión D6)."})

    vocab_used: dict[str, int] = {}
    el_ids: dict[str, str] = {}      # id → nombre normalizado
    by_norm: dict[str, str] = {}     # nombre normalizado → id
    used_ids: set[str] = set()

    def add_section(sec: IRSection, parent_id: str, top: IRSection, order: int, sid: str, sec_domain: str | None):
        sd = infer_section_domain(sec.name) if infer_domains else None
        domain_value = sd.value if sd and sd.value else sec_domain
        node = {"id": sid, "kind": "section", "source_id": src_id, "name": sec.name, "order": order,
                "origin": "extracted", "status": "proposed", "confidence": 1.0,
                "provenance": {"locator": sec.locator, "excerpt": (sec.description or sec.name)[:300]}}
        if sec.number is not None:
            node["number"] = sec.number
        if sec.description:
            node["description"] = sec.description
        if parent_id != "root":
            node["parent_id"] = parent_id
        if sec.declared:
            node["declared"] = sec.declared
        if sd and sd.value:
            node["facets"] = {"info_domain": sd.value}
            node["facet_origin"] = {"info_domain": "inferred"}
            node["facet_confidence"] = {"info_domain": sd.confidence}
            node["facet_rationale"] = {"info_domain": sd.rationale}
        nodes.append(node)
        edge("contains", parent_id, sid)
        for el in sec.elements:
            add_element(el, sid, top, sec, domain_value)
        for k, sub in enumerate(sec.subsections, start=1):
            add_section(sub, sid, top, k, f"{sid}.{k}", domain_value)

    def add_element(el, section_id: str, top: IRSection, sec: IRSection, sec_domain: str | None):
        base = "el:" + (slug(el.name) or short_hash(el.raw))
        eid = base
        if eid in used_ids:
            eid = f"{base}~{short_hash(src_id + '/' + section_id)}"
            k2 = 2
            while eid in used_ids:
                eid = f"{base}~{short_hash(src_id + '/' + section_id)}{k2}"; k2 += 1
        used_ids.add(eid)
        facets: dict = {"element_kind": el.element_kind}
        forigin: dict = {"element_kind": "extracted"}
        fconf: dict = {}
        fwhy: dict = {}
        # tipo de dato
        fv = el.declared.get("_data_type_from_values")
        if el.declared.get("data_type"):
            dt = infer_data_type(el.name, declared=el.declared["data_type"])
        elif fv:
            dt = type("I", (), fv)()  # value, confidence, rationale
            dt.origin = "inferred"
        else:
            dt = infer_data_type(el.name)
        facets["data_type"] = dt.value; forigin["data_type"] = dt.origin; fconf["data_type"] = dt.confidence; fwhy["data_type"] = dt.rationale
        # vocabulario
        if el.declared.get("vocabulary"):
            facets["vocabulary"] = el.declared["vocabulary"]; forigin["vocabulary"] = "extracted"
        else:
            voc = infer_vocabulary(el.name)
            if voc.value:
                facets["vocabulary"] = voc.value; forigin["vocabulary"] = "inferred"; fconf["vocabulary"] = voc.confidence; fwhy["vocabulary"] = voc.rationale
        if facets.get("vocabulary"):
            vocab_used[facets["vocabulary"]] = vocab_used.get(facets["vocabulary"], 0) + 1
        # dominio y sensibilidad
        if infer_domains:
            if el.declared.get("info_domain"):
                facets["info_domain"] = el.declared["info_domain"]; forigin["info_domain"] = "extracted"
            else:
                dom = infer_info_domain(el.name, sec.name, sec_domain)
                if dom.value:
                    facets["info_domain"] = dom.value; forigin["info_domain"] = "inferred"; fconf["info_domain"] = dom.confidence; fwhy["info_domain"] = dom.rationale
            if el.declared.get("sensitivity"):
                facets["sensitivity"] = el.declared["sensitivity"]; forigin["sensitivity"] = "extracted"
            else:
                sen = infer_sensitivity(el.name)
                if sen.value:
                    facets["sensitivity"] = sen.value; forigin["sensitivity"] = "inferred"; fconf["sensitivity"] = sen.confidence; fwhy["sensitivity"] = sen.rationale
        node = {"id": eid, "kind": "element", "source_id": src_id, "parent_id": section_id,
                "section_id": section_id if top is sec else _top_id(section_id), "name": el.name,
                "facets": facets, "facet_origin": forigin, "facet_confidence": fconf, "facet_rationale": fwhy,
                "note": el.note, "origin": "extracted", "status": "proposed", "confidence": 1.0,
                "cardinality": "unknown", "required": None,
                "provenance": {"locator": el.locator, "excerpt": (el.raw or el.name)[:300]}}
        if el.declared.get("_value_domain"):
            node["value_domain"] = el.declared["_value_domain"]
        for k in ("native_type", "nullable", "key"):
            if k in el.declared:
                node[k] = el.declared[k]
        if el.stats:
            node["stats"] = el.stats
        nodes.append(node)
        edge("contains", section_id, eid)
        el_ids[eid] = norm(el.name)
        by_norm.setdefault(norm(el.name), eid)
        by_norm.setdefault(norm(f"{sec.name}.{el.name}"), eid)

    def _top_id(section_id: str) -> str:
        return section_id.split(".")[0]

    for i, sec in enumerate(doc.sections, start=1):
        sid = f"sec:{src_id}:{sec.number if sec.number is not None else slug(sec.name)[:30] or i}"
        add_section(sec, "root", sec, i, sid, None)

    # vocabularios
    stds = load_standards()
    for key in vocab_used:
        std = stds.get(key, {"label": key.upper(), "full": key})
        nodes.append({"id": f"voc:{key}", "kind": "vocabulary", "name": std["label"], "full_name": std.get("full"),
                      "origin": "inferred", "status": "proposed"})
    for n in nodes:
        if n["kind"] == "element" and n["facets"].get("vocabulary"):
            edge("coded_with", n["id"], f"voc:{n['facets']['vocabulary']}", layer="std",
                 origin=n["facet_origin"].get("vocabulary", "inferred"), status="proposed")

    # cronología por plantilla (solo si el documento tiene al menos 2 pares reconocibles)
    if timeline:
        by_slug = {slug(n["name"]): n["id"] for n in nodes if n["kind"] == "element"}
        pairs = [(by_slug.get(slug(a)), by_slug.get(slug(b))) for a, b in load_timeline(timeline)]
        pairs = [(a, b) for a, b in pairs if a and b]
        if len(pairs) >= 2:
            for a, b in pairs:
                edge("precedes", a, b, layer="time", origin="inferred", status="proposed", confidence=0.7)

    # relaciones propias del adaptador (llaves foráneas, enlaces)
    for r in doc.relations:
        s = by_norm.get(norm(r.source)) or by_norm.get(norm(r.source.split(".")[-1]))
        t = by_norm.get(norm(r.target)) or by_norm.get(norm(r.target.split(".")[-1]))
        if s and t and s != t:
            extra = {"origin": r.origin, "status": "validated" if r.origin == "extracted" else "proposed"}
            if r.predicate:
                extra["predicate"] = r.predicate
            if r.kind == "references":
                extra["layer"] = "ref"
            edge(r.kind, s, t, **extra)

    agf = {
        "agf_version": "1.0",
        "project": {"id": project_id or ("prj_" + slug(rname)[:40]), "name": project_name or rname},
        "profile": "default",
        "sources": [{"id": src_id, "name": doc.filename, "sha256": doc.sha256, "facets": {"source_type": doc.source_type},
                     "adapter": doc.adapter, "ingested_at": now, "status": "proposed", "title": doc.title,
                     "unparsed": doc.unparsed[:50], "unparsed_count": len(doc.unparsed)}],
        "nodes": nodes, "edges": edges, "findings": [],
    }
    from . import quality
    agf["findings"] = quality.run(agf)
    validate(agf)
    return agf


def stats(agf: dict) -> dict:
    """Cifras del caso dorado y del inventario, calculadas de la misma forma que el visor."""
    els = [n for n in agf["nodes"] if n["kind"] == "element"]
    secs = [n for n in agf["nodes"] if n["kind"] == "section"]
    top = [s for s in secs if not s.get("parent_id")]
    subs = [s for s in secs if s.get("parent_id")]
    by_type: dict[str, int] = {}
    for e in els:
        t = e.get("facets", {}).get("data_type") or "sin_clasificar"
        by_type[t] = by_type.get(t, 0) + 1
    groups = 0
    per_parent: dict[str, dict[str, int]] = {}
    for e in els:
        per_parent.setdefault(e.get("parent_id", ""), {}).setdefault(e.get("facets", {}).get("data_type") or "sin_clasificar", 0)
        per_parent[e.get("parent_id", "")][e.get("facets", {}).get("data_type") or "sin_clasificar"] += 1
    groups = sum(1 for p in per_parent.values() for c in p.values() if c >= 2)
    return {"sources": len(agf["sources"]), "sections_top": len(top), "subsections": len(subs), "elements": len(els),
            "metadata_groups_threshold_2": groups, "elements_by_data_type": by_type,
            "elements_with_vocabulary": sum(1 for e in els if e.get("facets", {}).get("vocabulary")),
            "timeline_edges": sum(1 for e in agf["edges"] if e["kind"] == "precedes"),
            "findings": len(agf.get("findings", [])),
            "unclassified_pct": {f: round(100 * sum(1 for e in els if not e.get("facets", {}).get(f)) / (len(els) or 1), 1)
                                 for f in ("data_type", "info_domain", "sensitivity")}}
