"""Motor de calidad (docs/SPEC.md §6.7, config/quality_rules.yaml).

Produce hallazgos con prioridad de corrección (bloqueante, importante, menor) y «Qué hacer».
Las reglas son determinísticas y explican su detección en `detail`.
"""
from __future__ import annotations

from functools import lru_cache

import yaml

from . import CONFIG_DIR
from .text import norm, tokens

REPEATABLE_KEYWORDS = ["comite", "tratamiento", "progresion", "recurrencia", "evento", "episodio", "ciclo", "sesion", "visita", "consulta"]
QUALITY_META_WORDS = ["disponible", "registrado en", "consignado", "completitud"]
DERIVED_TEMPLATES = [
    {"target": ["edad"], "needs": [["fecha de nacimiento"], ["fecha de emision diagnostico", "fecha de diagnostico", "fecha diagnostico"]],
     "detail": "Se calcula desde la fecha de nacimiento y la fecha de diagnóstico."},
]


@lru_cache(maxsize=1)
def load_quality_config() -> dict:
    return yaml.safe_load((CONFIG_DIR / "quality_rules.yaml").read_text(encoding="utf-8"))


def _finding(fid, priority, title, detail, action, node_ids, rule):
    return {"id": fid, "priority": priority, "title": title, "detail": detail, "action": action,
            "node_ids": node_ids, "status": "open", "origin": "inferred", "rule": rule}


def run(agf: dict, threshold_value_domain: bool = True) -> list[dict]:
    nodes = {n["id"]: n for n in agf["nodes"]}
    src_type = {s["id"]: (s.get("facets") or {}).get("source_type") for s in agf.get("sources", [])}
    referenced = {tuple(sorted((e["source"], e["target"]))) for e in agf["edges"] if e["kind"] in ("references", "same_as", "derived_from")}
    sections = [n for n in agf["nodes"] if n["kind"] == "section"]
    elements = [n for n in agf["nodes"] if n["kind"] == "element"]
    findings: list[dict] = []
    k = 0

    def nid():
        nonlocal k
        k += 1
        return f"f{k}"

    # duplicate_description (importante)
    seen: dict[str, str] = {}
    for s in sections:
        d = norm(s.get("description") or "")
        if len(d) < 20:
            continue
        if d in seen:
            a, b = nodes[seen[d]], s
            findings.append(_finding(nid(), "importante", f"Descripción duplicada en «{_lbl(b)}»",
                                     f"La descripción repite la de «{_lbl(a)}».",
                                     "Redactar una descripción propia de la sección o confirmar que ambas comparten alcance.",
                                     [a["id"], b["id"]], "duplicate_description"))
        else:
            seen[d] = s["id"]

    # undefined_element (importante)
    for e in elements:
        if len(norm(e["name"])) <= 2:
            findings.append(_finding(nid(), "importante", f"Elemento «{e['name']}» sin definición",
                                     "El nombre tiene 2 caracteres o menos y no permite saber qué registra.",
                                     "Confirmar su significado con el equipo responsable y renombrarlo con un nombre explícito.",
                                     [e["id"]], "undefined_element"))

    # possible_overlap (importante): nombres muy similares en secciones distintas de la misma fuente
    by_src: dict[str, list[dict]] = {}
    for e in elements:
        by_src.setdefault(e.get("source_id", ""), []).append(e)
    for src, els in by_src.items():
        toks = {e["id"]: set(tokens(e["name"])) - {"de", "del", "la", "el", "los", "las", "en", "al", "y", "o", "con", "por"} for e in els}
        for i, a in enumerate(els):
            for b in els[i + 1:]:
                if a.get("section_id") == b.get("section_id") or tuple(sorted((a["id"], b["id"]))) in referenced:
                    continue
                ta, tb = toks[a["id"]], toks[b["id"]]
                if not ta or not tb:
                    continue
                j = len(ta & tb) / len(ta | tb)
                if j >= 0.6 or norm(a["name"]) == norm(b["name"]):
                    findings.append(_finding(nid(), "importante", f"Posible solapamiento: «{a['name']}» y «{b['name']}»",
                                             f"Nombres de alta similitud ({j:.0%} de palabras compartidas) en secciones distintas.",
                                             "Definir el alcance de cada uno (cuándo se usa cada variable) o fusionarlos.",
                                             [a["id"], b["id"]], "possible_overlap"))

    # quality_metadata_mixed (menor)
    for e in elements:
        n = norm(e["name"])
        if any(w in n for w in QUALITY_META_WORDS):
            findings.append(_finding(nid(), "menor", "Metadato de calidad mezclado con variables",
                                     f"«{e['name']}» describe si el dato está disponible, no una característica del caso.",
                                     "Moverlo a una sección de metadatos de completitud del registro.",
                                     [e["id"]], "quality_metadata_mixed"))

    # derivable_element (menor)
    names = {norm(e["name"]): e for e in elements}
    for t in DERIVED_TEMPLATES:
        target = next((e for n, e in names.items() if any(n.startswith(p) for p in t["target"])), None)
        if not target:
            continue
        ok = all(any(any(n.startswith(alt) for alt in group) for n in names) for group in t["needs"])
        if ok:
            findings.append(_finding(nid(), "menor", f"Variable derivada: «{target['name']}»", t["detail"],
                                     "Marcarla como calculada y validar su coherencia de forma automática.",
                                     [target["id"]], "derivable_element"))

    # unspecified_cardinality (bloqueante)
    rep = [s for s in sections if any(w in norm(s["name"]) for w in REPEATABLE_KEYWORDS) and not s.get("cardinality")
           and src_type.get(s.get("source_id")) not in ("esquema_bd", "tabla")]
    if rep:
        findings.append(_finding(nid(), "bloqueante", "Cardinalidad no especificada",
                                 "Las secciones " + ", ".join(_lbl(s) for s in rep) + " describen eventos que pueden ocurrir varias veces por caso, pero el documento no indica si admiten uno o varios registros.",
                                 "Definir con el equipo responsable si cada caso admite uno o varios eventos de cada tipo (1:1 o 1:N). Condiciona el diseño de las tablas.",
                                 [s["id"] for s in rep], "unspecified_cardinality"))

    # missing_value_domains (bloqueante, agregada)
    if threshold_value_domain:
        cat = [e for e in elements if e.get("facets", {}).get("data_type") in ("categorica", "binario") and not e.get("value_domain")]
        if cat and len(cat) >= max(3, 0.5 * len([e for e in elements if e.get("facets", {}).get("data_type") in ("categorica", "binario")])):
            findings.append(_finding(nid(), "bloqueante", "Dominios de valores ausentes",
                                     f"{len(cat)} variables categóricas o binarias no declaran su lista de valores, unidad ni obligatoriedad. Los tipos de dato de este grafo son inferidos.",
                                     "Completar para cada variable: lista de valores permitidos, unidad (si es numérica) y si es obligatoria.",
                                     [], "missing_value_domains"))
    return findings


def _lbl(s: dict) -> str:
    return f"{s['number']:02d} · {s['name']}" if s.get("number") is not None else s["name"]
