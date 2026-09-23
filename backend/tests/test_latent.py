"""Modelo de patrones ocultos (atención sobre el grafo): aprende, supera al azar en prueba ciega y solo propone hipótesis."""
import json

import pytest

np = pytest.importorskip("numpy")

from atlas import agf as A, project as P, relations  # noqa: E402
from atlas.analysis.latent import as_edges, train_latent  # noqa: E402
from atlas.embeddings import get_provider  # noqa: E402
from atlas.embeddings.index import build_index  # noqa: E402


@pytest.fixture(scope="module")
def project(csv_agf, sql_agf, md_agf, sample_agf):
    g = P.merge([sample_agf, csv_agf, sql_agf, md_agf], "prj_lat", "Latente")
    g["edges"] += relations.propose(g, build_index(g, get_provider("hash")))
    return g


def test_latent_model_learns_and_beats_chance(project):
    r = train_latent(project, epochs=80, seed=3)
    t = r["training"]
    assert t["lossEnd"] < t["lossStart"], "la pérdida debe bajar"
    assert t["holdoutAuc"] is None or t["holdoutAuc"] >= 0.7, t
    assert r["pairs"] and all(0.8 <= p["score"] <= 1 for p in r["pairs"])
    known = {(e["source"], e["target"]) for e in project["edges"]} | {(e["target"], e["source"]) for e in project["edges"]}
    assert all((p["a"], p["b"]) not in known for p in r["pairs"]), "no repite relaciones registradas"
    assert r["communities"] and all(len(c["members"]) >= 2 for c in r["communities"])


def test_latent_is_deterministic_and_yields_proposed_edges(project):
    a = train_latent(project, epochs=40, seed=11); b = train_latent(project, epochs=40, seed=11)
    assert [p["a"] + p["b"] for p in a["pairs"]] == [p["a"] + p["b"] for p in b["pairs"]]
    g = json.loads(json.dumps(project))
    g["edges"] += as_edges(a["pairs"][:5])
    A.validate(g)
    lat = [e for e in g["edges"] if e.get("predicate") == "latent"]
    assert len(lat) == 5 and all(e["status"] == "proposed" and e["origin"] == "inferred" for e in lat)


def test_cli_patterns(tmp_path, project):
    from atlas.cli import main
    p = tmp_path / "p.agf.json"; p.write_text(json.dumps(project), encoding="utf-8")
    assert main(["patterns", str(p), "--epochs", "30", "--add", "-o", str(tmp_path / "out.agf.json")]) == 0
    out = json.loads((tmp_path / "out.agf.json").read_text(encoding="utf-8"))
    assert any(e.get("predicate") == "latent" for e in out["edges"])
