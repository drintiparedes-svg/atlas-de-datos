# Registro de decisiones

Estados: **Tomada** (aplicar), **Abierta** (usar predeterminado detrás de configuración y avisar), **Rechazada**.
Niveles del responsable: N2 = recomendación con aprobación; N3 = requiere revisión directa (impacto clínico, legal, reputacional, financiero o estratégico).

## Tomadas

| # | Decisión | Fecha | Fuente |
|---|---|---|---|
| T1 | El visor conserva todas las funciones del prototipo v2: Simplificada/Detallada, vistas Estructura/Combinada/Por tipo, capas, notas, Atrás/Inicio, búsqueda, filtros | 2026-09-22 | Inti |
| T2 | "Binario" reemplaza "Dicotómica"; "Separar" reemplaza "Repulsión"; rangos ampliados | 2026-09-22 | Inti |
| T3 | Prioridad de corrección Bloqueante/Importante/Menor con "Qué hacer" | 2026-09-22 | Inti |
| T4 | Etiquetas sin solapamiento | 2026-09-22 | Inti |
| T5 | El módulo es agnóstico al tipo de documento; el diccionario oncológico es el primer caso de prueba | 2026-09-22 | Inti |
| T6 | Propósito final: memoria estructurada para agentes de IA | 2026-09-22 | Inti |
| T7 | Nombre visible "Atlas de Datos Oncológicos" | 2026-09-22 | Inti |
| T8 | Dos públicos en la misma aplicación: modo Explorar (guiado, simplificado) y modo Experto (todos los controles) | 2026-09-22 | Inti (solicitud de construcción) |
| T9 | Modelos abiertos para búsqueda y equivalencias: proveedor `hash` sin red como base, `multilingual-e5-small` (sentence-transformers) y Ollama como opcionales con `AI_ENABLED=true` | 2026-09-22 | Inti (solicitud de construcción) |

## Abiertas

| # | Decisión | Nivel | Predeterminado |
|---|---|---|---|
| D1 | Significado de "tipo" para agrupar metadata | N2 | Faceta seleccionable; por defecto tipo de dato |
| D2 | Proveedor y modelo de IA | N2 | Anthropic API configurable; apagado por defecto |
| D3 | Despliegue | N3 | Local |
| D4 | Consolidar categorías entre documentos | N2 | No; solo `same_as` validado entre elementos |
| D5 | Umbral de grupo de metadata | N2 | 2 elementos |
| D6 | Nombre de la raíz si el documento no lo declara | N2 | Propuesto por el sistema, confirmado por el usuario |
| D7 | Cifrado en reposo | N3 | Solo si se despliega fuera del equipo local |
| D8 | Plantillas de cronología por dominio | N2 | Solo oncología |
| D9 | Motor de OCR | N2 | Tesseract (español) |
| D10 | Modelo de visión para imágenes | N2 | Apagado |
| D11 | Base de grafos | N2 | SQLite |
| D12 | Modelo de embeddings | N2 | Local multilingüe |
| D13 | Agentes con acceso a la memoria (MCP) | N3 | Lectura para todos; propuesta solo autorizados |
| D14 | Relación con el Segundo Cerebro | N2 | Exportar objetos de conocimiento compatibles |
| M1 | Adoptar facetas de dominio y sensibilidad | N2 | Sí |
| M2 | Clasificación de sensibilidad según marco legal chileno | N3 | Pendiente de asesoría legal FALP |
| M3 | Ruta navegador primero (F0 a F2 sin backend) | N2 | Sí |
| M4 | Adaptador de BD solo con metadatos | N3 | Sí, como regla permanente |
| M5 | Fixtures de prueba 2 a 6 | N2 | Sintéticos o públicos, aprobados por Inti |
| M6 | Qué agentes consumen la memoria y con qué permisos | N3 | Lectura interna; propuesta solo autorizados |
| M7 | Hosting del módulo con carga de documentos | N3 | No en URL pública; infraestructura institucional o con autenticación |

## Predeterminados aplicados en la construcción (2026-09-22, pendientes de confirmación)

