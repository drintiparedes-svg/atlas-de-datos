"""Caso dorado: el parser de referencia debe reproducir las cifras de golden_expected.json."""
import json
import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from reference_parser import parse, summary  # noqa: E402

FIX = pathlib.Path(__file__).parent / "fixtures"
DOCX = FIX / "info_para_presentacion.docx"
needs_docx = pytest.mark.skipif(not DOCX.exists(), reason="fixture interno de FALP ausente (no se distribuye en el repositorio público)")


@needs_docx
def test_golden_counts():
    exp = json.loads((FIX / "golden_expected.json").read_text(encoding="utf-8"))["expected"]
    got = summary(parse(FIX / "info_para_presentacion.docx"))
    assert got["sections_top"] == exp["sections_top"]
    assert got["subsections"] == exp["subsections"]
    assert got["elements"] == exp["elements"]
    assert got["unparsed"] == 0


@needs_docx
def test_elements_per_section_match_catalog():
    gold = json.loads((FIX / "golden_expected.json").read_text(encoding="utf-8"))
    per = {}
    for v in gold["catalog"]:
        per[v["section"]] = per.get(v["section"], 0) + 1
    got = summary(parse(FIX / "info_para_presentacion.docx"))["elements_per_section"]
    assert got == per


def test_sample_agf_is_valid():
    import jsonschema
    schema = json.loads((ROOT / "schemas" / "agf-1.0.json").read_text(encoding="utf-8"))
    agf = json.loads((ROOT / "samples" / "oncologia.agf.json").read_text(encoding="utf-8"))
    jsonschema.validate(agf, schema)
    ids = {n["id"] for n in agf["nodes"]}
    assert all(e["source"] in ids and e["target"] in ids for e in agf["edges"])
