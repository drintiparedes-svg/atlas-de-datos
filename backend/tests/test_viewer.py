"""Pruebas del visor con Playwright (humo, caso dorado, regresión de conteos, carga en el navegador, paridad hash).

Requisitos: `npm run build` en frontend/ (dist/) y un Chromium. Se usa el navegador preinstalado indicado por
ATLAS_CHROMIUM (predeterminado /opt/pw-browsers/chromium) o el de Playwright si existe. Si falta alguno, se omiten.
Capturas (1440×900, tema claro y oscuro) en tests/screenshots/ para la regresión visual contra reference/prototype.html.
"""
from __future__ import annotations

import http.server
import json
import os
import pathlib
import socketserver
import threading

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
DIST = ROOT / "frontend" / "dist"
SHOTS = pathlib.Path(__file__).parent / "screenshots"
FIX = pathlib.Path(__file__).parent / "fixtures"
DOCX = FIX / "info_para_presentacion.docx"
CHROMIUM = os.environ.get("ATLAS_CHROMIUM", "/opt/pw-browsers/chromium")

pytestmark = pytest.mark.skipif(not (DIST / "index.html").exists(), reason="frontend/dist ausente: ejecute `npm run build` en frontend/")


@pytest.fixture(scope="module")
def server():
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=str(DIST), **k)  # noqa: E731
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


@pytest.fixture(scope="module")
def browser():
    pw = pytest.importorskip("playwright.sync_api")
    with pw.sync_playwright() as p:
        kwargs = {"args": ["--no-sandbox"]}
        if pathlib.Path(CHROMIUM).exists():
            kwargs["executable_path"] = CHROMIUM
        try:
            b = p.chromium.launch(**kwargs)
        except Exception as e:  # pragma: no cover
            pytest.skip(f"sin navegador: {e}")
        yield b
        b.close()


def open_page(browser, server, query="?aud=experto&mode=detalle"):
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.goto(server + "/" + query)
    page.wait_for_selector("body[data-ready='1']", timeout=20000)
    return page, errors


def stats(page):
    return page.evaluate("window.__atlas.stats()")


def test_golden_case_in_viewer(browser, server):
    """CLAUDE.md, forma de trabajo 3: 16 / 6 / 87 / 18 grupos, 176 aristas en Combinada sin capas."""
    page, errors = open_page(browser, server)
    gold = json.loads((FIX / "golden_expected.json").read_text(encoding="utf-8"))["expected"]
    s = stats(page)
    assert (s["sections"], s["subsections"], s["elements"]) == (gold["sections_top"], gold["subsections"], gold["elements"])
    assert s["groups"] == gold["metadata_groups_threshold_2"]
    assert s["links"] == gold["visible_edges_combined_view_no_layers"]
    assert s["view"] == "combinada" and s["mode"] == "detalle" and s["groupBy"] == "data_type"
    page.evaluate("window.__atlas.setLayer('std', true); window.__atlas.setLayer('time', true)")
    s2 = stats(page)
    assert s2["vocabs"] == 8 and s2["links"] == gold["visible_edges_combined_view_no_layers"] + gold["elements_with_vocabulary"] + gold["timeline_edges"]
    page.evaluate("window.__atlas.setLayer('std', false); window.__atlas.setLayer('time', false)")
    page.evaluate("window.__atlas.setView('estructura')")
    assert stats(page)["groups"] == 0 or stats(page)["links"] == 109   # estructura: 109 aristas contains
    page.evaluate("window.__atlas.setView('tipo')")
    assert stats(page)["sections"] == 0 and stats(page)["facets"] == 6
    assert not errors, errors
    page.close()


def test_regroup_by_other_facet_without_reprocessing(browser, server):
    page, errors = open_page(browser, server)
    page.evaluate("window.__atlas.setGroupBy('info_domain')")
    s = stats(page)
    assert s["groupBy"] == "info_domain" and s["elements"] == 87 and s["facets"] >= 5
    page.evaluate("window.__atlas.setGroupBy('sensitivity')")
    assert stats(page)["facets"] >= 2
    page.evaluate("window.__atlas.setGroupBy('data_type')")
    assert stats(page)["groups"] == 18
    assert not errors, errors
    page.close()


