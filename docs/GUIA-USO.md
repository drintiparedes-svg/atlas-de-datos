# Guía de uso del Atlas de Datos

El Atlas responde tres preguntas sobre la información de un proyecto: **qué existe**, **cómo se organiza** y **cómo se relaciona**. Está diseñado para dos públicos que usan la misma aplicación:

| Público | Modo | Qué ve |
|---|---|---|
| Personas que solo quieren saber qué datos existen o cómo se relacionan dos datos concretos | **Explorar** | Portada con preguntas guiadas, grafo simplificado, buscador con explicación, inventario, camino entre dos datos, hallazgos con «qué hacer». |
| Personas expertas en datos (informática médica, ciencia de datos, ingeniería) | **Experto** | Todo lo anterior más vistas Estructura / Combinada / Por faceta, capas transversales, «Agrupar por» cualquier faceta, fuerzas, carga de documentos, revisión de equivalencias y descarga del AGF. |

El selector **Explorar · Experto** está en la barra superior. La elección se recuerda en el navegador.

## 1. Poner en marcha

```bash
# Backend (Python 3.11+)
python -m venv .venv && source .venv/bin/activate
pip install -e backend            # instala el comando `atlas`
pytest -q backend/tests           # 28 pruebas del backend

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

## 2. Modo Explorar (para quien busca saber qué existe)

La portada ofrece cinco preguntas:

1. **Buscar un dato.** Escribe un nombre o una idea en la barra superior («fecha de diagnóstico», «biomarcadores», «comuna»). Los resultados se agrupan por tipo y explican por qué aparecen: nombre exacto, contiene la consulta, comparte palabras o parecido semántico. Enter abre el primero.
2. **¿Qué tipos de información hay?** Pestaña **Inventario**: datos por tipo de dato, dominio de información y sensibilidad; matriz fuente × dominio; datos puente entre fuentes; porcentaje sin clasificar; hallazgos por prioridad; cobertura de validación. Cada barra o celda lleva a la lista de datos correspondiente.
3. **¿Cómo se relacionan dos datos?** Pestaña **Relaciones**: elige dos datos y el Atlas muestra el camino que los une, paso a paso, indicando el tipo de relación (cronología, equivalencia, referencia, parecido o pertenencia), su estado (validado o propuesto) y su confianza.
4. **¿Cómo se organiza el documento?** Pestaña **Secciones**: lista con la composición de cada sección.
5. **¿Qué falta o hay que corregir?** Pestaña **Trazabilidad**: hallazgos con prioridad Bloqueante / Importante / Menor y «qué hacer».

En el grafo, cada círculo grande es una sección (o una fuente, en un proyecto). Un clic la abre y muestra sus datos agrupados. Pasar el cursor por un punto aísla su vecindario; un clic abre su nota. **← Atrás** e **Inicio** están siempre disponibles.

Todo lo marcado como **# inferido** fue propuesto por reglas o por modelos y aún no fue validado por una persona. El Atlas nunca presenta una inferencia como un hecho.

## 3. Modo Experto

- **Nivel de detalle:** Simplificada (secciones con anillo de composición) o Detallada (red completa).
- **Vista:** Estructura (fiel al documento), Combinada (grupos de metadata por faceta dentro de cada sección) o Por faceta (catálogo).
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

## 5. Modelos abiertos

Ver `docs/MODELOS-ABIERTOS.md`. En resumen: el proveedor `hash` funciona sin red y se replica en el navegador; `st` usa `intfloat/multilingual-e5-small` (sentence-transformers) y `ollama` usa modelos servidos localmente. Ambos requieren `AI_ENABLED=true`.
