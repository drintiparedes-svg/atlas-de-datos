"""Representación intermedia (IR) común a todos los adaptadores (docs/SPEC.md §6.2).

Nada se descarta en silencio: lo no clasificado va a `unparsed`.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class IRElement:
    name: str
    raw: str = ""
    locator: dict[str, Any] = field(default_factory=dict)
    note: str | None = None
    declared: dict[str, Any] = field(default_factory=dict)  # facetas declaradas por el documento (origin: extracted)
    stats: dict[str, Any] = field(default_factory=dict)     # estadísticas agregadas (adaptador tabla): nunca filas
    element_kind: str = "field"


@dataclass
class IRSection:
    name: str
    number: int | None = None
    description: str | None = None
    locator: dict[str, Any] = field(default_factory=dict)
    elements: list[IRElement] = field(default_factory=list)
    subsections: list["IRSection"] = field(default_factory=list)
    declared: dict[str, Any] = field(default_factory=dict)


@dataclass
class IRRelation:
    kind: str                # references | derived_from | precedes | relates
    source: str              # nombre del elemento origen (o "tabla.columna")
    target: str
    origin: str = "extracted"
    predicate: str | None = None
    locator: dict[str, Any] = field(default_factory=dict)


@dataclass
class IRDocument:
    filename: str
    title: str | None = None
    source_type: str = "otro"
    adapter: str = "generico@0"
    sha256: str | None = None
    sections: list[IRSection] = field(default_factory=list)
    relations: list[IRRelation] = field(default_factory=list)
    unparsed: list[dict[str, Any]] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)

    def all_elements(self):
        for s in self.sections:
            yield from self._walk(s, s)

    def _walk(self, top: IRSection, s: IRSection):
        for e in s.elements:
            yield top, s, e
        for sub in s.subsections:
            yield from self._walk(top, sub)

    def summary(self) -> dict[str, Any]:
        top = self.sections
        subs = sum(len(s.subsections) for s in top)
        n = sum(1 for _ in self.all_elements())
        per = {}
        for t, _, _ in self.all_elements():
            k = t.number if t.number is not None else t.name
            per[k] = per.get(k, 0) + 1
        return {"sections_top": len(top), "subsections": subs, "elements": n,
                "elements_per_section": per, "unparsed": len(self.unparsed)}
