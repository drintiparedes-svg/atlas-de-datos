"""Adaptador `docx-diccionario` (docs/SPEC.md §6.3): diccionarios de variables en Word.

Heurísticas verificadas sobre el caso dorado: 16 secciones, 6 subsecciones, 87 elementos,
0 bloques sin clasificar. La jerarquía se expresa con negritas y numeración de lista
(`numPr`), no con estilos de título. El nivel de lista no es señal jerárquica confiable.
"""
from __future__ import annotations

import re
from pathlib import Path

import docx  # python-docx

from ..ir import IRDocument, IRElement, IRSection

NAME = "docx-diccionario@1.0"
EXTENSIONS = (".docx",)
SOURCE_TYPE = "diccionario"

_SUB = re.compile(r"^subcategor[ií]a\s*:", re.I)
_NUM = re.compile(r"^(\d+)\.\s*(.+)$")


def parse(path: Path) -> IRDocument:
    d = docx.Document(str(path))
    doc = IRDocument(filename=path.name, source_type=SOURCE_TYPE, adapter=NAME)
    cur: IRSection | None = None
    sub: IRSection | None = None
    for i, p in enumerate(d.paragraphs):
        t = p.text.strip()
        if not t:
            continue
        if doc.title is None:
            doc.title = t
            continue
        is_list = p._p.pPr is not None and p._p.pPr.numPr is not None
        bold = "".join(r.text for r in p.runs if r.bold).strip()
        m = _NUM.match(bold) if not is_list else None
        if m:
            rest = "".join(r.text for r in p.runs if not r.bold).strip()
            cur = IRSection(name=m.group(2).rstrip(". ").strip(), number=int(m.group(1)),
                            description=rest or None, locator={"paragraph": i})
            doc.sections.append(cur)
            sub = None
            continue
        if _SUB.match(t):
            if cur is None:
                doc.unparsed.append({"locator": {"paragraph": i}, "text": t, "reason": "subcategoría sin categoría abierta"})
                continue
            sub = IRSection(name=t.split(":", 1)[1].strip(), locator={"paragraph": i})
            cur.subsections.append(sub)
            continue
        if is_list and cur:
            name, note = _split_note(t)
            (sub or cur).elements.append(IRElement(name=name, raw=t, note=note, locator={"paragraph": i}))
            continue
        if cur and cur.description is None and not cur.elements and not cur.subsections:
            cur.description = t
            continue
        doc.unparsed.append({"locator": {"paragraph": i}, "text": t})
    # tablas del documento: cada tabla es una sección adicional si tiene encabezado "variable"/"campo"
    for ti, table in enumerate(d.tables):
        rows = [[c.text.strip() for c in r.cells] for r in table.rows]
        if not rows:
            continue
        head = [h.lower() for h in rows[0]]
        name_col = next((k for k, h in enumerate(head) if h in ("variable", "campo", "nombre", "elemento")), None)
        if name_col is None:
            doc.unparsed.append({"locator": {"table": ti}, "text": f"tabla {ti + 1} sin columna de variable", "rows": len(rows) - 1})
            continue
        sec = IRSection(name=f"Tabla {ti + 1}", locator={"table": ti})
        type_col = next((k for k, h in enumerate(head) if h in ("tipo", "tipo de dato", "type")), None)
        for ri, r in enumerate(rows[1:], start=1):
            if name_col < len(r) and r[name_col]:
                el = IRElement(name=r[name_col], raw=" | ".join(r), locator={"table": ti, "row": ri})
                if type_col is not None and type_col < len(r) and r[type_col]:
                    el.declared["data_type"] = r[type_col]
                sec.elements.append(el)
        if sec.elements:
            doc.sections.append(sec)
    return doc


def _split_note(t: str) -> tuple[str, str | None]:
    """«Nombre: descripción» o «Nombre (nota)» → nombre y nota. Conserva el nombre literal."""
    m = re.match(r"^([^:]{2,80}):\s+(.{8,})$", t)
    if m and not t.lower().startswith("http"):
        return m.group(1).strip(), m.group(2).strip()
    return t, None