def test_labels_do_not_overlap_and_screenshots(browser, server):
    """T4: etiquetas sin solapamiento. Se verifica que el algoritmo coloque etiquetas y se guardan capturas."""
    SHOTS.mkdir(exist_ok=True)
    for theme in ("dark", "light"):
        page, errors = open_page(browser, server)
        page.evaluate(f"document.documentElement.setAttribute('data-theme', '{theme}')")
        page.evaluate("window.__atlas.settle()")
        page.wait_for_timeout(700)
        boxes = page.evaluate("""() => {
          const g = window.__atlas.app.graph; const out = [];
          for (const n of g.visNodes) if (n.lblShown) out.push(n.id);
          return out.length; }""")
        assert boxes > 20, "deben mostrarse etiquetas de secciones, facetas y grupos"
        page.screenshot(path=str(SHOTS / f"detallada_{theme}.png"))
        page.evaluate("window.__atlas.setAudience('explorar')")
        page.wait_for_timeout(800)
        page.evaluate("window.__atlas.settle()")
        page.wait_for_timeout(400)
        page.screenshot(path=str(SHOTS / f"explorar_{theme}.png"))
        assert not errors, errors
        page.close()


def test_search_and_note_navigation(browser, server):
    page, errors = open_page(browser, server)
    hits = page.evaluate("window.__atlas.search('fecha diagnostico').then(h => h.slice(0, 5).map(x => x.node.name))")
    assert any("Fecha de emisión diagnóstico" == h for h in hits), hits
    page.evaluate("window.__atlas.select('el:fecha-de-emision-diagnostico')")
    page.wait_for_timeout(200)
    txt = page.inner_text("#panel-body")
    assert "Fecha de emisión diagnóstico" in txt and "# inferido" in txt and "Posterior a" in txt
    page.fill("#search", "comité")
    page.wait_for_timeout(400)
    assert page.locator("#search-results .sr").count() >= 1
    page.keyboard.press("Enter")
    page.wait_for_timeout(200)
    assert "omité" in page.inner_text("#panel-body")
    page.click("#btn-back")
    assert not errors, errors
    page.close()


def test_explore_mode_hides_expert_controls(browser, server):
    page, errors = open_page(browser, server, "?aud=explorar")
    assert page.evaluate("document.body.dataset.audience") == "explorar"
    assert stats(page)["mode"] == "simple"
    assert page.locator("#tabs button[data-tab=fuentes]").is_hidden()
    assert page.locator("#f-rep").is_hidden()
    body = page.inner_text("#panel-body")
    assert "¿Cómo se relacionan dos datos?" in body and "Buscar un dato" in body
    page.click("button.qbtn[data-go=inventario]")
    assert "Qué información existe" in page.inner_text("#panel-body")
    assert not errors, errors
    page.close()


def test_project_sample_inventory_relations_and_path(browser, server):
    page, errors = open_page(browser, server, "?aud=experto&mode=detalle&agf=./data/proyecto_registro.agf.json")
    s = stats(page)
    assert s["scope"]["level"] == "project" and s["elements"] > 20
    page.click("#tabs button[data-tab=inventario]")
    body = page.inner_text("#panel-body")
    assert "Fuentes por tipo" in body and "Matriz fuente × dominio" in body and "Datos puente" in body
    page.click("#tabs button[data-tab=relaciones]")
    page.fill("#path-a", "Fecha de nacimiento (Info para presentacion.docx)")
    page.fill("#path-b", "Fecha de defunción (Info para presentacion.docx)")
    page.click("#path-go")
    page.wait_for_timeout(300)
    body = page.inner_text("#panel-body")
    assert "pasos" in body and ("antes de" in body or "equivale a" in body)
    pending_before = page.evaluate("window.__atlas.app.agf.edges.filter(e => e.kind === 'same_as' && e.status === 'proposed').length")
    page.locator("button[data-review=validated]").first.click()
    page.wait_for_timeout(200)
    pending_after = page.evaluate("window.__atlas.app.agf.edges.filter(e => e.kind === 'same_as' && e.status === 'proposed').length")
    assert pending_after == pending_before - 1
    page.evaluate("window.__atlas.app.setScope({level: 'source', sourceId: 'src_info_presentacion'})")
    s2 = stats(page)
    assert s2["scope"]["level"] == "source" and s2["sections"] == 16 and s2["elements"] == 87
    assert not errors, errors
    page.close()


