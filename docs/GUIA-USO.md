# Guía de uso del Atlas de Datos

El Atlas responde tres preguntas sobre la información de un proyecto: **qué existe**, **cómo se organiza** y **cómo se relaciona**. Una misma pantalla sirve a quien solo busca saber qué datos existen y a quien trabaja con datos; la diferencia está en el **nivel de detalle** de la barra superior:

| Nivel | Qué muestra |
|---|---|
| **Simplificada** (predeterminado) | Solo secciones (o fuentes) con un anillo de composición; cada una se abre con un clic. Portada con preguntas guiadas. |
| **Detallada** | Red completa: vistas Estructura, Combinada y Por tipo, capas, «Agrupar por» cualquier faceta y fuerzas. |

Todas las pestañas (Nota, Proyectos, Secciones, Facetas, Relaciones, Patrones, Fuentes, Trazabilidad) están disponibles en ambos niveles. La elección se recuerda en el navegador.

## 1. Poner en marcha

```bash
# Backend (Python 3.11+)
python -m venv .venv && source .venv/bin/activate
pip install -e backend            # instala el comando `atlas`
pytest -q backend/tests           # pruebas del backend y de la API

# Visor (Node 20+)
cd frontend && npm install
npm run dev                       # http://127.0.0.1:5173 con la muestra oncológica
npm run build                     # dist/ estático; abrir con cualquier servidor de archivos
```

El visor no necesita backend: lee un archivo AGF (`?agf=`) y el perfil de visualización. Con `npm run build` y luego `pytest -q backend/tests/test_viewer.py` se ejecutan las pruebas del visor en Chromium (caso dorado, capturas claro y oscuro, carga en el navegador, guardia de datos personales).

Muestras incluidas (`samples/`):

| Archivo | Contenido |
|---|---|
| `oncologia.agf.json` | Diccionario del registro oncológico (caso dorado): 16 secciones, 6 subsecciones, 87 variables, 18 grupos, 7 hallazgos. |
| `proyecto_registro.agf.json` | Proyecto con 4 fuentes: el diccionario, una planilla sintética, un esquema SQL ficticio y una minuta markdown, con 43 equivalencias propuestas. Abrir con `?agf=./data/proyecto_registro.agf.json`. |
| `*.vectors.json` | Índices de vectores (proveedor `hash`) para búsqueda semántica en el navegador. |

## 2. Portada y preguntas guiadas

La portada ofrece cinco preguntas:

1. **Buscar un dato.** Escribe un nombre o una idea en la barra superior («fecha de diagnóstico», «biomarcadores», «comuna»). Los resultados se agrupan por tipo y explican por qué aparecen: nombre exacto, contiene la consulta, comparte palabras o parecido semántico. Enter abre el primero.
2. **¿Qué tipos de información hay?** Pestaña **Proyectos** (inventario): datos por tipo de dato, dominio de información y sensibilidad; matriz fuente × dominio; datos puente entre fuentes; porcentaje sin clasificar; hallazgos por prioridad; cobertura de validación. Cada barra o celda lleva a la lista de datos correspondiente.
3. **¿Cómo se relacionan dos datos?** Pestaña **Relaciones**: elige dos datos y el Atlas muestra el camino que los une, paso a paso, indicando el tipo de relación (cronología, equivalencia, referencia, parecido o pertenencia), su estado (validado o propuesto) y su confianza.
4. **¿Cómo se organiza el documento?** Pestaña **Secciones**: lista con la composición de cada sección.
5. **¿Qué falta o hay que corregir?** Pestaña **Trazabilidad**: hallazgos con prioridad Bloqueante / Importante / Menor y «qué hacer».

En el grafo, cada círculo grande es una sección (o una fuente, en un proyecto). Un clic la abre y muestra sus datos agrupados. Pasar el cursor por un punto aísla su vecindario; un clic abre su nota. **← Atrás** e **Inicio** están siempre disponibles.

Todo lo marcado como **# inferido** fue propuesto por reglas o por modelos y aún no fue validado por una persona. El Atlas nunca presenta una inferencia como un hecho.

## 3. Controles del nivel Detallada

- **Nivel de detalle:** Simplificada (secciones con anillo de composición) o Detallada (red completa).
- **Vista:** Estructura (fiel al documento), Combinada (grupos de metadata por faceta dentro de cada sección) o Por tipo (catálogo).
- **Agrupar por:** tipo de dato, dominio de información, sensibilidad, tipo de elemento, estado de validación u origen. Los grupos se recalculan al instante: no se guardan en el AGF (regla 1 del contrato).
- **Capas:** terminologías, cronología esperada, equivalencias entre fuentes, referencias y llaves foráneas, parecidos semánticos, fuentes que comparten datos. Solo aparecen las capas con aristas en el ámbito actual.
- **Ámbito** (proyectos con varias fuentes): Proyecto (mapa e interconexión) o una fuente (su grafo completo).
- **Fuentes:** arrastrar docx, csv, tsv, xlsx, sql, md, txt, json o `.agf.json`. Se procesan en el navegador; ningún dato sale del equipo. La guardia de datos personales detiene el archivo si detecta RUT, correos, teléfonos o nombres con fechas, y exige confirmación explícita.
- **Relaciones:** revisar las equivalencias propuestas (aceptar ✓ o rechazar ✕), aceptar en bloque las de nombre idéntico y descargar el AGF con la revisión.
- **Fuerzas:** Separar (200 a 12000) y Distancia (0,3× a 3,0×).

