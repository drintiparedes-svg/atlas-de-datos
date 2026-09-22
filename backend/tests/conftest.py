import json
import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))
FIX = pathlib.Path(__file__).parent / "fixtures"
DOCX = FIX / "info_para_presentacion.docx"
needs_docx = pytest.mark.skipif(not DOCX.exists(), reason="fixture interno de FALP ausente (no se distribuye en el repositorio público)")


@pytest.fixture(scope="session")
def profile():
    return json.loads((ROOT / "profiles" / "default.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def sample_agf():
    return json.loads((ROOT / "samples" / "oncologia.agf.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def csv_agf():
    from atlas import agf
    from atlas.adapters import parse_file
    return agf.build(parse_file(FIX / "registro_sintetico.csv"), timeline=None)


@pytest.fixture(scope="session")
def sql_agf():
    from atlas import agf
    from atlas.adapters import parse_file
    return agf.build(parse_file(FIX / "esquema_registro.sql"), timeline=None)


@pytest.fixture(scope="session")
def md_agf():
    from atlas import agf
    from atlas.adapters import parse_file
    return agf.build(parse_file(FIX / "minuta_registro.md"), timeline=None)
