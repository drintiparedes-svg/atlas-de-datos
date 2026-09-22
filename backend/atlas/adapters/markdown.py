"""Adaptador `markdown` (.md, .txt): `#`/`##` → secciones; listas → elementos; `[[enlaces]]` → relaciones.
Tablas markdown con columna «Variable»/«Campo» → elementos con tipo declarado si hay columna «Tipo»."""
from __future__ import annotations

import re
from pathlib import Path

from ..ir import IRDocument, IRElement, IRRelation, IRSection

NAME = "markdown@1.0"
EXTENSIONS = (".md", ".markdown", ".txt")
SOURCE_TYPE = "diccionario"

_H = re.compile(r"^(#{1,6})\s+(.*)$")
_LI = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+(.*)$")
_WL = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")
KIND_BY_SECTION = [("tarea", "task"), ("pendiente", "task"), ("compromiso", "task"), ("decision", "decision"), ("acuerdo", "decision"),
                   ("pregunta", "question"), ("duda", "question"), ("evento", "event"), ("hito", "event"), ("participante", "entity"),
                   ("asistente", "entity"), ("persona", "entity")]


def _kind_for(section_name: str) -> str:
    from ..text import norm
    n = norm(section_name)
    for k, v in KIND_BY_SECTION:
        if k in n:
            return v
    return "field"


def parse(path: Path) -> IRDocument:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    doc = IRDocument(filename=path.name, source_type=SOURCE_TYPE, adapter=NAME)
    cur: IRSection | None = None
    sub: IRSection | None = None
    number = 0
    table_head: list[str] | None = None
    for i, line in enumerate(lines, start=1):
        t = line.rstrip()
        if not t.strip():
            table_head = None
            continue
        h = _H.match(t)
        if h:
            level, name = len(h.group(1)), h.group(2).strip()
            if level == 1 and doc.title is None:
                doc.title = name
                continue
            if level <= 2 or cur is None:
                number += 1
                m = re.match(r"^(\d+)[.)]\s*(.*)$", name)
                cur = IRSection(name=m.group(2) if m else name, number=int(m.group(1)) if m else number, locator={"line": i})
                doc.sections.append(cur); sub = None
            else:
                sub = IRSection(name=name, locator={"line": i}); cur.subsections.append(sub)
            continue
        if t.strip().startswith("|"):
            cells = [c.strip() for c in t.strip().strip("|").split("|")]
            if table_head is None:
                table_head = [c.lower() for c in cells]
                continue
            if all(set(c) <= set("-: ") for c in cells):
                continue
            name_col = next((k for k, h in enumerate(table_head) if h in ("variable", "campo", "nombre", "elemento", "columna")), None)
            if name_col is None or cur is None or name_col >= len(cells):
                doc.unparsed.append({"locator": {"line": i}, "text": t[:120]})
                continue
            el = IRElement(name=cells[name_col], raw=t.strip(), locator={"line": i})
            for k, h in enumerate(table_head):
                if k < len(cells) and cells[k]:
                    if h in ("tipo", "tipo de dato", "type"):
                        el.declared["data_type"] = _norm_type(cells[k])
                    elif h in ("dominio", "valores", "dominio de valores"):
                        el.declared["_value_domain"] = [v.strip() for v in re.split(r"[;,/]", cells[k]) if v.strip()]
                    elif h in ("descripcion", "descripción", "definicion", "definición", "nota"):
                        el.note = cells[k]
                    elif h in ("terminologia", "terminología", "estandar", "estándar", "vocabulario"):
                        el.declared["vocabulary"] = cells[k].lower()
                    elif h in ("sensibilidad",):
                        el.declared["sensitivity"] = cells[k].lower()
                    elif h in ("dominio de informacion", "dominio de información", "ambito", "ámbito"):
                        el.declared["info_domain"] = cells[k].lower()
            (sub or cur).elements.append(el)
            for target in _WL.findall(el.note or ""):
                doc.relations.append(IRRelation("relates", el.name, target.strip(), predicate="enlace", locator={"line": i}))
            continue
        li = _LI.match(t)
        if li and cur is not None:
            raw = li.group(1).strip()
            m = re.match(r"^\*{0,2}([^:*]{2,80})\*{0,2}\s*[:·-]\s+(.+)$", raw)
            name, note = (m.group(1).strip(), m.group(2).strip()) if m else (raw, None)
            el = IRElement(name=_WL.sub(r"\1", name), raw=raw, note=note, locator={"line": i}, element_kind=_kind_for((sub or cur).name))
            (sub or cur).elements.append(el)
            for target in _WL.findall(raw):
                if target.strip() != el.name:
                    doc.relations.append(IRRelation("relates", el.name, target.strip(), predicate="enlace", locator={"line": i}))
            continue
        if cur is not None and (sub or cur).description is None and not (sub or cur).elements:
            (sub or cur).description = t.strip()
            continue
        if cur is None and doc.title is not None and "description" not in doc.meta:
            doc.meta["description"] = t.strip()
            continue
        doc.unparsed.append({"locator": {"line": i}, "text": t[:120]})
    return doc


def _norm_type(s: str) -> str:
    from ..text import norm
    n = norm(s)
    table = {"fecha": "fecha", "date": "fecha", "categorica": "categorica", "categorical": "categorica", "binario": "binario",
             "binaria": "binario", "boolean": "binario", "dicotomica": "binario", "numerica": "numerica", "numeric": "numerica",
             "entero": "numerica", "decimal": "numerica", "codigo": "codigo", "code": "codigo", "identificador": "identificador",
             "id": "identificador", "texto": "texto_libre", "texto libre": "texto_libre", "text": "texto_libre",
             "compuesto": "compuesto", "json": "compuesto", "lista": "compuesto", "archivo": "archivo", "file": "archivo"}
    return table.get(n, n.replace(" ", "_"))
