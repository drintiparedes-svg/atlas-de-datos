# Changelog

## [0.2.0] · 2026-09-22

Primera versión construida a partir del paquete de traspaso. Fases F0, F1 y F2 del PLAN completas; F3 (esquema-bd en DDL), F4 (propuestas `same_as` y bandeja de revisión) y F5 (exportación de memoria) parcialmente.

### Backend (`backend/atlas`)
- Adaptadores `docx-diccionario`, `tabla` (csv, tsv, xlsx), `esquema-bd` (DDL con llaves foráneas → `references`), `markdown`, `json` (registros y JSON Schema) y `generico`, con IR común, localizadores y lista `unparsed`.
- Inferencia de tipo de dato (reglas SPEC §6.4, 85/87 sobre el caso dorado, medido en pruebas), tipo desde valores para tablas, dominio de información, sensibilidad (provisional) y vocabulario. Reglas compartidas con el visor en `config/inference.json`.
- Guardia de datos personales (RUT, correo, teléfono, nombre con fecha) que detiene la ingesta.
- Motor de calidad con prioridad Bloqueante / Importante / Menor y «Qué hacer».
- AGF 1.0 con identificadores estables, validación contra el esquema e integridad referencial.
- Consolidación de proyecto multi fuente, propuestas `same_as` / `relates` / `shares`, inventario (P1, P2, P6, P7), búsqueda híbrida y camino explicado.
- Proveedores de embeddings: `hash` (offline, paridad con el visor), `st` (`intfloat/multilingual-e5-small`), `ollama`; `AI_ENABLED=false` por defecto.
- Exportación de memoria: `memory.jsonl` y fichas markdown por elemento (solo validado; propuesto marcado bajo opción).
- CLI `atlas`: ingest, project, enrich, embed, relate, search, path, inventory, validate, stats, export-memory.
- Fixtures sintéticos (csv de 200 filas ficticias, DDL, minuta markdown) y 28 pruebas.

### Visor (`frontend`)
- Motor canvas portado del prototipo a TypeScript (simulación, dibujo, etiquetas sin solapamiento, interacción, historial) que lee AGF + perfil; reproduce el caso dorado sin diferencias de conteo.
- Dos públicos: **Explorar** (portada con preguntas guiadas, grafo simplificado, controles avanzados ocultos) y **Experto** (todo).
- «Agrupar por» cualquier faceta (tipo de dato, dominio, sensibilidad, tipo de elemento, estado, origen); grupos calculados, no guardados; máximo 8 colores por faceta con «Otros».
- Búsqueda híbrida con resultados agrupados y explicados; vectores `hash` calculados en el navegador.
- Pestañas nuevas: Inventario, Relaciones (camino entre dos datos, revisión de equivalencias, descarga del AGF revisado) y Fuentes (carga en el navegador con guardia de datos personales).
- Nivel Proyecto: mapa (simplificada) e interconexión (detallada) con fuentes en anillo, elementos puente y aristas `shares`; ámbito por fuente.
- Capas genéricas por tipo de arista; tema claro u oscuro; API `window.__atlas` para pruebas.
- 10 pruebas Playwright: caso dorado, reagrupación, etiquetas y capturas claro/oscuro, búsqueda y notas, modo Explorar, proyecto, carga en navegador (csv, sql, md, docx), guardia, paridad hash.

### Backend de proyectos (2026-09-22, segunda entrega)
- API FastAPI (`atlas.api.app`): proyectos, carga de fuentes con distintas extensiones, guardia de datos personales con confirmación nominal, publicación de versiones (consolidación, relaciones propuestas, índice de vectores), revisión de aristas y nodos, búsqueda, camino, inventario y auditoría.
- Persistencia con SQLAlchemy: PostgreSQL en Neon (`DATABASE_URL`) o SQLite local; archivos por sha256 en `ATLAS_UPLOAD_DIR`.
- Seguridad: `X-Atlas-Token`, CORS restringido, extensiones y tamaño limitados, sin filas de datos, IA apagada por defecto.
- Visor: pestaña **Proyectos** (antes Inventario) con gestión de proyectos contra el backend e inventario; vista «Por tipo» (antes «Por faceta»); revisión de equivalencias persistida cuando hay backend. 3 pruebas de API y 1 prueba de integración visor + backend.

### Consolidación de niveles (2026-09-22, tercera entrega)
- Se elimina el selector Explorar/Experto (T8). Quedan Simplificada (predeterminado) y Detallada; una sola portada guiada y todas las pestañas y controles siempre visibles.

### Proyectos locales, fuentes activables y patrones ocultos (2026-09-23)
- Pestaña **Proyectos** sin URL ni token: proyectos en el navegador (IndexedDB), carpeta segura en el equipo (File System Access API; apta para Google Drive, OneDrive o un repositorio), paquete .zip exportable e importable. El backend queda como modo institucional con `?api=`.
- Pestaña **Fuentes**: subir uno o varios archivos, activar o desactivar cada uno, quitar, guardia con confirmación nominal; el grafo se recalcula con las fuentes activas y las decisiones de revisión se conservan.
- Pestaña **Patrones**: codificador de grafo con atención entrenado en el navegador (y `atlas patterns` en la CLI con numpy): relaciones latentes con puntaje y explicación, comunidades, flujos de fechas, posibles reubicaciones, prueba ciega. Capa «Relaciones latentes (modelo)».
- Pruebas: 3 del modelo latente y 2 de Playwright (proyectos locales y patrones).

### Cuadros ajustables (2026-09-23)
- Los cuadros **Ajustes** y **Nota** se redimensionan: asa en el borde (arrastre con ratón o dedo), teclado sobre el asa (flechas, Mayús para pasos de 64 px, Inicio o Intro para restablecer), botón **Ampliar / Reducir** en cada cuadro, doble clic en el asa para volver al ancho original y botón **Ocultar** en Ajustes.
- Los anchos se guardan en el navegador (`atlas.settingsW`, `atlas.panelW`, `atlas.*Wide`) y se recortan al máximo permitido si la ventana se achica; límites: Ajustes 224 px a 40 rem, Nota 288 px a 94 % de la ventana.
- El área útil del grafo se calcula con los anchos reales de los cuadros y se recentra al terminar cada ajuste; si los cuadros ampliados dejan menos de 320 px, el grafo usa toda la ventana.
- Pantallas de 640 px o menos: los cuadros ocupan todo el ancho y las asas se ocultan (quedan Ampliar y Ocultar).
- Prueba Playwright `test_settings_and_note_panels_are_resizable_and_persist` (arrastre, teclado, límites, Ampliar, persistencia tras recargar, restablecer, ocultar y pantalla estrecha).

### Publicación
- Compilación pública (`VITE_PUBLIC_DEPLOY=true`) que desactiva la carga de documentos según M7; `frontend/vercel.json`; enlaces a las muestras en la portada.

### Documentación
- `docs/GUIA-USO.md`, `docs/MODELOS-ABIERTOS.md`, README y decisiones nuevas en `docs/DECISIONS.md`.

## [Sin publicar]
- Paquete inicial de traspaso desde Claude (Cowork), 2026-09-22.
