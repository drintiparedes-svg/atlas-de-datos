"""Parser de referencia del caso dorado (docx de diccionario de variables).

Verificado sobre backend/tests/fixtures/info_para_presentacion.docx:
16 secciones, 6 subsecciones, 87 elementos, 0 bloques sin clasificar.
Punto de partida del adaptador `docx-diccionario` (docs/SPEC.md §6.3, docs/PLAN-modulo-proyectos.md §4).
Uso: python scripts/reference_parser.py <archivo.docx>
"""
import json
import re
import sys

import docx  # python-docx


def parse(path):
    d = docx.Document(path)
    cats, cur, sub, unparsed = [], None, None, []
    title = None
    for i, p in enumerate(d.paragraphs):
        t = p.text.strip()
        if not t:
            continue
        if title is None:
            title = t
            continue
        is_list = p._p.pPr is not None and p._p.pPr.numPr is not None
        bold = "".join(r.text for r in p.runs if r.bold).strip()
        m = re.match(r"^(\d+)\.\s*(.+)$", bold) if not is_list else None
        if m:
            rest = "".join(r.text for r in p.runs if not r.bold).strip()
            cur = {"number": int(m.group(1)), "name": m.group(2).rstrip(". ").strip(),
                   "description": rest or None, "locator": {"paragraph": i},
                   "subsections": [], "elements": []}
            cats.append(cur)
            sub = None
            continue
        if re.match(r"^subcategor[ií]a\s*:", t, re.I):
            sub = {"name": t.split(":", 1)[1].strip(), "locator": {"paragraph": i}, "elements": []}
            cur["subsections"].append(sub)
            continue
        if is_list and cur:
            (sub or cur)["elements"].append({"raw": t, "locator": {"paragraph": i}})
            continue
        if cur and cur["description"] is None and not cur["elements"] and not cur["subsections"]:
            cur["description"] = t
            continue
        unparsed.append({"locator": {"paragraph": i}, "text": t})
    return {"title": title, "sections": cats, "unparsed": unparsed}


def summary(ir):
    secs = ir["sections"]
    return {
        "sections_top": len(secs),
        "subsections": sum(len(c["subsections"]) for c in secs),
        "elements": sum(len(c["elements"]) + sum(len(s["elements"]) for s in c["subsections"]) for c in secs),
        "elements_per_section": {c["number"]: len(c["elements"]) + sum(len(s["elements"]) for s in c["subsections"]) for c in secs},
        "unparsed": len(ir["unparsed"]),
    }


if __name__ == "__main__":
    ir = parse(sys.argv[1])
    print(json.dumps(summary(ir), ensure_ascii=False, indent=2))
