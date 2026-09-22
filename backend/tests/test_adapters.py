"""Adaptadores por formato → AGF válido, con cifras esperadas por fixture (PLAN §11, F2 y F3)."""
import json

import pytest

from atlas import agf as A
from atlas.adapters import detect, parse_file
from conftest import DOCX, FIX, needs_docx


def elements(g):
    return [n for n in g["nodes"] if n["kind"] == "element"]


@needs_docx
def test_docx_adapter_reproduces_golden():
    gold = json.loads((FIX / "golden_expected.json").read_text(encoding="utf-8"))["expected"]
    doc = parse_file(DOCX)
    s = doc.summary()
    assert (s["sections_top"], s["subsections"], s["elements"], s["unparsed"]) == (16, 6, 87, 0)
    g = A.build(doc, timeline="oncologia")
    st = A.stats(g)
    assert st["elements"] == 87 and st["sections_top"] == 16 and st["subsections"] == 6
    assert st["timeline_edges"] == gold["timeline_edges"]
    assert st["elements_with_vocabulary"] == gold["elements_with_vocabulary"]
    assert all(n["facet_origin"]["data_type"] == "inferred" for n in elements(g))
    assert g["sources"][0]["adapter"].startswith("docx-diccionario@")
    assert all("provenance" in n for n in elements(g))


@needs_docx
def test_docx_type_rules_agreement_with_reference():
    """SPEC §6.4: 85/87 medido. La prueba fija ese piso; no se ajustan reglas al documento."""
    from atlas.text import slug
    gold = json.loads((FIX / "golden_expected.json").read_text(encoding="utf-8"))
    ref = {(v["section"], slug(v["name"])): v["data_type"] for v in gold["catalog"]}
    g = A.build(parse_file(DOCX), timeline=None)
    agree = sum(1 for n in elements(g) if ref.get((int(n["section_id"].split(":")[-1]), slug(n["name"]))) == n["facets"]["data_type"])
    assert agree >= 85


def test_csv_adapter_types_from_values_and_no_rows(csv_agf):
    els = {n["name"]: n for n in elements(csv_agf)}
    assert len(els) == 21
    assert els["fecha_nacimiento"]["facets"]["data_type"] == "fecha"
    assert els["ki67_pct"]["facets"]["data_type"] == "numerica"
    assert els["metastasis_dx"]["facets"]["data_type"] == "binario"
    assert els["diagnostico_cie10"]["facets"]["data_type"] == "codigo"
    assert els["id_caso"]["facets"]["data_type"] == "identificador"
    assert els["observaciones"]["facets"]["data_type"] == "texto_libre"
    assert els["sexo"]["value_domain"] == ["F", "M"]
    assert els["sexo"]["stats"]["rows"] == 200
    dump = json.dumps(csv_agf, ensure_ascii=False)
    assert "RC-00001" not in dump and "1940-" not in dump, "el AGF no debe contener filas ni valores individuales"
    assert csv_agf["sources"][0]["facets"]["source_type"] == "tabla"


def test_sql_adapter_tables_columns_and_foreign_keys(sql_agf):
    secs = [n for n in sql_agf["nodes"] if n["kind"] == "section"]
    assert [s["name"] for s in secs] == ["paciente", "registro_tumores", "comite", "tratamiento"]
    refs = [e for e in sql_agf["edges"] if e["kind"] == "references"]
    assert len(refs) == 3, "DDL con 3 llaves foráneas genera 3 aristas references (PLAN §11 F3)"
    assert all(e["status"] == "validated" and e["origin"] == "extracted" for e in refs)
    sec_name = {s["id"]: s["name"] for s in secs}
    els = {n["name"] + "@" + sec_name[n["parent_id"]]: n for n in elements(sql_agf)}
    assert els["id_paciente@paciente"]["facets"]["data_type"] == "identificador"
    assert els["fecha_nacimiento@paciente"]["note"] == "fecha de nacimiento"
    assert els["observaciones@registro_tumores"]["facets"]["data_type"] == "texto_libre"
    assert els["metastasis_dx@registro_tumores"]["facets"]["data_type"] == "binario"
    assert all(n["facet_origin"]["data_type"] == "extracted" for n in elements(sql_agf))
    assert sql_agf["sources"][0]["unparsed_count"] == 0


def test_markdown_adapter_tables_lists_and_kinds(md_agf):
    els = {n["name"]: n for n in elements(md_agf)}
    assert len(els) == 10
    assert els["Tipo de Comité"]["facets"]["data_type"] == "categorica"
    assert els["Tipo de Comité"]["facet_origin"]["data_type"] == "extracted"
    assert els["Tipo de Comité"]["value_domain"] == ["Digestivo", "Mama", "Tórax", "Urología"]
    assert els["Definir cardinalidad de comités y tratamientos"]["facets"]["element_kind"] == "task"
    assert els["Ki-67"]["facets"]["element_kind"] == "decision"
    assert md_agf["sources"][0]["unparsed_count"] == 0


def test_json_adapter_records_and_schema(tmp_path):
    recs = [{"id": i, "fecha": f"2024-01-{i:02d}", "activo": i % 2 == 0, "tags": ["a"]} for i in range(1, 25)]
    p = tmp_path / "datos.json"
    p.write_text(json.dumps(recs), encoding="utf-8")
    g = A.build(parse_file(p), timeline=None)
    els = {n["name"]: n["facets"]["data_type"] for n in elements(g)}
    assert els == {"id": "identificador", "fecha": "fecha", "activo": "binario", "tags": "compuesto"}
    schema = {"title": "Caso", "properties": {"sexo": {"type": "string", "enum": ["F", "M"]}, "edad": {"type": "integer"},
                                              "fecha_dx": {"type": "string", "format": "date"}}}
    q = tmp_path / "esquema.json"
    q.write_text(json.dumps(schema), encoding="utf-8")
    g2 = A.build(parse_file(q), timeline=None)
    els2 = {n["name"]: n for n in elements(g2)}
    assert els2["sexo"]["facets"]["data_type"] == "categorica" and els2["sexo"]["value_domain"] == ["F", "M"]
    assert els2["fecha_dx"]["facets"]["data_type"] == "fecha" and els2["edad"]["facets"]["data_type"] == "numerica"


def test_generic_adapter_for_unknown_extension(tmp_path):
    p = tmp_path / "foto.heic"
    p.write_bytes(b"\x00" * 10)
    assert detect(p).NAME.startswith("generico")
    g = A.build(parse_file(p), timeline=None)
    assert [n["kind"] for n in g["nodes"]] == ["project_root"]
    assert g["sources"][0]["facets"]["source_type"] == "otro"


@pytest.mark.parametrize("fx", ["registro_sintetico.csv", "esquema_registro.sql", "minuta_registro.md"])
def test_every_fixture_builds_valid_agf(fx):
    g = A.build(parse_file(FIX / fx), timeline=None)
    A.validate(g)
    for n in g["nodes"]:
        if n.get("origin") == "inferred":
            assert n.get("status") == "proposed"
        for k, o in (n.get("facet_origin") or {}).items():
            if o == "inferred":
                assert n["facet_rationale"].get(k), f"faceta inferida sin justificación: {n['id']}.{k}"