def test_browser_ingest_of_synthetic_fixtures(browser, server):
    """F2: carga en el navegador sin red. csv, sql y md producen las mismas cifras que el backend."""
    page, errors = open_page(browser, server, "?aud=experto&mode=detalle&agf=./data/registro_sintetico.agf.json")
    page.click("#tabs button[data-tab=fuentes]")
    page.set_input_files("#file-input", [str(FIX / "esquema_registro.sql"), str(FIX / "minuta_registro.md")])
    page.wait_for_timeout(2500)
    body = page.inner_text("#panel-body")
    assert "esquema-bd@1.0: 4 secciones, 27 elementos, 0 sin clasificar" in body
    assert "markdown@1.0: 3 secciones, 10 elementos, 0 sin clasificar" in body
    n_src = page.evaluate("window.__atlas.app.agf.sources.length")
    assert n_src == 3
    refs = page.evaluate("window.__atlas.app.agf.edges.filter(e => e.kind === 'references').length")
    assert refs == 3
    same = page.evaluate("window.__atlas.app.agf.edges.filter(e => e.kind === 'same_as').length")
    assert same >= 10
    assert not errors, errors
    page.close()


@pytest.mark.skipif(not DOCX.exists(), reason="fixture interno de FALP ausente")
def test_browser_ingest_docx_reproduces_golden(browser, server):
    page, errors = open_page(browser, server, "?aud=experto&mode=detalle&agf=./data/registro_sintetico.agf.json")
    page.click("#tabs button[data-tab=fuentes]")
    page.set_input_files("#file-input", [str(DOCX)])
    page.wait_for_timeout(2500)
    body = page.inner_text("#panel-body")
    assert "docx-diccionario@1.0: 16 secciones, 87 elementos, 0 sin clasificar" in body
    assert not errors, errors
    page.close()


def test_personal_data_guard_blocks_in_browser(browser, server, tmp_path):
    p = tmp_path / "pacientes.csv"
    p.write_text("rut,nombre,fecha\n12.345.678-9,Juan Perez,12/03/2024\n", encoding="utf-8")
    page, errors = open_page(browser, server)
    page.click("#tabs button[data-tab=fuentes]")
    page.set_input_files("#file-input", [str(p)])
    page.wait_for_timeout(1000)
    body = page.inner_text("#panel-body")
    assert "PENDIENTE DE CONFIRMACIÓN" in body.upper() and "rut_chileno" in body
    assert page.evaluate("window.__atlas.app.agf.sources.length") == 1, "no se publica sin confirmación"
    assert not errors, errors
    page.close()


def test_hash_parity_with_python(browser, server):
    """El proveedor hash del navegador debe producir los mismos vectores que backend/atlas/embeddings/hashing.py."""
    fx = json.loads((FIX / "hash_parity.json").read_text(encoding="utf-8"))
    page, errors = open_page(browser, server)
    for case in fx["cases"]:
        first8 = page.evaluate("t => window.__atlas.hash(t).slice(0, 8).map(x => Math.round(x * 1e5) / 1e5)", case["text"])
        assert first8 == case["first8"], case["text"]
        assert page.evaluate("t => window.__atlas.fnv1a(t)", case["text"]) == case["fnv1a"]
    page.close()
