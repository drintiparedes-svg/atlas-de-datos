"""Registro de adaptadores: archivo → IR. Cada adaptador declara extensiones y versión.

Contrato (PLAN §4.1): localizador exacto por nodo, lista `unparsed`, cero invención
de elementos, versión del adaptador en cada nodo (vía IRDocument.adapter).
"""
from __future__ import annotations

import hashlib
from pathlib import Path

from ..ir import IRDocument
from . import docx_diccionario, generic, json_adapter, markdown, sql_ddl, tabla

ADAPTERS = [docx_diccionario, tabla, sql_ddl, markdown, json_adapter]


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def detect(path: Path):
    ext = path.suffix.lower()
    for a in ADAPTERS:
        if ext in a.EXTENSIONS:
            return a
    return generic


def parse_file(path: str | Path, adapter=None) -> IRDocument:
    path = Path(path)
    a = adapter or detect(path)
    doc = a.parse(path)
    doc.sha256 = sha256_of(path)
    doc.adapter = a.NAME
    if not doc.source_type:
        doc.source_type = a.SOURCE_TYPE
    return doc
