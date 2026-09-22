"""Adaptador genérico: cualquier extensión. Solo el nodo `source` con metadatos; sin contenido."""
from pathlib import Path

from ..ir import IRDocument

NAME = "generico@1.0"
EXTENSIONS: tuple[str, ...] = ()
SOURCE_TYPE = "otro"


def parse(path: Path) -> IRDocument:
    st = path.stat()
    return IRDocument(filename=path.name, title=path.stem, source_type=SOURCE_TYPE, adapter=NAME,
                      meta={"size_bytes": st.st_size, "extension": path.suffix.lower()})
