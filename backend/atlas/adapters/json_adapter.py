"""Adaptador `json`: objetos → secciones; claves → elementos con tipo desde los valores.
Si el archivo ya es AGF (agf_version), no se reinterpreta: se devuelve un IR vacío con meta.agf = True."""
from __future__ import annotations

import json
from pathlib import Path

from ..infer.rules import infer_data_type_from_values
from ..ir import IRDocument, IRElement, IRSection

NAME = "json@1.0"
EXTENSIONS = (".json",)
SOURCE_TYPE = "tabla"


def parse(path: Path) -> IRDocument:
    data = json.loads(path.read_text(encoding="utf-8"))
    doc = IRDocument(filename=path.name, title=path.stem, source_type=SOURCE_TYPE, adapter=NAME)
    if isinstance(data, dict) and "agf_version" in data:
        doc.meta["agf"] = True
        return doc
    # JSON Schema
    if isinstance(data, dict) and "properties" in data and isinstance(data["properties"], dict):
        doc.source_type = "esquema_bd"
        _schema_section(doc, data.get("title") or path.stem, data, {"pointer": "/"})
        return doc
    records = data if isinstance(data, list) else [data]
    if not all(isinstance(r, dict) for r in records):
        doc.unparsed.append({"text": "el JSON no es una lista de objetos ni un objeto"})
        return doc
    sec = IRSection(name=path.stem, locator={"pointer": "/"}, description=f"{len(records)} registros; solo estadísticas por clave.")
    keys: dict[str, list] = {}
    for r in records[:5000]:
        for k, v in r.items():
            keys.setdefault(k, []).append(v)
    for k, vals in keys.items():
        if all(isinstance(v, (dict, list)) for v in vals if v is not None):
            inf_value, conf, why = "compuesto", 0.9, "valores anidados (objeto o lista)"
        else:
            inf = infer_data_type_from_values([json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v for v in vals], k)
            inf_value, conf, why = inf.value, inf.confidence, inf.rationale
        el = IRElement(name=k, raw=k, element_kind="column", locator={"pointer": f"/*/{k}"},
                       stats={"non_null": sum(v is not None for v in vals), "rows": len(records)})
        el.declared["_data_type_from_values"] = {"value": inf_value, "confidence": conf, "rationale": why}
        sec.elements.append(el)
    doc.sections.append(sec)
    return doc


def _schema_section(doc: IRDocument, name: str, schema: dict, locator: dict):
    sec = IRSection(name=name, description=schema.get("description"), locator=locator)
    for k, prop in schema.get("properties", {}).items():
        t = prop.get("type", "string")
        t = t[0] if isinstance(t, list) else t
        dt = {"string": "texto_libre" if not prop.get("enum") else "categorica", "integer": "numerica", "number": "numerica",
              "boolean": "binario", "object": "compuesto", "array": "compuesto"}.get(t, "categorica")
        if prop.get("format") in ("date", "date-time"):
            dt = "fecha"
        el = IRElement(name=k, raw=json.dumps(prop, ensure_ascii=False)[:200], note=prop.get("description"),
                       locator={"pointer": f"{locator['pointer']}properties/{k}"}, element_kind="column")
        el.declared["data_type"] = dt
        if prop.get("enum"):
            el.declared["_value_domain"] = [str(v) for v in prop["enum"]][:30]
        sec.elements.append(el)
    doc.sections.append(sec)