| # | Decisión abierta | Predeterminado aplicado | Dónde |
|---|---|---|---|
| D1 | Significado de «tipo» | Faceta seleccionable; tipo de dato por defecto | `profiles/default.json` (`default_group_by`), selector «Agrupar por» |
| D2 / D12 | Proveedor y modelo de IA | Apagado; `hash` offline; `st:intfloat/multilingual-e5-small` y `ollama` opcionales | `backend/atlas/embeddings`, `docs/MODELOS-ABIERTOS.md` |
| D3 / M7 | Despliegue | Local; no se desplegó nada; el módulo con carga de documentos corre en el navegador sin servidor | `frontend` |
| D4 | Consolidar categorías entre documentos | No; solo `same_as` propuesto entre elementos, nunca fusión | `backend/atlas/relations.py`, `frontend/src/project.ts` |
| D5 | Umbral de grupo | 2 | `profiles/default.json` (`group_threshold`) |
| D6 | Nombre de la raíz | Propuesto desde el título del documento con `origin: inferred` y aviso en la nota | `atlas ingest --root-name` |
| D8 | Cronología por dominio | Solo oncología; se aplica cuando el documento reconoce ≥ 2 pares | `config/timelines/oncologia.yaml` |
| D11 (aplicada) | Base de datos | PostgreSQL en Neon (`DATABASE_URL`) para proyectos, fuentes, versiones (AGF en JSON) y auditoría; SQLite local como respaldo. Solicitado por Inti el 2026-09-22 | `backend/atlas/db.py`, `backend/.env.example` |
| M1 | Facetas de dominio y sensibilidad | Adoptadas; inferidas por léxico, marcadas `inferred` | `config/inference.json`, `profiles/default.json` |
| M2 | Sensibilidad según marco legal | Clasificación provisional con nota visible; pendiente de asesoría legal | `profiles/default.json` (`facets.sensitivity.note`) |
| M3 | Navegador primero | Sí: adaptadores docx, csv, xlsx, sql, md, json en el cliente | `frontend/src/adapters` |
| M4 | BD solo metadatos | Sí: DDL y tablas producen solo estadísticas agregadas; prueba que verifica ausencia de filas | `tests/test_adapters.py` |
| M5 | Fixtures 2 a 6 | Sintéticos generados con semilla fija (csv, DDL, minuta); pendientes PDF e imagen (F3) | `scripts/make_synthetic_fixtures.py` |
| Nueva | Colores por faceta | Máximo 8; valores menos frecuentes en «Otros» | `profiles/default.json` (`max_colors_per_facet`) |
| Nueva | Perfil ampliado | Se agregaron facetas `element_kind`, `info_domain`, `sensitivity`, `status`, `origin`, `source_type` y tipos de dato `texto_libre`, `compuesto`, `archivo` sin modificar los parámetros visuales existentes | `profiles/default.json` |
| Nueva | Reglas compartidas | `config/inference.json` es la fuente de verdad de inferencia para backend y visor; los YAML de estándares y cronología se convierten a JSON al sincronizar | `frontend/scripts/sync-data.mjs` |
| M7 (aplicación) | Publicación en Vercel solicitada por Inti (2026-09-22) | Se publica solo el visor con las muestras; la carga de documentos queda desactivada en la compilación pública (`VITE_PUBLIC_DEPLOY=true`) y se habilita solo en instalación local o institucional | `frontend/src/ui/sources.ts`, `frontend/vercel.json` |
| T10 | Backend del módulo Proyectos (FastAPI) con token, CORS, límites de carga, guardia con confirmación nominal y auditoría; el visor lo usa desde la pestaña Proyectos y sigue funcionando sin él | `backend/atlas/api/` |
| Nueva | Fixture interno | `info_para_presentacion.docx` no se versiona (repositorio público); las pruebas que lo usan se omiten si falta | `.gitignore`, `tests/conftest.py` |

## Observaciones del documento fuente pendientes (equipo de registro)

Cardinalidad 1:1 o 1:N (secciones 12, 13, 14) · dominios de valores · descripción duplicada sección 3 · significado de la variable "S" · solapamiento de grado (8 y 11) · metadato de calidad en sección 10 · edad al diagnóstico como variable derivada.
