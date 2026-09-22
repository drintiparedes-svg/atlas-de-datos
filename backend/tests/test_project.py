"""Proyecto multi fuente: consolidación, propuestas same_as, inventario (P1, P2, P7), camino y memoria."""
import json

from atlas import agf as A, memory, project as P, relations, search as S
from atlas.embeddings import get_provider
from atlas.embeddings.index import build_index, top_k


def build_project(csv_agf, sql_agf, md_agf, sample_agf, with_index=True):
    g = P.merge([sample_agf, csv_agf, sql_agf, md_agf], "prj_test", "Proyecto de prueba")
    idx = build_index(g, get_provider("hash")) if with_index else None
    g["edges"] += relations.propose(g, idx)
    P.add_shares(g)
    A.validate(g)
    return g, idx


def test_merge_keeps_every_source_and_resolves_id_collisions(csv_agf, sql_agf, md_agf, sample_agf):
    g, _ = build_project(csv_agf, sql_agf, md_agf, sample_agf)
    assert len(g["sources"]) == 4
    ids = [n["id"] for n in g["nodes"]]
    assert len(ids) == len(set(ids))
    n_el = sum(1 for n in g["nodes"] if n["kind"] == "element")
    assert n_el == 87 + 21 + 27 + 10
    assert sum(1 for n in g["nodes"] if n["kind"] == "vocabulary") == 8, "los vocabularios se comparten entre fuentes"
    assert sum(1 for n in g["nodes"] if n["kind"] == "source") == 4


def test_same_as_proposals_bridge_date_of_diagnosis(csv_agf, sql_agf, md_agf, sample_agf):
    """Criterio global PLAN §12: la fecha de diagnóstico es puente entre diccionario, planilla y esquema."""
    g, _ = build_project(csv_agf, sql_agf, md_agf, sample_agf)
    same = [e for e in g["edges"] if e["kind"] == "same_as"]
    assert same and all(e["status"] == "proposed" and e["origin"] == "inferred" and e["rationale"] for e in same)
    names = {n["id"]: n["name"] for n in g["nodes"]}
    pairs = {frozenset((names[e["source"]], names[e["target"]])) for e in same}
    assert frozenset(("Fecha de nacimiento", "fecha_nacimiento")) in pairs
    assert frozenset(("fecha_emision_dx", "fecha_emision_dx")) in pairs
    assert frozenset(("Tipo de Comité", "Tipo de Comité")) in pairs
    inv = P.inventory(g)
    assert inv["bridge_elements"], "elementos puente presentes en ≥ 2 fuentes"
    shares = [e for e in g["edges"] if e["kind"] == "shares"]
    assert shares and all(e["weight"] >= 2 for e in shares)


def test_inventory_answers_p1_p2_p7(csv_agf, sql_agf, md_agf, sample_agf):
    g, _ = build_project(csv_agf, sql_agf, md_agf, sample_agf)
    inv = P.inventory(g)
    assert set(inv["sources_by_type"]) >= {"diccionario", "tabla", "esquema_bd"}          # P1
    assert inv["elements_by_data_type"]["fecha"] >= 14 and "diagnostico" in inv["elements_by_domain"]  # P2
    assert set(inv["source_x_domain"]) == {s["id"] for s in g["sources"]}
    assert inv["validation_coverage_pct"] == 0.0 and "unclassified_pct" in inv                       # P7
    assert inv["totals"]["sources"] == 4


def test_regrouping_does_not_require_reprocessing(sample_agf):
    """Regla 1 del contrato AGF: los grupos se calculan desde las facetas, no se guardan."""
    assert not any(n["kind"] == "group" for n in sample_agf["nodes"])
    st = A.stats(sample_agf)
    assert st["metadata_groups_threshold_2"] == 18 and st["elements"] == 87