## 4. Línea de comandos (`atlas`)

```bash
atlas ingest docs/diccionario.docx -o salida.agf.json --root-name "Caso oncológico"
atlas ingest planilla.csv esquema.sql minuta.md -o proyecto.agf.json --relate
atlas project a.agf.json b.agf.json -o proyecto.agf.json --name "Mi proyecto"
atlas enrich salida.agf.json            # completa dominio y sensibilidad faltantes (inferidos)
atlas embed proyecto.agf.json --provider hash        # índice de vectores lateral
atlas relate proyecto.agf.json          # propone same_as / relates / shares
atlas search proyecto.agf.json "fecha de diagnóstico"
atlas path proyecto.agf.json el:fecha-de-nacimiento el:fecha-de-defuncion
atlas inventory proyecto.agf.json
atlas validate proyecto.agf.json
atlas export-memory proyecto.agf.json -o memoria/   # memory.jsonl + fichas markdown (solo validado)
```

`atlas ingest` se detiene con código 2 si la guardia detecta datos personales; `--allow-personal-data` solo debe usarse tras confirmar que el documento no contiene datos de pacientes.

## 5. Proyectos y archivos (para personas no técnicas)

**Proyectos.** Crea un proyecto con nombre y propósito. Queda guardado en tu navegador y, si quieres un espacio seguro, pulsa «Elegir carpeta en este equipo»: el Atlas escribirá ahí el proyecto completo (manifiesto, documentos originales, grafo por fuente y grafo consolidado). Si esa carpeta está dentro de **Google Drive**, **OneDrive** o de un **repositorio**, la copia se sincroniza sola. También puedes «Descargar paquete .zip» para enviarlo o abrirlo en otro equipo («Abrir paquete .zip» o «Abrir carpeta de un proyecto»). No hay que indicar direcciones ni contraseñas: los documentos nunca salen del equipo.

**Fuentes.** Sube uno o varios archivos a la vez (docx, csv, tsv, xlsx, sql, md, txt, json). Cada archivo aparece con una casilla para **activarlo o desactivarlo** en el grafo y un botón **Quitar**. Al cambiar algo, el grafo, el inventario y las relaciones se recalculan solos. Si la guardia detecta posibles datos personales (RUT, correos, teléfonos, nombres con fecha), el archivo queda pendiente hasta que escribas tu nombre y confirmes que no contiene datos de pacientes; la confirmación queda registrada.

**Modo institucional (opcional).** Para equipos con servidor propio existe un backend (FastAPI, PostgreSQL en Neon) que centraliza proyectos, versiones y auditoría. Se activa solo añadiendo `?api=URL` a la dirección del visor; no aparece en la interfaz normal. Arranque: `pip install -e "backend[server]"`, `cp backend/.env.example backend/.env`, `uvicorn atlas.api.app:app`.

## 6. Patrones: relaciones que no se ven a simple vista

La pestaña **Patrones** entrena en tu navegador un pequeño modelo de atención (una capa del tipo que usan los transformers, aplicada al vecindario de cada dato en el grafo). El modelo aprende a predecir qué datos están conectados y, con eso, propone:

- **Relaciones latentes:** pares de datos sin relación registrada que el modelo considera conectados, con puntaje y explicación (vecinos en común, palabras compartidas, tipo de dato). Se pueden agregar al grafo como propuestas (capa «Relaciones latentes») o descartar.
- **Comunidades:** grupos de datos que el modelo ve juntos más allá de la sección donde están escritos, nombrados por sus palabras más frecuentes.
- **Flujos de fechas:** secuencias de fechas en el orden del documento, indicando qué pasos tienen cronología registrada y cuáles solo predicha.
- **Posibles reubicaciones:** datos que el modelo sitúa más cerca de otra sección que de la suya.

Antes de mostrar resultados, el modelo se evalúa a ciegas: oculta el 15 % de las equivalencias y cronologías conocidas y mide cuántas veces prefiere el enlace real oculto a uno al azar. Ese porcentaje se muestra; por debajo del 70 % conviene desconfiar. Todo lo que produce es hipótesis (`origin: inferred`, `status: proposed`) sobre metadata: nunca ve filas ni datos de pacientes. Desde la línea de comandos: `atlas patterns proyecto.agf.json --add`.

## 7. Modelos abiertos

Ver `docs/MODELOS-ABIERTOS.md`. En resumen: el proveedor `hash` funciona sin red y se replica en el navegador; `st` usa `intfloat/multilingual-e5-small` (sentence-transformers) y `ollama` usa modelos servidos localmente. Ambos requieren `AI_ENABLED=true`.
