"""Genera fixtures sintéticos (PLAN §12, fixtures 2, 3 y 6). Ningún dato corresponde a personas reales.

  backend/tests/fixtures/registro_sintetico.csv   200 filas ficticias con columnas del registro (fixture 2)
  backend/tests/fixtures/esquema_registro.sql     DDL ficticio con 3 llaves foráneas (fixture 3)
  backend/tests/fixtures/minuta_registro.md       diccionario complementario en markdown (fixture 6)
Semilla fija: la salida es reproducible.
"""
import csv
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(20260922)
FIX = Path(__file__).resolve().parents[1] / "backend" / "tests" / "fixtures"

REGIONES = ["Metropolitana", "Valparaíso", "Biobío", "Maule", "Araucanía", "O'Higgins"]
COMUNAS = ["Providencia", "Santiago", "Ñuñoa", "Viña del Mar", "Concepción", "Talca", "Temuco", "Rancagua"]
TOPO = ["C50.9", "C18.9", "C34.1", "C61", "C16.9", "C53.9", "C43.5", "C20"]
MORFO = ["8500/3", "8140/3", "8070/3", "8720/3", "8010/3"]
TNM = ["cT1N0M0", "cT2N1M0", "cT3N2M1", "pT1N0M0", "pT2N0M0", "cT4N3M1"]


def make_csv():
    cols = ["id_caso", "fecha_nacimiento", "sexo", "region_vivienda", "comuna_vivienda", "prevision_diagnostico",
            "fecha_emision_dx", "diagnostico_cie10", "codigo_topografia_cieo", "codigo_morfologia_cieo", "ctnm",
            "estadio_dx", "metastasis_dx", "fecha_comite", "fecha_inicio_tratamiento", "intencion_tratamiento",
            "her2_mama", "ki67_pct", "estado_vital", "fecha_defuncion", "observaciones"]
    rows = []
    for i in range(1, 201):
        nac = date(1940, 1, 1) + timedelta(days=random.randint(0, 25000))
        dx = date(2019, 1, 1) + timedelta(days=random.randint(0, 2000))
        vital = random.choice(["Vivo", "Vivo", "Vivo", "Fallecido"])
        rows.append([f"RC-{i:05d}", nac.isoformat(), random.choice(["F", "M"]), random.choice(REGIONES), random.choice(COMUNAS),
                     random.choice(["FONASA A", "FONASA B", "FONASA C", "FONASA D", "ISAPRE"]), dx.isoformat(),
                     random.choice(TOPO), random.choice(TOPO), random.choice(MORFO), random.choice(TNM),
                     random.choice(["I", "II", "III", "IV"]), random.choice(["Si", "No", "No", "Desconocido"]),
                     (dx + timedelta(days=random.randint(3, 40))).isoformat(), (dx + timedelta(days=random.randint(20, 90))).isoformat(),
                     random.choice(["Curativa", "Paliativa"]), random.choice(["Positivo", "Negativo", "Equívoco", ""]),
                     str(random.randint(1, 95)), vital, (dx + timedelta(days=random.randint(100, 900))).isoformat() if vital == "Fallecido" else "",
                     random.choice(["", "Caso presentado en comité de tumores digestivos; se acuerda esquema estándar.",
                                    "Paciente ficticio generado para pruebas del Atlas; sin correspondencia real.",
                                    "Se solicita confirmación de estadificación patológica tras cirugía."])])
    with open(FIX / "registro_sintetico.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(cols); w.writerows(rows)


DDL = """-- Esquema ficticio del registro oncológico (solo para pruebas del adaptador esquema-bd; sin datos reales)
CREATE TABLE paciente (
  id_paciente INTEGER PRIMARY KEY,
  fecha_nacimiento DATE NOT NULL, -- fecha de nacimiento
  sexo VARCHAR(1) NOT NULL,
  comuna_vivienda VARCHAR(60),
  region_vivienda VARCHAR(60)
);

CREATE TABLE registro_tumores (
  id_tumor INTEGER PRIMARY KEY,
  id_paciente INTEGER NOT NULL REFERENCES paciente(id_paciente),
  fecha_emision_dx DATE NOT NULL, -- fecha de emisión del diagnóstico
  diagnostico_cie10 VARCHAR(8),
  codigo_topografia_cieo VARCHAR(6),
  codigo_morfologia_cieo VARCHAR(7),
  ctnm VARCHAR(12),
  estadio_dx VARCHAR(4),
  metastasis_dx BOOLEAN,
  ki67_pct NUMERIC(5,2),
  observaciones TEXT
);

CREATE TABLE comite (
  id_comite INTEGER PRIMARY KEY,
  id_tumor INTEGER NOT NULL,
  fecha_comite DATE NOT NULL,
  tipo_comite VARCHAR(40),
  intencion_resolucion VARCHAR(20),
  FOREIGN KEY (id_tumor) REFERENCES registro_tumores(id_tumor)
);

CREATE TABLE tratamiento (
  id_tratamiento INTEGER PRIMARY KEY,
  id_tumor INTEGER NOT NULL,
  categoria_tratamiento VARCHAR(40),
  fecha_inicio_tratamiento DATE,
  fecha_termino_tratamiento DATE,
  intencion_tratamiento VARCHAR(20),
  CONSTRAINT fk_trat_tumor FOREIGN KEY (id_tumor) REFERENCES registro_tumores(id_tumor)
);
"""

MD = """# Minuta: acuerdos del equipo de registro (documento ficticio)

Documento sintético para pruebas del adaptador markdown. No corresponde a una reunión real.

## 1. Decisiones sobre variables

- Fecha de emisión diagnóstico: se toma como fecha índice del caso; debe coincidir con `fecha_emision_dx` en la base [[Fecha de nacimiento]].
- Estado Vital: se registrará como Vivo / Fallecido / Desconocido.
- Causa de defunción: codificada con CIE-10, edición vigente.
- Ki-67: porcentaje de células positivas, entero de 0 a 100.

## 2. Tareas

- Definir cardinalidad de comités y tratamientos: pendiente, responsable equipo de registro.
- Completar dominios de valores de las variables categóricas.

## 3. Diccionario complementario

| Variable | Tipo | Dominio | Descripción |
|---|---|---|---|
| Tipo de Comité | categorica | Digestivo; Mama; Tórax; Urología | Comité oncológico donde se presenta el caso |
| Intención de la resolución | categorica | Curativa; Paliativa | Intención acordada en comité |
| Fecha de comité | fecha | | Fecha de la sesión |
| Número de Informe diagnóstico | identificador | | Folio del informe anatomopatológico |
"""


if __name__ == "__main__":
    FIX.mkdir(parents=True, exist_ok=True)
    make_csv()
    (FIX / "esquema_registro.sql").write_text(DDL, encoding="utf-8")
    (FIX / "minuta_registro.md").write_text(MD, encoding="utf-8")
    print("fixtures sintéticos generados en", FIX)