def test_search_and_path(csv_agf, sql_agf, md_agf, sample_agf):
    g, idx = build_project(csv_agf, sql_agf, md_agf, sample_agf)
    prov = get_provider("hash")
    res = S.search(g, "fecha diagnostico", idx, prov.embed_one("fecha diagnostico"), k=5)
    top = res[0]["name"].lower()
    assert res and "fecha" in top and ("diagn" in top or "dx" in top)
    nn = top_k(prov.embed_one("comité"), idx, k=3)
    assert nn and nn[0][1] > 0.3
    path = S.shortest_path(g, "el:fecha-de-nacimiento", "el:fecha-de-defuncion")
    assert path and all(step["edge"]["kind"] != "contains" for step in path[:3]), "el camino prefiere relaciones semánticas"
    assert S.shortest_path(g, "el:fecha-de-nacimiento", "no-existe") is None


def test_memory_export_excludes_proposed_by_default(tmp_path, sample_agf, profile, csv_agf):
    g = json.loads(json.dumps(sample_agf))
    r = memory.export(g, tmp_path / "m0", profile)
    assert r["nodes"] == 0 and r["fichas"] == 0, "sin validación humana no hay memoria confiable"
    for n in g["nodes"]:
        if n["id"] in ("el:fecha-de-emision-diagnostico", "el:fecha-de-toma-del-informe-diagnostico", "sec:src_info_presentacion:6"):
            n["status"] = "validated"
    for e in g["edges"]:
        if e["kind"] == "precedes" and e["source"] == "el:fecha-de-toma-del-informe-diagnostico" and e["target"] == "el:fecha-de-emision-diagnostico":
            e["status"] = "validated"
    r = memory.export(g, tmp_path / "m1", profile)
    assert r["nodes"] == 3 and r["fichas"] == 2 and r["edges"] >= 1
    ficha = (tmp_path / "m1" / "fichas" / "fecha-de-emision-diagnostico.md").read_text(encoding="utf-8")
    assert ficha.startswith("---\nid: el:fecha-de-emision-diagnostico") and "Posterior a [[Fecha de toma del informe diagnóstico]]" in ficha
    assert "estado: validado" in ficha
    c = json.loads(json.dumps(csv_agf))
    next(n for n in c["nodes"] if n["name"] == "sexo")["status"] = "validated"
    memory.export(c, tmp_path / "m3", profile)
    assert "Evidencia: registro_sintetico.csv" in (tmp_path / "m3" / "fichas" / "sexo.md").read_text(encoding="utf-8")
    lines = (tmp_path / "m1" / "memory.jsonl").read_text(encoding="utf-8").splitlines()
    assert all(json.loads(l)["trust"] == "confiable" for l in lines)
    r2 = memory.export(g, tmp_path / "m2", profile, include_proposed=True)
    assert r2["nodes"] > 100


def test_cli_ingest_and_project(tmp_path):
    from atlas.cli import main
    from conftest import FIX
    out = tmp_path / "csv.agf.json"
    assert main(["ingest", str(FIX / "registro_sintetico.csv"), "-o", str(out)]) == 0
    assert main(["validate", str(out)]) == 0
    out2 = tmp_path / "sql.agf.json"
    assert main(["ingest", str(FIX / "esquema_registro.sql"), "-o", str(out2)]) == 0
    prj = tmp_path / "prj.agf.json"
    assert main(["project", str(out), str(out2), "-o", str(prj), "--name", "P"]) == 0
    g = json.loads(prj.read_text(encoding="utf-8"))
    assert any(e["kind"] == "same_as" for e in g["edges"])
    assert (tmp_path / "prj.vectors.json").exists()
    assert main(["export-memory", str(prj), "-o", str(tmp_path / "mem"), "--include-proposed"]) == 0


def test_cli_guard_blocks_personal_data(tmp_path, capsys):
    from atlas.cli import main
    p = tmp_path / "pacientes.csv"
    p.write_text("rut,nombre\n12.345.678-9,Juan Perez\n", encoding="utf-8")
    assert main(["ingest", str(p), "-o", str(tmp_path / "x.agf.json")]) == 2
    assert not (tmp_path / "x.agf.json").exists()
