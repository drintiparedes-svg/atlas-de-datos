# Plan de implementación: Módulo Proyectos del Atlas de Datos

**Versión:** 1.0 · **Fecha:** 2026-09-22 · **Solicitante:** Dr. Inti Paredes (Informática Médica y Salud Digital, FALP)
**Documentos base:** `atlas-spec-modelo-grafos-v2.md` (especificación del modelo) y `atlas-oncologico-v2.html` (prototipo de referencia, desplegado en https://atlas-oncologico.vercel.app).
**Destinatario:** Claude Code y equipo de desarrollo. Complementa la especificación v2; donde este plan sea más específico, prevalece.

---

## 0. Resumen ejecutivo

**Objetivo.** Convertir el Atlas, hoy construido para un diccionario de variables oncológicas, en un módulo **agnóstico al tipo de documento**. Se podrán subir documentos de cualquier formato (incluidas imágenes) a un proyecto, y el módulo mostrará:

1. Qué tipos de documentos, información y datos contiene la base.
2. Cómo se organiza su metadata.
3. Cómo se relacionan los elementos entre documentos.

El resultado validado servirá como **memoria estructurada para un agente de IA**.

**Principio central.** Separar el sistema en tres capas independientes:

```
[1] Adaptadores por formato  →  [2] Modelo universal (AGF)  →  [3] Visor del Atlas (motor actual)
    docx, pdf, xlsx, imagen…       nodos, aristas, facetas,        vistas, capas, notas, trazabilidad,
    cada uno produce el mismo      procedencia y calidad           simplificada/detallada, atrás,
    formato de salida                                              etiquetas sin solapamiento
```

El visor deja de conocer "variables oncológicas": solo lee el **Atlas Graph Format (AGF)** y un **perfil de visualización** (colores, formas, facetas). El grafo oncológico actual se convierte en el primer caso de prueba: debe verse igual que hoy, pero generado desde AGF.

**Resultado esperado por fase:**

| Fase | Resultado visible |
|---|---|
| F0 | El prototipo actual se genera desde AGF, sin diferencias visuales. |
| F1 | Vista de proyecto con varias fuentes, selector "Agrupar por" e inventario. |
| F2 | Carga de documentos en el navegador (docx, xlsx, csv, md, json) sin enviar datos a servidores. |
| F3 | Backend con PDF, presentaciones, imágenes (OCR), correos y esquemas de bases de datos. |
| F4 | Relaciones entre documentos y revisión humana. |
| F5 | Memoria para agentes: índices, paquetes de contexto y servidor MCP. |
| F6 | Endurecimiento: seguridad, auditoría y evaluación. |

---

## 1. Preguntas que el módulo debe responder

El diseño se valida contra estas preguntas. Cada una tiene una vista o métrica asignada (sección 9).

| # | Pregunta | Dónde se responde |
|---|---|---|
| P1 | ¿Qué fuentes tiene el proyecto y de qué tipo son? | Mapa del proyecto; Inventario |
| P2 | ¿Qué información contienen (dominios) y con qué tipos de dato? | Agrupar por faceta; Inventario, matriz fuente × dominio |
| P3 | ¿Cómo se organiza la metadata dentro de cada fuente? | Vista Estructura / Combinada de la fuente |
| P4 | ¿Qué elementos se repiten o conectan entre fuentes? | Vista Interconexión; pestaña Relaciones |
| P5 | ¿Qué falta, qué está duplicado o es inconsistente? | Trazabilidad (prioridad de corrección) |
| P6 | ¿Qué contiene datos personales o sensibles? | Faceta Sensibilidad; alerta de la guardia de datos personales |
| P7 | ¿Qué parte está validada y lista para la memoria de un agente? | Faceta Estado; Inventario, cobertura de validación |

---

## 2. Del Atlas actual al modelo universal

### 2.1 Correspondencia de conceptos

| Atlas oncológico (hoy) | Modelo universal (AGF) | Ejemplos en otros documentos |
|---|---|---|
| Caso oncológico (raíz) | `project` (raíz del proyecto) | "Registro oncológico FALP", "Base oncohematológica" |
| (no existía) | `source` (fuente) | Un docx, una planilla, un PDF, una imagen, un esquema SQL |
| Categoría | `section` (sección) | Capítulo, hoja de Excel, tabla SQL, diapositiva, región de imagen |
| Subcategoría | `section` hija (`parent_id`) | Subcapítulo, bloque de columnas, subtabla |
| Variable | `element` (elemento) | Campo, columna, entidad, concepto, afirmación, decisión, figura |
| Tipo de dato | **Faceta** de agrupación (una entre varias) | Tipo de dato, tipo de elemento, dominio, sensibilidad |
| Grupo de metadata | `group` = sección × valor de faceta | "Fechas · 3", "Personas · 5", "Identificadores personales · 2" |
| Terminología | `vocabulary` | CIE-10, CIE-O-3, SNOMED CT, LOINC, catálogos internos |
| Cronología | Relación `precedes` | Secuencia de hitos, fechas de un protocolo |
| Observación | `finding` (hallazgo de calidad) | Duplicados, ambigüedades, dominios faltantes |

### 2.2 Tipos de elemento (`element_kind`)

| Clave | Descripción | Típico en |
|---|---|---|
| `field` | Campo o variable definida | Diccionarios, formularios |
| `column` | Columna de una tabla con datos | Planillas, bases de datos |
| `entity` | Persona, organización, sistema, lugar | Informes, minutas, correos |
| `concept` | Concepto clínico o técnico | Protocolos, guías |
| `claim` | Afirmación con evidencia (hallazgo) | Informes, artículos |
| `decision` / `task` / `event` / `question` | Objetos de conocimiento (compatibles con el Segundo Cerebro) | Minutas, correos |
| `figure` / `table` | Figura, diagrama o tabla embebida | PDF, presentaciones, imágenes |

### 2.3 Facetas universales

Una **faceta** es una dimensión de clasificación con valores, colores y reglas. El selector **"Agrupar por"** elige qué faceta forma los grupos de metadata, igual que hoy lo hace el tipo de dato. Todas son configurables en `config/facets.yaml`.

| Faceta | Valores iniciales | Aplica a |
|---|---|---|
| **F1 · Tipo de fuente** | diccionario de datos, tabla/dataset, esquema de base de datos, documento narrativo, presentación, imagen/diagrama, correo, formulario, otro | `source` |
| **F2 · Tipo de elemento** | los de 2.2 | `element` |
| **F3 · Tipo de dato** | fecha, categórica, binario, numérica, código estandarizado, identificador, **texto libre**, **compuesto** (lista/JSON), **archivo** | `field`, `column` |
| **F4 · Dominio de información** | demográfico, territorial, previsional/administrativo, diagnóstico, tratamiento, evolución y desenlace, biomarcadores y laboratorio, operacional/proceso, financiero, investigación, documental | `element`, `section` |
| **F5 · Sensibilidad** | pública, interna, confidencial, dato personal, dato sensible de salud | `element`, `source` |
| **F6 · Estado de validación** | propuesto, validado, rechazado | todos |
| **F7 · Origen** | extraído, inferido, manual | todos |

Notas:
- **F4 y F5 son las facetas que responden "qué tipo de información tiene la base".** Hoy no existen en el prototipo. Se infieren con reglas y léxico, se marcan como `inferido` y se validan.
- **F5** debe alinearse con el marco legal chileno vigente: Ley 19.628 y su reforma por la Ley 21.719 sobre protección de datos personales, y Ley 20.584 en lo relativo a ficha clínica. La clasificación final requiere revisión de la asesoría legal de FALP (**decisión N3**).

---

## 3. Atlas Graph Format (AGF): contrato entre capas

Todo adaptador produce AGF y el visor solo consume AGF. Esto es lo que hace al sistema agnóstico.

```json
{
  "agf_version": "1.0",
  "project": {"id": "prj_registro_onco", "name": "Registro oncológico FALP"},
  "profile": "default",
  "sources": [
    {"id": "src_dicc", "name": "Info para presentacion.docx", "sha256": "…", "facets": {"source_type": "diccionario"},
     "adapter": "docx-diccionario@1.0", "ingested_at": "2026-09-22T10:00:00-03:00", "status": "proposed"}
  ],
  "nodes": [
    {"id": "sec:src_dicc:6", "kind": "section", "source_id": "src_dicc", "name": "Cronología y Proceso Diagnóstico",
     "order": 6, "number": 6, "description": "Registra los hitos temporales…",
     "facets": {"info_domain": "diagnostico"},
     "provenance": {"locator": {"paragraph": 25}, "excerpt": "6. Cronología y Proceso Diagnóstico."},
     "origin": "extracted", "status": "proposed", "confidence": 1.0},
    {"id": "el:fecha-de-emision-diagnostico", "kind": "element", "source_id": "src_dicc", "parent_id": "sec:src_dicc:6",
     "name": "Fecha de emisión diagnóstico",
     "facets": {"element_kind": "field", "data_type": "fecha", "info_domain": "diagnostico", "sensitivity": "dato_sensible_salud"},
     "facet_origin": {"data_type": "inferred", "info_domain": "inferred", "sensitivity": "inferred"},
     "provenance": {"locator": {"paragraph": 29}, "excerpt": "Fecha de emisión diagnóstico"},
     "origin": "extracted", "status": "proposed", "confidence": 0.95}
  ],
  "edges": [
    {"kind": "contains", "source": "sec:src_dicc:6", "target": "el:fecha-de-emision-diagnostico"},
    {"kind": "precedes", "source": "el:fecha-de-toma-del-informe-diagnostico", "target": "el:fecha-de-emision-diagnostico",
     "layer": "time", "origin": "inferred", "status": "proposed"},
    {"kind": "same_as", "source": "el:fecha-de-emision-diagnostico", "target": "el:col-fecha_emision_dx",
     "origin": "inferred", "confidence": 0.82, "status": "proposed"}
  ],
  "findings": [
    {"id": "f1", "priority": "bloqueante", "title": "Cardinalidad no especificada", "node_ids": ["sec:src_dicc:12"],
     "action": "Definir si cada caso admite uno o varios eventos…", "status": "open"}
  ]
}
```

**Reglas del contrato:**

1. Los **grupos no se guardan**: el visor los calcula según la faceta elegida en "Agrupar por". Esto permite reagrupar sin reprocesar.
2. Toda faceta inferida declara su origen en `facet_origin`.
3. Los identificadores son estables (reglas de la sección 4.6 de la especificación v2), para comparar versiones.
4. Un adaptador puede omitir facetas que no conoce. El visor muestra "sin clasificar" y no inventa valores.
5. Esquema formal en `schemas/agf-1.0.json` (JSON Schema). Todo AGF se valida antes de publicarse.

### 3.1 Perfil de visualización

Archivo `profiles/default.json`, que reemplaza las constantes `TYPES`, `STDS` y colores escritas hoy dentro del HTML:

```json
{
  "facets": {
    "data_type": {"label": "Tipo de dato", "values": {
      "fecha": {"label": "Fecha", "plural": "Fechas", "color": "--t-fecha"},
      "binario": {"label": "Binario", "plural": "Binarios", "color": "--t-binario"}
    }},
    "info_domain": {"label": "Dominio de información", "values": {"diagnostico": {"label": "Diagnóstico", "color": "--d-dx"}}}
  },
  "default_group_by": "data_type",
  "shapes": {"project": "circle-accent", "source": "rounded-square", "section": "circle-hub",
             "group": "ring", "element": "dot", "vocabulary": "diamond"}
}
```

Restricción de diseño: cada faceta usa como máximo 8 colores distinguibles. Si una faceta tiene más valores, los menos frecuentes se agrupan en "Otros". Se mantiene la estética editorial y los tokens de color del prototipo.

---

## 4. Adaptadores por tipo de documento

### 4.1 Contrato de adaptador

```
entrada: archivo + metadatos de carga
salida:  IR (árbol intermedio) → normalizador → AGF
obligatorio: localizador exacto por nodo, lista "unparsed", confianza por inferencia,
             cero invención de elementos, versión del adaptador en cada nodo
```

### 4.2 Catálogo de adaptadores

| Adaptador | Formatos | Secciones | Elementos | Facetas que infiere | Relaciones propias |
|---|---|---|---|---|---|
| `docx-diccionario` | .docx | Encabezados numerados en negrita, "Subcategoría:" | Viñetas numeradas | tipo de dato, dominio, terminología | cronología por plantilla |
| `docx-narrativo` | .docx, .odt, .rtf | Títulos y estilos de encabezado | Fragmentos → entidades, afirmaciones, objetos de conocimiento | tipo de elemento, dominio | menciones, relaciones entre entidades |
| `tabla` | .xlsx, .xls, .csv, .tsv | Hojas o archivo | Columnas | tipo de dato **desde los valores** (no solo el nombre), nulos %, cardinalidad, dominio propuesto | columnas llave candidatas |
| `esquema-bd` | .sql (DDL), JSON Schema, diccionario exportado, conexión de **solo metadatos** (`information_schema`) | Tablas / vistas | Columnas | tipo de dato nativo, nulabilidad, llaves | **llaves foráneas** como aristas `references` |
| `pdf` | .pdf con texto | Encabezados por tipografía, páginas | Según perfil (diccionario o narrativo) | igual al perfil | igual al perfil |
| `pdf-escaneado` | .pdf sin texto | Páginas | OCR → perfil | igual al perfil, confianza reducida | igual |
| `presentacion` | .pptx | Diapositivas | Títulos, viñetas, tablas, figuras | tipo de elemento, dominio | orden de diapositivas |
| `imagen` | .png, .jpg, .heic, .tiff, .webp | Regiones detectadas (título, tabla, diagrama) | Texto OCR; en diagramas, cajas como elementos | tipo de elemento | flechas del diagrama como aristas propuestas |
| `correo` | .eml, .msg | Hilo / mensaje | Personas, fechas, decisiones, compromisos, adjuntos (recursivos) | tipo de elemento | respuesta, adjunto de |
| `markdown` | .md, .txt | `#`, `##` | Listas y párrafos | según perfil | enlaces `[[ ]]` |
| `json` | .json | Objetos | Claves | tipo de dato desde valores | anidamiento |
| `generico` | cualquier otro | ninguna | ninguno; solo el nodo `source` con metadatos | tipo de fuente = otro | ninguna |

**Decisión técnica clave (recomendada):** el adaptador `esquema-bd` trabaja **solo con metadatos y estadísticas agregadas**, nunca con filas de pacientes. Es la forma más segura de responder "qué tipos de datos tiene la base de datos" sin exponer información clínica.

### 4.3 Clasificación automática de la fuente

1. Reglas por extensión y estructura (p. ej., docx con más de 60 % de párrafos numerados en viñetas bajo encabezados numerados → `diccionario`).
2. Si la IA está encendida: propuesta del modelo con justificación.
3. El usuario confirma o corrige el perfil **antes** de publicar. El perfil queda registrado en la procedencia.

---

## 5. Visor: qué se conserva y qué se agrega

### 5.1 Se conserva íntegro (funcionalidades actuales)

- Versión **Simplificada / Detallada** y vistas **Estructura / Combinada / Por tipo**.
- Capas transversales (terminologías, cronología), ahora genéricas: cualquier tipo de arista puede declararse como capa.
- Notas tipo Obsidian con frontmatter, enlaces `[[ ]]` y reglas de calidad.
- Pestañas Nota, Categorías (renombrada **Secciones**), Tipos (renombrada **Facetas**), Trazabilidad.
- **Atrás / Inicio** con historial completo, búsqueda, filtros, controles Separar y Distancia.
- **Etiquetas sin solapamiento** (algoritmo de la sección 5.4).
- Prioridad de corrección (Bloqueante, Importante, Menor) con "Qué hacer".

### 5.2 Se agrega

| Elemento | Descripción |
|---|---|
| **Nivel Proyecto** | Nuevo nivel sobre la raíz actual. Vista simplificada: proyecto al centro, fuentes en anillo con su anillo de composición (por la faceta activa) y aristas entre fuentes con grosor según elementos compartidos. Clic en una fuente: se abre su grafo (la vista actual). |
| **Selector "Agrupar por"** | Faceta activa para formar grupos y colorear: tipo de dato, tipo de elemento, dominio, sensibilidad, estado, origen. Se registra en el historial de Atrás. |
| **Pestaña Fuentes** | Zona de carga (arrastrar y soltar), cola con estado por archivo (en cola, extrayendo, pendiente de revisión, publicado, error con causa), perfil sugerido y confirmación. |
| **Pestaña Inventario** | Respuesta directa a "qué tiene la base": conteos por faceta, matriz fuente × dominio, sensibilidad, cobertura de validación, elementos sin clasificar (sección 9). |
| **Pestaña Relaciones** | Elementos compartidos entre fuentes, propuestas `same_as` pendientes, llaves foráneas, referencias entre documentos. |
| **Pestaña Revisión** | Bandeja de todo lo `proposed`, con acciones aceptar, rechazar, editar y acción masiva con confirmación. |
| **Vista Interconexión** | Fuentes en el anillo exterior; elementos presentes en 2 o más fuentes al centro; elementos exclusivos junto a su fuente, agrupados por la faceta activa. |

### 5.3 Reglas de escala (nivel de detalle)

| Nodos visibles | Comportamiento |
|---|---|
| < 300 | Motor canvas actual, todas las funciones |
| 300 a 2.000 | Etiquetas de elementos solo al acercar o enfocar; repulsión con quadtree (Barnes-Hut) |
| > 2.000 | Render WebGL (sigma.js sobre graphology) con los mismos tokens y formas; el nivel Proyecto agrega fuentes y muestra conteos |

### 5.4 Algoritmo de etiquetas sin solapamiento (ya implementado en el prototipo v2)

1. Candidatas por prioridad: foco y vecindario, coincidencias de búsqueda, raíz, secciones, facetas, subsecciones, grupos, vocabularios, elementos.
2. Cada etiqueta prueba cuatro posiciones (abajo, arriba, derecha, izquierda), empezando por la del cuadro anterior para evitar parpadeo.
3. Se descartan posiciones que choquen con etiquetas ya colocadas o con nodos (los elementos evitan todos los nodos; los nodos principales evitan los nodos principales).
4. Si no cabe: las secciones se acortan a su número; el resto se oculta hasta acercar el zoom o pasar el cursor. El foco siempre se muestra.
5. El tamaño en pantalla se mantiene entre 85 % y 110 % del tamaño base con cualquier zoom; los nombres largos de sección se parten en dos líneas.

---

## 6. Relaciones entre documentos

| Relación | Cómo se detecta | Validación |
|---|---|---|
| `same_as` | Nombre normalizado idéntico; similitud de texto ≥ 0,85; similitud de vectores (si hay IA); coincidencia de dominio de valores | Humana obligatoria |
| `references` | Llaves foráneas (esquema BD); citas explícitas a otro documento; enlaces | Automática si es explícita; humana si es inferida |
| `derived_from` | Plantillas (p. ej., edad ← fecha nacimiento + fecha diagnóstico); columnas calculadas en DDL | Humana |
| `mentions` | Fragmento que nombra una entidad o elemento | Automática, con evidencia |
| `shares` (agregada) | Dos fuentes con ≥ k elementos `same_as` validados (k = 2 por defecto) | Derivada |
| `precedes` | Plantillas de cronología por dominio | Humana |

Nunca se fusionan nodos automáticamente. Las equivalencias se representan con aristas y se validan.

---

## 7. Flujo de carga (experiencia de usuario)

```
1. Crear proyecto (nombre, propósito, responsable)
2. Arrastrar archivos a la pestaña Fuentes
3. Guardia de datos personales: si detecta RUT, nombres con fechas, correos o fichas → alerta y bloqueo de IA
4. Extracción en cola, con estado visible por archivo
5. Perfil sugerido por archivo → el usuario confirma o corrige
6. Grafo propuesto de la fuente + hallazgos de calidad
7. Revisión: aceptar / corregir tipos, dominios, sensibilidad, equivalencias
8. Publicar versión del proyecto (queda registro en auditoría)
9. (Opcional) Actualizar la memoria del agente con lo validado
```

---

## 8. Puente a la memoria del agente de IA

El módulo produce la memoria. La especificación v2 (sección 20) define cómo se consulta. Este plan precisa **qué se exporta** y **en qué forma**.

### 8.1 Qué entra a la memoria

| Nivel | Contenido | Condición |
|---|---|---|
| **Catálogo de datos** | Fuentes, secciones, elementos, facetas, vocabularios y relaciones | `status: validated` |
| **Conocimiento** | Afirmaciones, decisiones, eventos y preguntas con evidencia | `validated`, con fragmento de respaldo |
| **Reglas** | Reglas de calidad y de validación derivadas (tipos, dominios, cronología) | Aprobadas |
| **Hipótesis** | Lo propuesto no validado | Solo si el agente lo pide, siempre marcado |

### 8.2 Ficha de memoria por elemento (formato de exportación)

```markdown
---
id: el:fecha-de-emision-diagnostico
tipo_elemento: campo
tipo_dato: fecha
dominio: diagnóstico
sensibilidad: dato sensible de salud
fuente: "[[Info para presentacion.docx]]"
seccion: "[[06 · Cronología y Proceso Diagnóstico]]"
estado: validado
validado_por: <responsable>
vigente_desde: 2026-09-22
---
Fecha en que se emite el informe diagnóstico.
Posterior a [[Fecha de toma del informe diagnóstico]]; anterior a [[Fecha de ingreso al GES]].
Equivale a [[fecha_emision_dx]] en la tabla `registro_tumores` (validado).
Evidencia: Info para presentacion.docx, párrafo 29.
```

### 8.3 Uso por el agente

- **Consultar el catálogo:** "¿Dónde está la fecha de diagnóstico y con qué otros datos se relaciona?"
- **Anclar consultas a datos reales:** el agente conoce nombres de tablas y columnas validados antes de proponer una consulta SQL, lo que reduce la invención de campos.
- **Explicar procedencia:** cada respuesta cita la fuente y la ubicación exacta.
- **Proponer conocimiento:** el agente puede proponer nodos o aristas, que entran a la bandeja de revisión; nunca escribe directo.

Interfaces: `memory.jsonl`, fichas markdown por elemento (compatibles con bóveda Obsidian y con sistemas de memoria basados en archivos), servidor MCP `atlas-mcp` (búsqueda, nodo, vecinos, camino, paquete de contexto, propuesta supervisada).

---

## 9. Inventario: métricas para "qué tiene la base"

| Métrica | Definición | Pregunta |
|---|---|---|
| Fuentes por tipo | Conteo de `source` por F1 | P1 |
| Elementos por tipo de elemento | Conteo por F2 | P2 |
| Composición por tipo de dato | Conteo y % por F3, por fuente | P2 |
| Matriz fuente × dominio | Tabla de calor: filas = fuentes, columnas = F4, valor = elementos | P2, P4 |
| Mapa de sensibilidad | Elementos por F5 y fuentes que contienen datos sensibles | P6 |
| Elementos puente | Elementos con `same_as` en ≥ 2 fuentes | P4 |
| Huérfanos | Elementos sin sección, sin faceta o sin relación | P5 |
| Hallazgos abiertos | Por prioridad de corrección | P5 |
| Cobertura de validación | % de nodos `validated` por fuente y total | P7 |
| Sin clasificar | % de elementos sin valor en F3, F4 o F5 | P2, P5 |

---

## 10. Arquitectura y ruta técnica

| Componente | Propuesta | Nota |
|---|---|---|
| Visor | Motor canvas actual refactorizado a módulo TypeScript que lee AGF + perfil | F0 |
| Carga en navegador (MVP) | JSZip (docx), SheetJS (xlsx/csv), parser markdown, todo en el cliente | F2: los documentos no salen del equipo |
| Backend | Python 3.12 + FastAPI; cola de trabajos | F3 |
| Extracción | python-docx, pdfplumber, python-pptx, openpyxl/pandas, Tesseract (OCR), extract-msg, sqlglot (DDL) | F3 |
| Persistencia | SQLite (v1) → PostgreSQL si escala | F3 |
| Índices de memoria | FTS5 + vectores (sqlite-vec) | F5 |
| Validación de contrato | JSON Schema de AGF en frontend y backend | Todas |

**Ruta recomendada:** validar primero el carácter agnóstico **en el navegador** (F0 a F2), sin backend ni datos saliendo del equipo, y solo después invertir en backend, OCR y memoria.

---

## 11. Plan por fases

El esfuerzo relativo (S, M, L) es orientativo, supone un desarrollador con apoyo de Claude Code y debe recalibrarse al cerrar F0.

| Fase | Alcance | Entregables | Criterio de aceptación | Esfuerzo |
|---|---|---|---|---|
| **F0 · Motor agnóstico** | Extraer datos del HTML a AGF; perfil de visualización; visor lee AGF | `schemas/agf-1.0.json`, `profiles/default.json`, `samples/oncologia.agf.json`, visor refactorizado | El grafo oncológico se ve idéntico al prototipo v2 (regresión visual) y reproduce el caso dorado: 16 / 6 / 87 / 18 grupos | M |
| **F1 · Nivel proyecto** | Proyecto con varias fuentes; "Agrupar por"; Inventario; Interconexión | Vista Proyecto, pestañas Inventario y Relaciones, facetas F4 a F7 | Con 3 AGF de ejemplo, el inventario responde P1, P2 y P7; reagrupar no reprocesa | M |
| **F2 · Carga en navegador** | Adaptadores `docx-diccionario`, `tabla` (xlsx/csv), `markdown`, `json` en el cliente | Pestaña Fuentes funcional; guardia de datos personales básica | Subir el docx original reproduce el grafo actual; una planilla sintética genera columnas con tipo inferido desde valores; sin llamadas de red | M |
| **F3 · Backend y formatos** | Adaptadores `pdf`, `pdf-escaneado`, `presentacion`, `imagen`, `correo`, `esquema-bd` (solo metadatos) | API, cola, persistencia, versionado y diff | Un fixture por formato con cifras esperadas; DDL con 3 llaves foráneas genera 3 aristas `references` | L |
| **F4 · Relaciones y revisión** | `same_as`, resolución de entidades, bandeja de revisión, auditoría | Pestaña Revisión, registro de auditoría | Proyecto de prueba con 5 fuentes: propuestas `same_as` con precisión ≥ 0,9 sobre el conjunto de referencia | M |
| **F5 · Memoria del agente** | Exportación, índices, paquete de contexto, servidor MCP | `memory.jsonl`, fichas markdown, `atlas-mcp` | Un agente responde 20 preguntas de referencia citando fuente; 0 afirmaciones sin cita; toda escritura llega a la bandeja | L |
| **F6 · Endurecimiento** | Seguridad, control de acceso por proyecto, escala WebGL, evaluación continua | Informe de pruebas, manual de operación | 2.000 nodos a 60 cuadros por segundo; guardia de datos personales con sensibilidad ≥ 0,95 en conjunto de prueba | M |

---

## 12. Conjunto de prueba multi documento

Todos los fixtures deben ser **sintéticos o sin datos de pacientes**.

| # | Fixture | Adaptador | Qué valida |
|---|---|---|---|
| 1 | `info_para_presentacion.docx` (real, sin datos de pacientes) | docx-diccionario | Caso dorado actual |
| 2 | Planilla sintética del registro (200 filas ficticias) | tabla | Tipo de dato desde valores; `same_as` con el fixture 1 |
| 3 | DDL SQL de un esquema de registro (ficticio) | esquema-bd | Tablas, columnas, llaves foráneas |
| 4 | Protocolo clínico en PDF (público) | pdf / narrativo | Entidades, conceptos, terminologías |
| 5 | Imagen de un diagrama de flujo de proceso | imagen | OCR y aristas propuestas desde flechas |
| 6 | Minuta de reunión (markdown o docx) | narrativo | Decisiones, tareas, personas |

**Criterio global:** con los 6 fixtures en un proyecto, el Inventario muestra 6 fuentes en al menos 5 tipos distintos, la matriz fuente × dominio no tiene celdas "sin clasificar" por encima del 10 %, y la vista Interconexión muestra como puente la variable de fecha de diagnóstico entre los fixtures 1, 2 y 3.

---

## 13. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Carga de documentos con datos de pacientes | Legal y reputacional | Guardia de datos personales antes de procesar; bloqueo de IA; política de uso; adaptador de BD solo con metadatos |
| Sobreinferencia (tipos, dominios, equivalencias incorrectas) | Memoria del agente contaminada | Todo inferido queda `proposed`; solo lo validado entra a la memoria confiable |
| Heterogeneidad extrema de documentos | Grafos pobres o ruidosos | Perfiles por tipo; adaptador `generico` como piso; métricas de "sin clasificar" visibles |
| Escala (miles de nodos) | Visor lento o ilegible | Divulgación progresiva, nivel Proyecto agregado, WebGL, etiquetas sin solapamiento |
| Dependencia de un proveedor de IA | Costo, disponibilidad, privacidad | IA apagada por defecto; adaptador intercambiable; OCR local |
| Deriva entre versiones de documentos | Relaciones obsoletas | IDs estables, versionado, diff y vigencia temporal |

---

## 14. Decisiones que requieren tu validación

| # | Decisión | Nivel | Recomendación |
|---|---|---|---|
| M1 | Adoptar las facetas F4 (dominio) y F5 (sensibilidad) como nuevas dimensiones | N2 | Sí; F5 con revisión legal |
| M2 | Clasificación de sensibilidad alineada al marco legal chileno | N3 | Validar con asesoría legal de FALP antes de F3 |
| M3 | Ruta "navegador primero" (F0 a F2 sin backend) | N2 | Sí: valida el enfoque sin exponer datos |
| M4 | Adaptador de base de datos solo con metadatos (sin filas) | N3 | Sí, como regla permanente |
| M5 | Fuentes de los fixtures de prueba 2 a 6 | N2 | Sintéticos o públicos; tú apruebas cuáles |
| M6 | Qué agentes consumen la memoria y con qué permisos | N3 | Lectura para agentes internos; propuesta solo para agentes autorizados |
| M7 | Hosting del módulo con carga de documentos (hoy el prototipo es público en Vercel) | N3 | Un módulo con carga de documentos **no** debe publicarse en una URL abierta; desplegar en infraestructura institucional o con autenticación |

---

## 15. Trazabilidad de este plan

- **Basado en:** especificación v2 del Atlas (secciones 4 a 8, 19 y 20), prototipo v2 con etiquetas sin solapamiento (verificado en navegador sin errores, sin superposiciones en vista detallada y simplificada) y requerimientos expresados el 2026-09-21 y 2026-09-22.
- **Supuestos:** un desarrollador con Claude Code; documentos de proyecto sin datos identificables de pacientes; IA opcional.
- **Límites:** los esfuerzos son relativos y no están calibrados; la precisión de adaptadores distintos al diccionario docx no está medida; las referencias legales deben confirmarse con la asesoría jurídica.
- **Pendiente de medir:** desempeño de la inferencia de dominio (F4) y sensibilidad (F5) sobre documentos reales de FALP.
