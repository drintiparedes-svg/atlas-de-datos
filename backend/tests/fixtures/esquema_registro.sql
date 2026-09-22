-- Esquema ficticio del registro oncológico (solo para pruebas del adaptador esquema-bd; sin datos reales)
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
