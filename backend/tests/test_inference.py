"""Reglas de inferencia (config/inference.json) y proveedor hash."""
import json

from atlas.embeddings import get_provider
from atlas.embeddings.base import cosine
from atlas.embeddings.hashing import HashProvider, fnv1a
from atlas.guard import scan_text
from atlas.infer import infer_data_type, infer_data_type_from_values, infer_info_domain, infer_sensitivity, infer_vocabulary
from conftest import FIX


def test_data_type_rules_examples():
    assert infer_data_type("Fecha de nacimiento").value == "fecha"
    assert infer_data_type("¿Presentado a Comité Oncológico?").value == "binario"
    assert infer_data_type("Número de Informe diagnóstico").value == "identificador"
    assert infer_data_type("Código de Topografía (CIEO)").value == "codigo"
    assert infer_data_type("Edad al diagnóstico").value == "numerica"
    assert infer_data_type("Invasión Linfovascular").value == "binario"
    assert infer_data_type("Sexo").value == "categorica"
    assert infer_data_type("Observaciones del caso").value == "texto_libre"
    d = infer_data_type("Sexo", declared="categorica")
    assert d.origin == "extracted" and d.confidence == 1.0
    assert infer_data_type("Estadio de Diagnóstico").value == "categorica"


def test_data_type_from_values():
    assert infer_data_type_from_values(["2024-01-01", "2023-12-31"]).value == "fecha"
    assert infer_data_type_from_values(["Si", "No", "No"]).value == "binario"
    assert infer_data_type_from_values(["C50.9", "C18.9"]).value == "codigo"
    assert infer_data_type_from_values(["1.5", "2", "3.25"]).value == "numerica"
    assert infer_data_type_from_values([f"A{i}" for i in range(50)]).value == "identificador"
    assert infer_data_type_from_values(["x" * 60, "y" * 70]).value == "texto_libre"
    assert infer_data_type_from_values([], "Fecha de algo").confidence <= 0.4


def test_domain_sensitivity_vocabulary_are_inferred_with_rationale():
    d = infer_info_domain("Código de Morfología (CIEO)", "Identificación del Tumor")
    assert d.value == "diagnostico" and d.origin == "inferred" and d.rationale
    assert infer_info_domain("Nivel educacional", "Datos Socioeconómicos y Educacionales").value == "demografico"
    assert infer_info_domain("XYZ", None).value is None
    assert infer_sensitivity("RUT del paciente").value == "dato_personal"
    assert infer_sensitivity("Fecha de emisión diagnóstico").value == "dato_sensible_salud"
    assert "legal" in infer_sensitivity("Fecha de emisión diagnóstico").rationale
    assert infer_vocabulary("Diagnóstico CIE 10").value == "cie10"
    assert infer_vocabulary("Comuna de vivienda habitual").value == "cut"


def test_hash_provider_is_deterministic_and_lexical():
    p = HashProvider()
    a, b = p.embed(["Fecha de nacimiento", "fecha_nacimiento"])
    assert p.embed(["Fecha de nacimiento"])[0] == a
    assert abs(sum(x * x for x in a) - 1.0) < 1e-6
    assert cosine(a, b) > cosine(a, p.embed_one("Tipo de Comité"))
    assert fnv1a("") == 0x811C9DC5 and fnv1a("a") == 0xE40C292C


def test_hash_parity_fixture_matches_typescript_implementation():
    """frontend/src/search/hash.ts debe producir estos mismos vectores (ver frontend/tests/hash.parity.test)."""
    fx = json.loads((FIX / "hash_parity.json").read_text(encoding="utf-8"))
    p = HashProvider()
    for item in fx["cases"]:
        v = p.embed_one(item["text"], "passage")
        assert [round(x, 5) for x in v[:8]] == item["first8"]
        assert item["fnv1a"] == fnv1a(item["text"])


def test_provider_gating_by_ai_enabled(monkeypatch):
    monkeypatch.delenv("AI_ENABLED", raising=False)
    assert get_provider("hash").name == "hash"
    assert get_provider("off") is None
    import pytest
    with pytest.raises(RuntimeError):
        get_provider("st")
    with pytest.raises(RuntimeError):
        get_provider("ollama:bge-m3")


def test_personal_data_guard_detects_rut_and_email():
    rep = scan_text("Paciente Juan Pérez, RUT 12.345.678-9, contacto juan@example.com, ingreso 12/03/2024")
    assert rep.blocked and rep.hits["rut_chileno"] == 1 and rep.hits["email"] == 1
    assert "12.345.678-9" not in json.dumps(rep.samples)
    assert not scan_text("Fecha de nacimiento; Sexo; Comuna").blocked
