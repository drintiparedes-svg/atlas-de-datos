"""Guardia de datos personales (PLAN §7, paso 3).

Explora el texto de un documento antes de procesarlo. Si encuentra patrones de datos
personales (RUT, correos, teléfonos, nombre + fecha) devuelve los hallazgos y el
pipeline debe detenerse hasta confirmación explícita del usuario. Nunca almacena el
texto coincidente completo: solo el tipo de patrón, el conteo y un extracto acotado.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .infer.rules import load_rules


@dataclass
class GuardReport:
    hits: dict[str, int] = field(default_factory=dict)
    samples: dict[str, list[str]] = field(default_factory=dict)

    @property
    def blocked(self) -> bool:
        return any(self.hits.values())

    def summary(self) -> str:
        if not self.blocked:
            return "Sin patrones de datos personales detectados."
        parts = [f"{k}: {v}" for k, v in self.hits.items() if v]
        return "Posibles datos personales detectados (" + ", ".join(parts) + "). Confirme antes de continuar; la IA queda bloqueada."


def scan_text(text: str) -> GuardReport:
    cfg = load_rules()["personal_data_guard"]
    rep = GuardReport()
    for key, pat in cfg["patterns"].items():
        found = re.findall(pat, text or "")
        rep.hits[key] = len(found)
        if found:
            rep.samples[key] = [_mask(m if isinstance(m, str) else m[0]) for m in found[: cfg["max_hits_to_show"]]]
    return rep


def _mask(s: str) -> str:
    s = s.strip()
    if len(s) <= 4:
        return "*" * len(s)
    return s[:2] + "*" * (len(s) - 4) + s[-2:]
