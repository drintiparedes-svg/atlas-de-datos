# Atlas de Datos

Grafo de conocimiento navegable, tipo Obsidian, para entender **qué información existe** en los documentos de un proyecto, **cómo se organiza** su metadata y **cómo se relaciona** entre fuentes; y para convertir lo validado en **memoria para agentes de IA**. Primer caso: el diccionario de variables del registro oncológico (FALP).

Sirve a dos públicos con la misma aplicación: quienes solo quieren saber qué datos existen o cómo se relacionan dos datos concretos (modo **Explorar**), y quienes trabajan con datos y necesitan vistas, facetas, capas, carga de documentos y revisión de equivalencias (modo **Experto**). Guía completa: `docs/GUIA-USO.md`.

## Qué contiene

```
backend/atlas/     paquete Python: adaptadores → AGF, inferencia, calidad, relaciones, embeddings, memoria, CLI `atlas`
backend/tests/     38 pruebas: caso dorado, adaptadores, inferencia, proyecto multi fuente, memoria, visor (Playwright)
frontend/          visor TypeScript + Vite: motor canvas del prototipo, dos públicos, búsqueda híbrida, inventario, relaciones, carga en el navegador
schemas/agf-1.0.json   contrato Atlas Graph Format 1.0
profiles/default.json  perfil de visualización (tokens, facetas y colores, formas, fuerzas, etiquetas)
config/                facetas, estándares, cronología oncológica, reglas de calidad, reglas de inferencia (inference.json, compartido por backend y visor)
samples/               AGF de muestra: oncologia (caso dorado) y proyecto_registro (4 fuentes), con índices de vectores
scripts/               parser de referencia y generador de fixtures sintéticos
docs/                  SPEC, PLAN, DECISIONS, GUIA-USO, MODELOS-ABIERTOS, KICKOFF
reference/prototype.html   prototipo de referencia (visual e interacción)
```

## Inicio rápido

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt          # instala el paquete atlas en modo editable, pytest y playwright
pytest -q backend/tests                      # backend en verde (las pruebas del visor se omiten sin frontend/dist)

cd frontend && npm install && npm run build  # visor estático en frontend/dist
cd .. && pytest -q backend/tests             # ahora también corren las pruebas del visor en Chromium
cd frontend && npm run dev                   # http://127.0.0.1:5173
```

Abrir el proyecto de 4 fuentes: `http://127.0.0.1:5173/?agf=./data/proyecto_registro.agf.json`.

## Flujo típico

```bash
atlas ingest diccionario.docx planilla.csv esquema.sql -o proyecto.agf.json --relate   # documentos → AGF con equivalencias propuestas
atlas inventory proyecto.agf.json                                                       # qué tiene la base (P1, P2, P6, P7)
atlas search proyecto.agf.json "fecha de diagnóstico"                                   # búsqueda híbrida
atlas path proyecto.agf.json el:fecha-de-nacimiento el:fecha-de-defuncion               # cómo se relacionan dos datos
atlas export-memory proyecto.agf.json -o memoria/                                       # memory.jsonl + fichas markdown (solo validado)
```

En el visor, la pestaña **Fuentes** hace lo mismo sin línea de comandos y sin que los documentos salgan del equipo.

## Principios no negociables

- Nada inferido se presenta como hecho: `origin: inferred`, `confidence`, `rationale`, `status: proposed` hasta validación humana.
- Guardia de datos personales antes de procesar; la IA queda bloqueada sin confirmación explícita.
- Bases de datos y tablas: solo metadatos y estadísticas agregadas, nunca filas.
- `AI_ENABLED=false` por defecto: cero llamadas de red. Los modelos abiertos (`multilingual-e5-small`, Ollama) son opcionales y locales (`docs/MODELOS-ABIERTOS.md`).
- Las etiquetas del grafo nunca se superponen; el caso dorado (16 / 6 / 87 / 18 grupos / 176 aristas) se verifica en cada ejecución de pruebas.

Reglas del proyecto: `CLAUDE.md`. Decisiones: `docs/DECISIONS.md`. Cambios: `CHANGELOG.md`.
