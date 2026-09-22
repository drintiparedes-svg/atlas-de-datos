"""Reglas de inferencia (config/inference.json y config/standards.yaml).

Determinismo primero: ninguna regla llama a la red. Las reglas de tipo de dato
reproducen docs/SPEC.md §6.4; su desempeño medido sobre el caso dorado es 85/87
y no está demostrado en documentos nuevos (ver test_inference.py).
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import yaml

from .. import CONFIG_DIR
from ..text import norm


@dataclass
class Inference:
    value: str | None
    confidence: float
    rationale: str
    origin: str = "inferred"


@lru_cache(maxsize=1)
def load_rules() -> dict[str, Any]:
    return json.loads((CONFIG_DIR / "inference.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_standards() -> dict[str, Any]:
    return yaml.safe_load((CONFIG_DIR / "standards.yaml").read_text(encoding="utf-8")) or {}


def _match(rule: dict[str, Any], n: str) -> str | None:
    for p in rule.get("equals", []):
        if n == norm(p):
            return f"igual a «{p}»"
    for p in rule.get("starts", []):
        if n.startswith(norm(p)) or (p in "¿?" and n.startswith(p)):
            return f"empieza con «{p}»"
    for p in rule.get("contains", []):
        if norm(p) in n:
            return f"contiene «{p}»"
    return None


def infer_data_type(name: str, declared: str | None = None) -> Inference:
    """Tipo de dato desde el nombre (SPEC §6.4). Si el documento lo declara, prevalece (extracted)."""
    if declared:
        return Inference(declared, 1.0, "declarado por el documento", origin="extracted")
    n = norm(name)
    cfg = load_rules()["data_type"]
    for rule in cfg["rules"]:
        why = _match(rule, n)
        if why:
            return Inference(rule["type"], 0.8, f"regla {rule['id']}: {why}")
    return Inference(cfg["default"], 0.5, "sin patrón reconocido: valor por defecto")


def infer_data_type_from_values(values: list[str], name: str = "") -> Inference:
    """Tipo de dato desde los valores de una columna (adaptador tabla). Solo usa estadísticas agregadas."""
    cfg = load_rules()["data_type"]["from_values"]
    vals = [str(v).strip() for v in values if v is not None and str(v).strip() != ""]
    if not vals:
        by_name = infer_data_type(name)
        return Inference(by_name.value, min(by_name.confidence, 0.4), "columna vacía: " + by_name.rationale)
    total = len(vals)
    distinct = set(vals)
    low = {norm(v) for v in distinct}
    for bset in cfg["binary_sets"]:
        if low <= set(bset):
            return Inference("binario", 0.9, f"valores dentro de {{{', '.join(bset)}}}")
    def all_match(pats):
        return all(any(re.match(p, v) for p in pats) for v in vals)
    if all_match(cfg["date_patterns"]):
        return Inference("fecha", 0.95, "todos los valores tienen formato de fecha")
    if all_match(cfg["code_patterns"]):
        return Inference("codigo", 0.85, "todos los valores siguen un patrón de código (CIE, CIE-O o TNM)")
    numeric = all(re.match(r"^-?\d+([.,]\d+)?$", v) for v in vals)
    if numeric and len(distinct) >= cfg["identifier_unique_ratio"] * total and total >= 20:
        return Inference("identificador", 0.7, "numérica con valores casi todos únicos")
    if numeric:
        if len(distinct) <= 2 and low <= {"0", "1"}:
            return Inference("binario", 0.9, "valores 0/1")
        return Inference("numerica", 0.9, "todos los valores son números")
    avg_len = sum(len(v) for v in vals) / total
    if len(distinct) >= cfg["identifier_unique_ratio"] * total and total >= 20 and avg_len < cfg["free_text_min_avg_len"]:
        return Inference("identificador", 0.75, "valores casi todos únicos y cortos")
    if avg_len >= cfg["free_text_min_avg_len"]:
        return Inference("texto_libre", 0.8, f"longitud media {avg_len:.0f} caracteres")
    if len(distinct) <= cfg["categorical_max_distinct"] or len(distinct) / total <= cfg["categorical_max_distinct_ratio"]:
        return Inference("categorica", 0.85, f"{len(distinct)} valores distintos en {total} filas")
    return Inference("categorica", 0.5, "sin señal clara: valor por defecto")


def _keyword_hit(keywords: dict[str, list[str]], n: str) -> tuple[str | None, str | None]:
    best: tuple[str | None, str | None, int] = (None, None, 0)
    for value, words in keywords.items():
        for w in words:
            wn = norm(w)
            if wn and wn in n and len(wn) > best[2]:
                best = (value, w, len(wn))
    return best[0], best[1]


def infer_info_domain(name: str, section_name: str | None = None, parent_domain: str | None = None) -> Inference:
    """Dominio de información (faceta F4): por léxico del elemento, si no, heredado de la sección."""
    cfg = load_rules()["info_domain"]
    n = norm(name)
    v, w = _keyword_hit(cfg["element_keywords"], n)
    if v:
        return Inference(v, cfg["element_keyword_confidence"], f"léxico del elemento: «{w}»")
    if parent_domain:
        return Inference(parent_domain, cfg["section_inherit_confidence"], "heredado de la sección")
    if section_name:
        sv, sw = _keyword_hit(cfg["section_keywords"], norm(section_name))
        if sv:
            return Inference(sv, cfg["section_inherit_confidence"], f"léxico de la sección: «{sw}»")
    return Inference(None, 0.0, "sin léxico reconocido: sin clasificar")


def infer_section_domain(section_name: str) -> Inference:
    cfg = load_rules()["info_domain"]
    v, w = _keyword_hit(cfg["section_keywords"], norm(section_name))
    if v:
        return Inference(v, 0.7, f"léxico de la sección: «{w}»")
    return Inference(None, 0.0, "sin léxico reconocido: sin clasificar")


def infer_sensitivity(name: str) -> Inference:
    """Sensibilidad (faceta F5). Provisional: requiere validación legal (decisión M2)."""
    cfg = load_rules()["sensitivity"]
    n = norm(name)
    for rule in cfg["rules"]:
        for w in rule["contains"]:
            if norm(w) in n:
                return Inference(rule["value"], rule["confidence"], f"léxico «{w}» (clasificación provisional, pendiente de revisión legal)")
    return Inference(cfg["default"], 0.0, "sin léxico reconocido: sin clasificar")


def infer_vocabulary(name: str) -> Inference:
    """Terminología o estándar asociado (config/standards.yaml)."""
    n = norm(name)
    for key, std in load_standards().items():
        for p in std.get("patterns", []):
            if norm(p) in n:
                return Inference(key, 0.75, f"patrón «{p}» de {std['label']}")
    return Inference(None, 0.0, "sin patrón de terminología")
