"""Adaptador `esquema-bd` (solo metadatos): DDL SQL → tablas (secciones), columnas (elementos),
llaves foráneas → relaciones `references`. Nunca lee filas (regla M4)."""
from __future__ import annotations

import re
from pathlib import Path

from ..ir import IRDocument, IRElement, IRRelation, IRSection

NAME = "esquema-bd@1.0"
EXTENSIONS = (".sql", ".ddl")
SOURCE_TYPE = "esquema_bd"

_TABLE = re.compile(r"create\s+table\s+(?:if\s+not\s+exists\s+)?[`\"]?(?:\w+\.)?(\w+)[`\"]?\s*\((.*?)\)\s*;", re.I | re.S)
_FK = re.compile(r"foreign\s+key\s*\(\s*[`\"]?(\w+)[`\"]?\s*\)\s*references\s+[`\"]?(\w+)[`\"]?\s*\(\s*[`\"]?(\w+)[`\"]?\s*\)", re.I)
_INLINE_FK = re.compile(r"references\s+[`\"]?(\w+)[`\"]?\s*\(\s*[`\"]?(\w+)[`\"]?\s*\)", re.I)
_COMMENT = re.compile(r"--\s*(.*)$")

SQL_TO_DATA_TYPE = [
    (("date", "timestamp", "datetime"), "fecha"),
    (("bool", "bit"), "binario"),
    (("int", "serial", "numeric", "decimal", "float", "double", "real", "money"), "numerica"),
    (("uuid",), "identificador"),
    (("text", "clob"), "texto_libre"),
    (("json", "array"), "compuesto"),
    (("blob", "bytea", "binary"), "archivo"),
    (("char", "varchar", "string", "enum"), "categorica"),
]


def _split_columns(body: str) -> list[str]:
    parts, depth, cur = [], 0, []
    for ch in body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(cur)); cur = []
        else:
            cur.append(ch)
    if cur:
        parts.append("".join(cur))
    return [p.strip() for p in parts if p.strip()]


def parse(path: Path) -> IRDocument:
    text = path.read_text(encoding="utf-8", errors="replace")
    doc = IRDocument(filename=path.name, title=path.stem, source_type=SOURCE_TYPE, adapter=NAME)
    line_of = lambda pos: text.count("\n", 0, pos) + 1  # noqa: E731
    for m in _TABLE.finditer(text):
        tname, body = m.group(1), m.group(2)
        comments: dict[str, str] = {}
        for ln in body.splitlines():
            cm = _COMMENT.search(ln)
            first = re.match(r"\s*[`\"]?(\w+)", ln)
            if cm and first:
                comments[first.group(1).lower()] = cm.group(1).strip()
        body = "\n".join(_COMMENT.sub("", ln) for ln in body.splitlines())
        sec = IRSection(name=tname, locator={"line": line_of(m.start())}, declared={"kind": "table"})
        pks: set[str] = set()
        for raw in _split_columns(body):
            low = raw.lower()
            fk = _FK.search(raw)
            if fk:
                doc.relations.append(IRRelation("references", f"{tname}.{fk.group(1)}", f"{fk.group(2)}.{fk.group(3)}",
                                                locator={"line": line_of(m.start())}))
                continue
            pk = re.match(r"primary\s+key\s*\((.*?)\)", low)
            if pk:
                pks |= {c.strip(" `\"") for c in pk.group(1).split(",")}
                continue
            if low.startswith(("constraint", "unique", "index", "key ", "check")):
                if "references" in low:
                    fk2 = _FK.search(raw)
                    if fk2:
                        doc.relations.append(IRRelation("references", f"{tname}.{fk2.group(1)}", f"{fk2.group(2)}.{fk2.group(3)}"))
                continue
            cm = re.match(r"[`\"]?(\w+)[`\"]?\s+([a-z]+(?:\s*\([^)]*\))?)(.*)$", raw, re.I | re.S)
            if not cm:
                doc.unparsed.append({"locator": {"table": tname}, "text": raw[:120]})
                continue
            cname, ctype, rest = cm.group(1), cm.group(2).strip(), cm.group(3)
            el = IRElement(name=cname, raw=raw.strip(), element_kind="column", locator={"table": tname, "line": line_of(m.start())},
                           note=comments.get(cname.lower()))
            el.declared["native_type"] = ctype
            el.declared["nullable"] = "not null" not in rest.lower()
            el.declared["data_type"] = _map_type(ctype)
            if "primary key" in rest.lower():
                el.declared["key"] = "primary"; el.declared["data_type"] = "identificador"
            ifk = _INLINE_FK.search(rest)
            if ifk:
                doc.relations.append(IRRelation("references", f"{tname}.{cname}", f"{ifk.group(1)}.{ifk.group(2)}"))
            sec.elements.append(el)
        for el in sec.elements:
            if el.name in pks:
                el.declared["key"] = "primary"; el.declared["data_type"] = "identificador"
        doc.sections.append(sec)
    if not doc.sections:
        doc.unparsed.append({"text": "no se encontraron sentencias CREATE TABLE"})
    return doc


def _map_type(ctype: str) -> str:
    low = ctype.lower()
    for keys, dt in SQL_TO_DATA_TYPE:
        if any(k in low for k in keys):
            return dt
    return "categorica"
