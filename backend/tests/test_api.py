"""API de proyectos (FastAPI + SQLite de pruebas): crear proyecto, subir fuentes, guardia, versión, revisión, auditoría."""
import json
import os

import pytest

from conftest import FIX


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("api")
    os.environ["DATABASE_URL"] = f"sqlite:///{tmp / 'atlas_test.db'}"
    os.environ["ATLAS_UPLOAD_DIR"] = str(tmp / "uploads")
    os.environ["ATLAS_API_TOKEN"] = "secreto-de-prueba"
    from atlas import db
    db.get_engine(os.environ["DATABASE_URL"])
    from fastapi.testclient import TestClient
    from atlas.api.app import app
    with TestClient(app) as c:
        c.headers.update({"X-Atlas-Token": "secreto-de-prueba", "X-Atlas-Actor": "inti"})
        yield c


def test_health_and_auth(client):
    assert client.get("/api/health").json()["auth"] == "token"
    r = client.get("/api/projects", headers={"X-Atlas-Token": "otro"})
    assert r.status_code == 401
    assert client.get("/api/projects").status_code == 200


def test_project_lifecycle_with_sources_and_build(client):
    r = client.post("/api/projects", json={"name": "Registro oncológico (prueba API)", "purpose": "validar el módulo", "owner": "Inti"})
    assert r.status_code == 201
    pid = r.json()["id"]
    assert pid.startswith("prj_")
    files = [("files", (n, (FIX / n).read_bytes())) for n in ("registro_sintetico.csv", "esquema_registro.sql", "minuta_registro.md")]
    r = client.post(f"/api/projects/{pid}/sources", files=files)
    assert r.status_code == 201, r.text
    srcs = r.json()
    assert [s["status"] for s in srcs] == ["published"] * 3
    assert {s["adapter"] for s in srcs} == {"tabla@1.0", "esquema-bd@1.0", "markdown@1.0"}
    # duplicado por sha256 no se vuelve a procesar
    r = client.post(f"/api/projects/{pid}/sources", files=[files[0]])
    assert r.json()[0]["id"] == srcs[0]["id"]
    # extensión no admitida y archivo vacío
    assert client.post(f"/api/projects/{pid}/sources", files=[("files", ("x.exe", b"MZ"))]).status_code == 415
    assert client.post(f"/api/projects/{pid}/sources", files=[("files", ("vacio.csv", b""))]).status_code == 400
    # sin versión todavía
    assert client.get(f"/api/projects/{pid}/agf").status_code == 404
    r = client.post(f"/api/projects/{pid}/build")
    assert r.status_code == 200, r.text
    assert r.json()["version"] == 1 and r.json()["stats"]["sources"] == 3
    g = client.get(f"/api/projects/{pid}/agf").json()
    assert g["agf_version"] == "1.0" and len(g["sources"]) == 3
    from atlas import agf as A
    A.validate(g)
    assert any(e["kind"] == "same_as" for e in g["edges"])
    assert client.get(f"/api/projects/{pid}/vectors").json()["provider"] == "hash"
    inv = client.get(f"/api/projects/{pid}/inventory").json()
    assert inv["totals"]["sources"] == 3 and "source_x_domain" in inv
    # búsqueda y camino
    hits = client.get(f"/api/projects/{pid}/search", params={"q": "fecha comite"}).json()
    assert hits and "comite" in hits[0]["name"].lower().replace("é", "e")
    a = next(n["id"] for n in g["nodes"] if n["name"] == "fecha_comite")
    b = next(n["id"] for n in g["nodes"] if n["name"] == "Fecha de comité")
    assert client.get(f"/api/projects/{pid}/path", params={"a": a, "b": b}).json()["found"]
    # revisión de una equivalencia y de un nodo
    e = next(e for e in g["edges"] if e["kind"] == "same_as")
    r = client.post(f"/api/projects/{pid}/review/edge", json={"edge_id": e["id"], "decision": "validated"})
    assert r.json()["status"] == "validated" and r.json()["reviewed_by"] == "inti"
    r = client.post(f"/api/projects/{pid}/review/node", json={"node_id": a, "decision": "validated", "facets": {"info_domain": "tratamiento"}})
    assert r.json()["facet_origin"]["info_domain"] == "manual"
    g2 = client.get(f"/api/projects/{pid}/agf").json()
    assert next(x for x in g2["edges"] if x["id"] == e["id"])["status"] == "validated"
    # reconstruir conserva la decisión
    r = client.post(f"/api/projects/{pid}/build")
    assert r.json()["version"] == 2
    g3 = client.get(f"/api/projects/{pid}/agf").json()
    kept = [x for x in g3["edges"] if x["kind"] == "same_as" and x["source"] == e["source"] and x["target"] == e["target"]]
    assert kept and kept[0]["status"] == "validated"
    # auditoría
    acts = [a["action"] for a in client.get(f"/api/projects/{pid}/audit").json()]
    assert {"project.create", "source.upload", "source.published", "version.build", "edge.review", "node.review"} <= set(acts)
    # detalle del proyecto
    p = client.get(f"/api/projects/{pid}").json()
    assert p["version"] == 2 and len(p["sources"]) == 3 and "inventory" in p
    # no se guardan filas
    dump = json.dumps(g3, ensure_ascii=False)
    assert "RC-00001" not in dump


def test_guard_blocks_until_confirmation(client):
    pid = client.post("/api/projects", json={"name": "Guardia"}).json()["id"]
    csv = b"rut,nombre,fecha\n12.345.678-9,Juan Perez,12/03/2024\n"
    r = client.post(f"/api/projects/{pid}/sources", files=[("files", ("pacientes.csv", csv))])
    s = r.json()[0]
    assert s["status"] == "pending_confirmation" and s["guard_hits"]["rut_chileno"] == 1
    assert "12.345.678-9" not in s["detail"]
    assert client.post(f"/api/projects/{pid}/build").status_code == 409, "sin fuentes publicadas no hay versión"
    r = client.post(f"/api/projects/{pid}/sources/{s['id']}/confirm")
    assert r.json()["status"] == "published" and r.json()["guard_confirmed_by"] == "inti"
    acts = [a["action"] for a in client.get(f"/api/projects/{pid}/audit").json()]
    assert "source.guard_blocked" in acts and "source.guard_confirmed" in acts
    assert client.delete(f"/api/projects/{pid}/sources/{s['id']}").json()["discarded"] == s["id"]
    assert client.delete(f"/api/projects/{pid}").json()["deleted"] == pid
    assert client.get(f"/api/projects/{pid}").status_code == 404
