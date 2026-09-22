# Atlas: especificación del modelo de grafos documentales

**Versión:** 2.0 · **Fecha:** 2026-09-22 (v1.0: 2026-09-21; cambios en la sección 18) · **Autor del requerimiento:** Dr. Inti Paredes (Informática Médica y Salud Digital, FALP)
**Destinatario:** Claude Code, como documento fundacional (`SPEC.md`) de un proyecto nuevo.
**Prototipo de referencia:** `atlas-oncologico.html` (desplegado en https://atlas-oncologico.vercel.app). Copiar el archivo en `reference/prototype.html` del repositorio. Es la fuente de verdad visual y de interacción.

---

## 0. Cómo usar este documento (instrucciones para Claude Code)

1. Lee el documento completo antes de escribir código. Las secciones 3 a 6 definen el contrato del modelo; las secciones 7 a 9 definen la aplicación.
2. La sección 14 contiene un **caso dorado** (golden fixture) con cifras exactas. Toda implementación debe reproducirlas antes de avanzar a la siguiente fase.
3. Todo lo marcado como **[DECISIÓN ABIERTA]** requiere confirmación del usuario. No lo resuelvas por tu cuenta: implementa la opción marcada como predeterminada detrás de una configuración y deja constancia en `DECISIONS.md`.
4. Cualquier inferencia automática (tipo de dato, terminología, cronología) debe quedar etiquetada como `inferido` y ser revisable por un humano. Nunca presentes una inferencia como dato del documento.
5. Trabaja por fases (secciones 15 y 20.9). Al cerrar cada fase: pruebas en verde, `CHANGELOG.md` actualizado y un resumen de supuestos y límites detectados.
6. La versión 2.0 agrega dos módulos: **Proyectos** (sección 19: grafos desde documentos de cualquier formato, incluidas imágenes) y **Memoria** (sección 20: el grafo como memoria de agentes de IA). Los cambios de interfaz respecto de la 1.0 están en la sección 18 y prevalecen sobre la sección 8 donde difieran.

---

## 1. Propósito

Construir una aplicación que reciba documentos que describen estructuras de información (diccionarios de variables, formularios clínicos, especificaciones de registros, fichas de datos) y los convierta automáticamente en un **grafo de conocimiento navegable tipo Obsidian**, con tres propiedades:

1. **Fidelidad estructural.** El grafo respeta la jerarquía del documento fuente (categorías, subcategorías, variables) y su orden.
2. **Agrupación de metadata por tipo.** Dentro de cada categoría, las variables se agrupan por tipo de dato (fecha, categórica, binario, numérica, código estandarizado, identificador), con nodos de tipo globales que conectan todos los grupos.
3. **Trazabilidad total.** Cada nodo y arista sabe de qué documento, sección y línea proviene, si fue extraído literalmente o inferido, y en qué estado de validación está.

### 1.1 Alcance

**Incluye:** carga de documentos, parsing estructural, inferencia asistida de metadata, visualización interactiva con tres vistas y capas, notas por nodo, organización multi documento, revisión humana, exportación (JSON, Obsidian vault, HTML autónomo).

**Incluye también (v2):** proyectos con documentos de cualquier formato, incluidas imágenes (sección 19), y uso del grafo como memoria para agentes de IA (sección 20).

**No incluye:** edición colaborativa en tiempo real, datos de pacientes, integración con la ficha clínica, autenticación corporativa (se deja preparado el punto de extensión).

### 1.2 Usuarios

| Perfil | Necesidad principal |
|---|---|
| Informática médica / gestión de datos | Entender, auditar y normalizar diccionarios de variables. |
| Equipo de registro (p. ej., registro oncológico) | Validar tipos, dominios y cardinalidad de cada variable. |
| Ciencia de datos / ingeniería | Obtener un modelo de metadata consumible (JSON) para construir bases y validaciones. |
| Directivos / comités | Ver la estructura completa en una vista navegable para presentaciones. |

---

## 2. Principios de diseño

1. **Determinismo primero, IA después.** El parsing estructural y la construcción del grafo son determinísticos y reproducibles. La IA (LLM) solo interviene en ambigüedades y siempre produce propuestas revisables.
2. **El documento manda.** Los nombres de categorías y variables se transcriben de forma literal. Solo se permite normalizar tildes y mayúsculas, y cada normalización queda registrada.
3. **Inferencia visible.** Todo lo inferido lleva `origin: "inferred"`, `confidence` y `rationale`.
4. **Humano en el circuito.** Nada inferido pasa a `validated` sin acción humana explícita.
5. **Sin datos de pacientes.** El sistema procesa estructuras de datos, no registros clínicos. Incluye un detector que advierte si un documento parece contener datos personales (sección 11).
6. **Offline por defecto.** Funciona sin red. El uso de un LLM externo es opcional, configurable y apagable con un interruptor global (patrón "IA apagada" del Segundo Cerebro).

---

## 3. Glosario

| Término | Definición |
|---|---|
| **Workspace** | Espacio de trabajo que agrupa documentos y su grafo consolidado. |
| **Documento fuente** | Archivo cargado (docx, pdf, xlsx, csv, md). Unidad de trazabilidad. |
| **Raíz** | Entidad central que el documento describe (p. ej., "Caso oncológico"). Una por documento. |
| **Categoría** | Agrupación de primer nivel del documento. Conserva su número y orden. |
| **Subcategoría** | Agrupación de segundo nivel dentro de una categoría. |
| **Variable** | Campo de datos individual. Es la hoja del árbol y la "nota" principal. |
| **Tipo de dato** | Clasificación de la variable según la naturaleza de su valor (sección 4.3). |
| **Grupo de metadata** | Nodo que reúne las variables de un mismo tipo dentro de una categoría o subcategoría. |
| **Terminología** | Estándar de codificación asociado a una variable (CIE-10, CIE-O-3, TNM, etc.). |
| **Capa** | Conjunto de aristas transversales activables (terminologías, cronología). |
| **Vista** | Proyección del mismo grafo con reglas de visibilidad distintas (Estructura, Combinada, Por tipo). |
| **Observación** | Hallazgo de calidad sobre el documento fuente (duplicidad, ambigüedad, etc.). |

---

## 4. Modelo de datos del grafo (ontología)

### 4.1 Tipos de nodo

| `kind` | Descripción | Cardinalidad | Forma visual |
|---|---|---|---|
| `root` | Entidad central del documento. | 1 por documento | Círculo grande, color acento |
| `category` | Categoría del documento. Tiene `number` y `order`. | N | Círculo sólido `--hub` con número inscrito |
| `subcategory` | Subcategoría. | 0..N por categoría | Círculo sólido `--hub`, menor |
| `group` | Grupo de metadata tipo × (categoría o subcategoría). | Se crea si hay ≥2 variables del mismo tipo en el mismo padre | Anillo del color del tipo, relleno de fondo |
| `variable` | Campo de datos. | N | Círculo pequeño relleno del color de su tipo |
| `type` | Tipo de dato global. | 6 fijos (configurables) | Anillo grueso con núcleo del color del tipo |
| `standard` | Terminología o sistema de clasificación. | Catálogo configurable | Rombo color acento |
| `document` | Documento fuente (solo en vista multi documento). | 1 por archivo | Cuadrado redondeado |

### 4.2 Tipos de arista

| `kind` | Origen → destino | Vistas | Semántica |
|---|---|---|---|
| `contains` | root → category, category → subcategory | Estructura, Combinada | Jerarquía del documento |
| `has_variable` | category/subcategory → variable | Estructura; en Combinada solo si la variable no pertenece a un grupo | Pertenencia directa |
| `has_group` | category/subcategory → group | Combinada | Agrupación de metadata |
| `groups` | group → variable | Combinada | Miembro del grupo (arista corta) |
| `typed_as` | type → variable | Por tipo | Clasificación por tipo |
| `type_link` | group → type, o variable suelta → type | Combinada | Enlace tenue al tipo global |
| `root_type` | root → type | Por tipo | Cohesión de la vista |
| `coded_with` | variable → standard | Capa "Terminologías" | Terminología asociada |
| `precedes` | variable(fecha) → variable(fecha) | Capa "Cronología" | Secuencia temporal esperada (dirigida, con flecha) |
| `derived_from` | variable → variable | Capa futura | Variable calculada desde otras (p. ej., edad al diagnóstico) |
| `sourced_from` | cualquier nodo → document | Multi documento | Procedencia |
| `same_as` | variable → variable (entre documentos) | Multi documento | Equivalencia propuesta o validada |

### 4.3 Tipos de dato (catálogo inicial)

| Clave | Etiqueta | Definición | Reglas de calidad sugeridas |
|---|---|---|---|
| `fecha` | Fecha | Marca temporal de un hito del caso. | ISO 8601; coherencia cronológica; nunca posterior a defunción ni a fecha de registro. |
| `categorica` | Categórica | Valor de un catálogo cerrado, nominal u ordinal. | Dominio explícito y versionado; "Desconocido" distinto de vacío; mapeo a terminología cuando exista. |
| `binario` | Binario | Presencia o ausencia: Sí / No / Desconocido. | Tres estados explícitos; si "Sí", exigir variables dependientes; registrar fuente. |
| `numerica` | Numérica | Medición o valor derivado con unidad. | Unidad declarada; rangos plausibles; distinguir medido de derivado. |
| `codigo` | Código estandarizado | Valor codificado según una clasificación internacional. | Validación contra edición vigente; registrar versión; coherencia topografía · morfología · comportamiento. |
| `identificador` | Identificador | Referencia documental para trazabilidad. | Unicidad; formato institucional; enlace verificable. |

El catálogo debe ser configurable (`config/types.yaml`), manteniendo el orden fijo que define colores y posiciones.

### 4.4 Atributos comunes (todos los nodos)

```yaml
id: string            # estable, ver 4.6
kind: enum            # 4.1
name: string          # literal del documento
label_normalized: string
workspace_id: string
provenance:
  document_id: string
  locator: {page: int?, paragraph: int?, line: int?, cell: string?, heading_path: [string]}
  excerpt: string     # texto literal de origen, máx. 300 caracteres
origin: "extracted" | "inferred" | "manual"
status: "proposed" | "validated" | "rejected"
confidence: float     # 0..1; 1.0 para extraído literal
rationale: string?    # obligatorio si origin = inferred
created_at, updated_at: datetime
version: int
```

### 4.5 Atributos específicos

**`category`**: `number` (int, del documento), `order` (int), `description` (literal), `flags` (lista de observaciones).
**`subcategory`**: `order`, `parent_id`, `description?`.
**`variable`**:

```yaml
parent_id: string              # categoría o subcategoría
category_id: string
data_type: enum                # 4.3
data_type_origin: extracted | inferred | manual
standard_ids: [string]         # terminologías asociadas
unit: string?                  # para numéricas
value_domain: [string]?        # para categóricas, si el documento lo trae
cardinality: "1:1" | "1:N" | "unknown"   # por defecto unknown
required: bool | null          # null = no declarado
derived: bool
note: string?                  # aclaraciones (literal o inferida, marcada)
```

**`group`**: `data_type`, `parent_id`, `member_ids`, `name` = `"{Plural del tipo} · {n}"`.
**`standard`**: `code` (p. ej., `cieo`), `label`, `full_name`, `edition?`.

### 4.6 Identificadores estables

- `variable`: `v:{slug(nombre)}`; si hay colisión dentro del workspace, `v:{slug(nombre)}~{hash6(document_id+heading_path)}`.
- `category`: `c:{document_slug}:{number}`; `subcategory`: `c:{document_slug}:{number}.{order}`.
- `group`: `g:{parent_id}:{data_type}`; `type`: `t:{clave}`; `standard`: `s:{code}`.
- `slug`: NFD, eliminar diacríticos (`[̀-ͯ]`), minúsculas, no alfanuméricos → `-`, recortar guiones.

Los IDs no cambian al recargar el mismo documento. Esto permite diff entre versiones.

---

## 5. Reglas de construcción del grafo

Reglas determinísticas, en este orden:

1. Crear `root` con el nombre de la entidad (configurable por documento; predeterminado: título del documento o valor inferido revisable).
2. Crear nodos `type` (6) y `standard` (catálogo) una sola vez por workspace.
3. Por cada categoría, en el orden del documento: crear `category`, arista `contains` desde `root`.
4. Si la categoría tiene subcategorías: crear cada `subcategory` con `contains`. Las variables cuelgan de la subcategoría; si no hay subcategorías, de la categoría.
5. Por cada variable: crear `variable`, arista `has_variable` (vista Estructura), `typed_as` (vista Por tipo) y `coded_with` por cada terminología.
6. **Agrupación por tipo** dentro de cada padre (categoría o subcategoría):
   - Si hay **≥2** variables del mismo tipo: crear `group`, `has_group` desde el padre, `groups` hacia cada miembro y `type_link` desde el grupo al tipo global.
   - Si hay **1**: `has_variable` directa desde el padre (vista Combinada) y `type_link` desde la variable al tipo.
   - El umbral (2) es configurable.
7. Cronología: aristas `precedes` según reglas configurables (sección 6.6).
8. Observaciones de calidad: ejecutar el motor de reglas (sección 6.7) y adjuntar `flags`.

### 5.1 Reglas de visibilidad por vista

| Nodo / arista | Estructura | Combinada (predeterminada) | Por tipo |
|---|---|---|---|
| root | sí | sí | sí |
| category, subcategory | sí | sí | no |
| group | no | sí | no |
| type | no | sí | sí |
| variable | sí | sí | sí |
| standard | solo con capa | solo con capa | solo con capa |
| contains | sí | sí | no |
| has_variable | sí | solo variables sin grupo | no |
| has_group, groups, type_link | no | sí | no |
| typed_as, root_type | no | no | sí |
| coded_with | capa | capa | capa |
| precedes | capa | capa | capa |

Filtros por tipo de dato: ocultar un tipo oculta sus variables, sus grupos y su nodo global. Una terminología solo se muestra si alguna variable visible la usa.

---

## 6. Pipeline de ingesta

```
Carga → Detección de formato → Parsing estructural → Árbol intermedio (IR)
     → Inferencia de metadata → Construcción del grafo → Motor de calidad
     → Revisión humana → Publicación de versión
```

### 6.1 Formatos soportados

| Formato | Librería sugerida | Señales estructurales |
|---|---|---|
| `.docx` | `python-docx` | Estilos de título, negritas, numeración de listas (`numPr`, `ilvl`), sangría |
| `.pdf` | `pdfplumber` | Tamaño y peso de fuente, numeración, viñetas, sangría |
| `.xlsx` / `.csv` | `openpyxl` / `pandas` | Columnas tipo `categoria`, `subcategoria`, `variable`, `tipo`, `dominio` |
| `.md` | `markdown-it-py` | `#`/`##`/`-` |

### 6.2 Representación intermedia (IR)

Todo parser produce el mismo árbol, independiente del formato:

```json
{
  "document": {"id": "doc_...", "filename": "Info para presentacion.docx", "sha256": "...", "title": "Detalle de categorías generales y clasificación de datos"},
  "root_name": null,
  "categories": [
    {
      "number": 11,
      "name": "Características Biológicas, Histopatológicas y Biomarcadores del Tumor",
      "description": "Agrupa las variables que permiten caracterizar...",
      "locator": {"paragraph": 60},
      "subcategories": [
        {"name": "Marcadores de inmunohistoquímica", "locator": {"paragraph": 69},
         "variables": [{"name": "Ki-67", "locator": {"paragraph": 75}, "raw": "Ki-67"}]}
      ],
      "variables": []
    }
  ],
  "unparsed": []
}
```

Nada se descarta en silencio: todo bloque no clasificado va a `unparsed` y se muestra al usuario.

### 6.3 Heurísticas de detección estructural (docx, caso dorado)

Verificadas contra el documento de referencia con el parser del Anexo D: resultado 16 categorías, 6 subcategorías, 87 variables y 0 bloques sin clasificar.

Estructura real observada en el `.docx`: todos los párrafos usan el estilo `Normal`; la jerarquía se expresa con negritas y numeración de lista (`numPr`), no con estilos de título.

| Patrón | Interpretación |
|---|---|
| Párrafo **sin** numeración de lista cuyo texto en negrita empieza con `N.` (N entero) | Categoría número N. Nombre = texto en negrita sin el número ni el punto final. |
| Texto no negrita en ese mismo párrafo | Descripción de la categoría (ocurre en las categorías 1 a 6 y 15). |
| Párrafo siguiente sin numeración ni prefijo `Subcategoría:`, antes de la primera variable | Descripción de la categoría (categorías 7 a 14 y 16). |
| Texto que empieza con `Subcategoría:` (con o sin numeración, con o sin negrita) | Subcategoría. Nombre = texto posterior a los dos puntos. |
| Párrafo con numeración de lista (`numPr`), cualquier nivel `ilvl` | Variable. Padre = última subcategoría abierta en la categoría actual; si no hay, la categoría. |
| Negrita dentro de una variable | Se ignora (formato, no semántica). Se conserva en `raw`. |
| Primer párrafo del documento | Título del documento. |

Nota: el nivel de lista no es confiable como señal jerárquica (las variables de la categoría 11 están en nivel 0 y las de la 14 en nivel 1). La pertenencia se decide por el último encabezado abierto.

Si las heurísticas dejan elementos en `unparsed` o la confianza estructural es baja, se ofrece **extracción asistida por LLM** (sección 6.5) sobre el bloque específico, nunca sobre el documento entero sin revisión.

### 6.4 Inferencia de tipo de dato (reglas, en orden de prioridad)

1. Si el documento declara el tipo (columna, paréntesis, glosario): `origin: extracted`.
2. Reglas por patrón sobre el nombre normalizado (minúsculas, sin tildes):

| Prioridad | Patrón | Tipo |
|---|---|---|
| 1 | empieza con `fecha` | `fecha` |
| 2 | empieza con `¿` o contiene `evidencia de` | `binario` |
| 3 | empieza con `numero de` | `identificador` |
| 4 | contiene `codigo`, `cie 10`/`cie10`, `(cieo)`, `tnm`; igual a `figo`; empieza con `topografia met` | `codigo` |
| 5 | empieza con `edad`; contiene `tasa`, `breslow`, `ki-67`, `psa` | `numerica` |
| 6 | contiene `invasion`, `ulceracion`; igual a `hpv`, `p16`; empieza con `metastasis al`; contiene `estado vital`, `disponible en` | `binario` |
| 7 | diccionario de términos del dominio (`config/type_lexicon.yaml`) | según diccionario |
| 8 | por defecto | `categorica` |

**Desempeño medido sobre el caso dorado:** 85 de 87 variables (97,7 %) coinciden con la asignación de referencia. Discrepancias: `Comportamiento` y `Causa de defunción` (referencia: `codigo`; regla: `categorica`). Advertencia: estas reglas se ajustaron sobre este mismo documento, así que su desempeño en documentos nuevos no está demostrado. Se deben medir con al menos dos documentos adicionales antes de confiar en ellas.

3. Si la regla cae en el valor por defecto y hay LLM habilitado, se solicita una propuesta con justificación (`rationale`) y `confidence`. Resultado siempre `origin: inferred`, `status: proposed`.

### 6.5 Uso de LLM (opcional)

- Interruptor global `AI_ENABLED` (predeterminado: `false`). Con IA apagada, el sistema funciona completo con reglas.
- Llamadas con **salida estructurada** (JSON Schema) y temperatura 0.
- Casos de uso permitidos: (a) clasificar bloques `unparsed`; (b) proponer tipo de dato; (c) proponer terminología; (d) proponer equivalencias `same_as` entre documentos; (e) redactar la descripción faltante de una categoría (marcada como propuesta).
- Casos prohibidos: modificar nombres literales, validar automáticamente, inventar variables no presentes.
- Registro de cada llamada en `audit_log`: prompt hash, modelo, latencia, entrada, salida, decisión humana posterior.
- **[DECISIÓN ABIERTA]** Proveedor y modelo. Predeterminado: Anthropic API con modelo configurable por variable de entorno.

### 6.6 Terminologías y cronología

**Terminologías** (`config/standards.yaml`), catálogo inicial y reglas de asociación:

| Código | Etiqueta | Asociación por patrón (inferida) |
|---|---|---|
| `cie10` | CIE-10 | `cie 10`, `causa de defuncion` |
| `cieo` | CIE-O-3 | `(cieo)`, `morfologia`, `topografia`, `comportamiento`, `grado de diferenciacion` |
| `tnm` | TNM (AJCC/UICC) | `tnm`, `estadio de diagnostico` |
| `figo` | FIGO | `figo` |
| `oms` | Clasificación OMS | `grado de la oms` |
| `isup` | Gleason / ISUP | `gleason` |
| `ges` | GES (MINSAL) | `clasificacion ges` |
| `cut` | Código Único Territorial | `region`, `comuna` |

**Cronología**: aristas `precedes` definidas por plantilla de dominio (`config/timelines/oncologia.yaml`). Una arista solo se crea si ambos extremos existen. Plantilla oncológica de referencia (13 aristas):

```
nacimiento → primera consulta → toma informe dx → emisión dx
emisión dx → ingreso GES
emisión dx → comité → inicio tratamiento → término tratamiento
término tratamiento → progresión → último contacto FALP
término tratamiento → recurrencia → último contacto FALP
último contacto FALP → defunción
último contacto médico tratante → defunción
```

Cada arista `precedes` genera además una **regla de validación** exportable (p. ej., `fecha_emision_dx >= fecha_toma_informe_dx`).

### 6.7 Motor de calidad (observaciones)

Reglas mínimas, con **prioridad de corrección** `bloqueante | importante | menor`:

| Prioridad | Significado (se muestra al usuario) |
|---|---|
| Bloqueante | Impide construir la base de datos o validar el diccionario. Resolver primero. |
| Importante | Genera ambigüedad al registrar o analizar. Resolver antes de publicar la versión oficial. |
| Menor | Mejora de calidad. Puede resolverse en una revisión posterior. |

Cada observación incluye: título, descripción, **"Qué hacer"** (acción concreta), nodos afectados con enlace y estado (`open | resolved | accepted_risk`).


| Regla | Detección | Severidad |
|---|---|---|
| Descripción duplicada | Dos categorías con descripción idéntica (tras normalizar) | importante |
| Variable sin definición | Nombre de ≤2 caracteres o sin palabras del léxico | importante |
| Posible solapamiento | Nombres con alta similitud semántica en categorías distintas (p. ej., "Grado de diferenciación" / "Grado de la OMS") | importante |
| Metadato de calidad mezclado | Nombre con `disponible`, `registrado en`, `consignado` | menor |
| Variable derivable | Plantilla `derived_from` (p. ej., edad ← fecha nacimiento + fecha dx) | menor |
| Cardinalidad no especificada | Categorías de eventos repetibles (tratamiento, comité, progresión, recurrencia) sin cardinalidad | bloqueante |
| Dominios ausentes | Variables categóricas sin `value_domain` | bloqueante (agregada) |

Las observaciones se muestran en la pestaña **Trazabilidad** (con leyenda de prioridades y conteo), en la nota de cada nodo afectado y como anillo alrededor del nodo: rojo continuo (bloqueante), dorado (importante), gris punteado (menor).

### 6.8 Revisión humana

- Bandeja de revisión con todo lo `proposed`, ordenado por severidad e impacto.
- Acciones por elemento: aceptar, rechazar, editar (queda `origin: manual`), comentar.
- Acción masiva con confirmación explícita.
- Ninguna publicación de versión con observaciones **bloqueantes** abiertas sin justificación registrada.

---

## 7. Organización multi documento

### 7.1 Jerarquía

```
Workspace
 └── Colección (p. ej., "Registro oncológico")
      └── Documento (versión 1..n)
           └── Grafo del documento
 └── Grafo consolidado del workspace
```

### 7.2 Reglas

1. Cada documento genera su propio grafo, con su propio `root`.
2. **Versionado:** recargar un documento con el mismo nombre dentro de una colección crea una versión nueva. El sistema calcula el diff (nodos agregados, eliminados, renombrados, tipo cambiado) usando IDs estables.
3. **Consolidación:** el grafo del workspace une los grafos de documentos. Las variables equivalentes entre documentos se enlazan con `same_as` (propuesta automática por nombre normalizado idéntico o similitud ≥ umbral; validación humana obligatoria). Nunca se fusionan nodos automáticamente.
4. **Conflictos:** si dos documentos asignan tipos distintos a variables `same_as`, se genera una observación de prioridad importante.
5. La vista permite filtrar por documento, colección o versión, y resaltar el diff.

### 7.3 **[DECISIÓN ABIERTA]** Consolidación por categoría

¿Las categorías de documentos distintos se consideran equivalentes si tienen el mismo número y nombre? Predeterminado: **no**. Solo las variables se enlazan con `same_as`.

---

## 8. Especificación de visualización (replicar el prototipo)

### 8.1 Diseño general

- Lienzo de grafo a pantalla completa (canvas 2D; ver 9.3 sobre escalabilidad).
- Barra superior fija: marca "Atlas *Oncológico*" (el segundo término en color acento), subtítulo en mayúsculas espaciadas, buscador, selector **Simplificada / Detallada** (sección 18.1), botones **Ajustes** y **Nota**.
- Panel izquierdo flotante (Ajustes, estilo Obsidian): Vista, Grupos por tipo de dato, Capas, Fuerzas, Leyenda de formas, botón Centrar.
- Panel derecho deslizable (Nota): pestañas **Nota**, **Categorías**, **Tipos**, **Trazabilidad**, y bajo ellas la barra de navegación **← Atrás · Inicio · ruta actual** (sección 18).
- Píldora de estado inferior: `N variables · M enlaces · vista X` o `N coincidencias · Enter para abrir`.

### 8.2 Tokens de diseño (heredados de Segundo Cerebro)

Tipografías: **Fraunces** (títulos), **Albert Sans** (cuerpo), **JetBrains Mono** (etiquetas y datos). Tema oscuro por defecto; tema claro vía `prefers-color-scheme` y `data-theme`.

| Token | Oscuro | Claro | Uso |
|---|---|---|---|
| `--bg` | `#0b0e14` | `#f2f4f7` | Fondo |
| `--surface` | `#141926` | `#ffffff` | Paneles |
| `--surface-2` | `#1b2233` | `#e9edf3` | Bloques internos |
| `--line` | `#252d40` | `#d7dde8` | Bordes |
| `--ink` | `#e8eaf2` | `#1a2233` | Texto |
| `--ink-dim` | `#9aa3b8` | `#4d5a72` | Texto secundario |
| `--ink-faint` | `#5c6579` | `#8b96ab` | Etiquetas |
| `--accent` | `#e0b458` | `#a97c1d` | Acento, raíz, terminologías |
| `--edge` | `#2c3550` | `#c4cddc` | Aristas |
| `--hub` | `#e8eaf2` | `#1a2233` | Categorías |
| `--t-fecha` | `#e0b458` | `#a97c1d` | Tipo fecha |
| `--t-categorica` | `#4fc8b4` | `#157f6d` | Tipo categórica |
| `--t-binario` | `#d0708f` | `#a83c62` | Tipo binario |
| `--t-numerica` | `#6fa8e8` | `#2f6fb8` | Tipo numérica |
| `--t-codigo` | `#9d8ae6` | `#5b4aa8` | Tipo código |
| `--t-identificador` | `#a3adbf` | `#66728a` | Tipo identificador |
| `--warn` | `#e46a6a` | `#c2434f` | Observaciones |

### 8.3 Layout y fuerzas (parámetros del prototipo)

- **Anclaje de categorías:** en círculo de radio 360 alrededor de la raíz, en sentido horario desde las 12 en punto, en el orden del documento (01 → N). Fuerza de anclaje constante `0.03` hacia su posición. Esto preserva la lectura del documento; es el rasgo que el usuario valoró.
- **Tipos globales:** anillo de radio 230 × `0.6` (Combinada) o × `1.1` (Por tipo), fuerza `0.03`.
- **Raíz:** atraída al origen con fuerza `0.05`.
- **Separar** (antes "Repulsión"): `separar / d²`, con valor inicial 1700 (ajustable **200 a 12000**); multiplicador 1,6 por cada extremo que no sea variable; corte a `d² > max(160000, separar × 95)`.
- **Resortes** `[distancia, rigidez]` multiplicados por el control "Distancia" (**0,3 a 3,0**, inicial 1,00×):

| Arista | Distancia | Rigidez |
|---|---|---|
| root → category (Estructura/Combinada) | 260 | 0,02 |
| root → type (Por tipo) | 170 | 0,05 |
| group → variable | 26 | 0,12 |
| padre → group / subcategory | 48 | 0,09 |
| padre → variable | 40 | 0,10 |
| typed_as | 70 | 0,07 |
| type_link | 260 | 0,0025 |
| coded_with | 150 | 0,006 |
| precedes | 90 | 0,006 |

- Enfriamiento: `alpha *= 0.992`; detener integración con `alpha < 0.004`; amortiguación de velocidad `0.82`; 260 iteraciones previas al primer render y ajuste automático al encuadre.
- **Radios:** raíz 15; categoría `7 + √n·1.9`; subcategoría `6 + √n·1.2`; grupo `4.5 + √n·1.3`; tipo `11 + √n·1.4`; terminología 7; variable 4.6.

### 8.4 Interacción

- Hover: aísla el vecindario (nodos no vecinos al 14 % de opacidad; aristas al 5 %), resalta aristas en acento.
- Clic: abre la nota del nodo. Clic en vacío: deselecciona.
- Arrastre de nodo, paneo del lienzo, zoom con rueda (0,25 a 3,5) y pinza en pantallas táctiles.
- Etiquetas: siempre para nodos no variable; para variables, desde zoom > 1,25, en vecindario enfocado, en coincidencias de búsqueda o con "Mostrar todas". Truncar variables a 34 caracteres y categorías a 42 salvo foco. Formato de categoría: `NN · Nombre`.
- Búsqueda: normalizada sin tildes; coincide nombre y tipo. Enter abre la primera coincidencia; Escape limpia.
- Enlaces `[[wikilink]]` en las notas navegan al nodo; si está oculto por vista o filtro, se cambia lo mínimo para mostrarlo.
- Accesibilidad: foco visible, controles con `id` y `aria-*`, `prefers-reduced-motion`, funcionamiento a 400 px de ancho.

### 8.5 Contenido de las notas

**Variable** (formato nota Obsidian):

```
Variable · Fecha
Fecha de emisión diagnóstico
---
variable: Fecha de emisión diagnóstico
categoria: [[06 · Cronología y Proceso Diagnóstico]]
tipo_dato: [[fecha]]            # inferido
estandar: —
fuente: Info para presentacion.docx
validacion: pendiente
---
Cronología esperada: posterior a [[…]], anterior a [[…]]
Reglas de calidad sugeridas por tipo
Misma categoría · n  (chips)
Mismo tipo en otras categorías · n  (chips, máx. 24 + "más")
```

**Categoría:** número de N, conteo, descripción literal, advertencia si tiene observación, barra de composición por tipo, subcategorías, variables agrupadas por tipo.
**Tipo:** definición, reglas, distribución por categoría.
**Terminología:** nombre completo, variables que la usan.
**Trazabilidad:** fuente, método, supuestos, observaciones con severidad y enlace a categorías, decisiones que requieren validación.

---

## 9. Arquitectura propuesta

### 9.1 Componentes

| Capa | Propuesta | Justificación |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | Componentes para paneles; estado tipado del grafo. |
| Motor del grafo | Portar el motor canvas del prototipo a un módulo TS (`graph-engine/`) | Conserva exactamente la estética y la física validadas. |
| Modelo en memoria | `graphology` | Estructura de grafo estándar, serializable, con índices. |
| Backend | Python 3.12 + FastAPI | Mejor ecosistema de parsing documental. |
| Persistencia | SQLite (v1) con SQLAlchemy; migrable a PostgreSQL | Simple, local, versionable. |
| Almacenamiento de archivos | Sistema de archivos local `data/uploads/{sha256}` | Deduplicación por hash. |
| LLM (opcional) | Adaptador `llm/` con interfaz común | Permite cambiar proveedor o apagarlo. |
| Pruebas | `pytest` (backend), `vitest` + Playwright (frontend) | Caso dorado automatizado y regresión visual. |

**[DECISIÓN ABIERTA]** Despliegue: local (predeterminado) versus servidor institucional versus Vercel (solo frontend estático con grafos exportados).

### 9.2 Estructura de repositorio

```
atlas/
├── SPEC.md                      # este documento
├── CLAUDE.md                    # guardrails y comandos para Claude Code
├── DECISIONS.md
├── CHANGELOG.md
├── reference/prototype.html     # prototipo de referencia
├── config/
│   ├── types.yaml
│   ├── type_lexicon.yaml
│   ├── standards.yaml
│   ├── timelines/oncologia.yaml
│   └── quality_rules.yaml
├── backend/
│   ├── app/api/                 # endpoints FastAPI
│   ├── app/parsers/             # docx.py, pdf.py, tabular.py, markdown.py → IR
│   ├── app/ir.py                # modelos Pydantic del IR
│   ├── app/inference/           # types.py, standards.py, timeline.py, llm.py
│   ├── app/graph/               # builder.py, views.py, ids.py, diff.py, merge.py
│   ├── app/quality/             # engine.py, rules/
│   ├── app/export/              # json.py, obsidian.py, html.py
│   ├── app/security/phi_guard.py
│   └── tests/fixtures/info_para_presentacion.docx
├── frontend/
│   ├── src/graph-engine/        # simulación, render, interacción
│   ├── src/panels/              # Settings, Note, Categories, Types, Traceability, Review
│   ├── src/state/
│   └── src/theme/tokens.css
└── data/                        # uploads, db (ignorado por git)
```

### 9.3 Escalabilidad

El motor del prototipo es O(n²) en repulsión y funciona con fluidez hasta ~300 nodos. Para el grafo consolidado (miles de nodos): usar Barnes-Hut (quadtree) o migrar el render a WebGL (`sigma.js` sobre `graphology`), manteniendo tokens, formas y parámetros. Criterio: 60 fps con 2.000 nodos visibles.

### 9.4 API (v1)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/workspaces` | Crear workspace |
| POST | `/api/workspaces/{id}/documents` | Subir documento (multipart); devuelve `document_id`, `version`, resumen del IR |
| GET | `/api/documents/{id}/ir` | Árbol intermedio con `unparsed` |
| POST | `/api/documents/{id}/build` | Construir grafo (reglas; IA según configuración) |
| GET | `/api/graphs/{scope}` | Grafo JSON; `scope = document:{id} | collection:{id} | workspace:{id}`; parámetros `view`, `layers`, `types` |
| GET | `/api/nodes/{id}` | Nodo con procedencia, vecinos y observaciones |
| PATCH | `/api/nodes/{id}` | Edición manual (queda `origin: manual`) |
| GET | `/api/review?status=proposed` | Bandeja de revisión |
| POST | `/api/review/{item_id}` | `accept | reject | edit` con comentario |
| GET | `/api/documents/{id}/diff?from=v1&to=v2` | Diff entre versiones |
| GET | `/api/export/{scope}?format=json|obsidian|html` | Exportación |
| GET/POST | `/api/ai` · `/api/ai/off` · `/api/ai/on` | Interruptor de IA |
| GET | `/api/audit` | Registro de auditoría |

### 9.5 Formato de intercambio `graph.json`

```json
{
  "schema_version": "1.0",
  "scope": {"kind": "document", "id": "doc_info_presentacion", "version": 1},
  "nodes": [
    {"id": "root", "kind": "root", "name": "Caso oncológico", "origin": "manual", "status": "validated"},
    {"id": "c:info:6", "kind": "category", "name": "Cronología y Proceso Diagnóstico", "number": 6, "order": 6,
     "description": "Registra los hitos temporales y los respaldos documentales desde la sospecha hasta la confirmación.",
     "origin": "extracted", "status": "proposed", "confidence": 1.0,
     "provenance": {"document_id": "doc_info_presentacion", "locator": {"paragraph": 25}}},
    {"id": "g:c:info:6:fecha", "kind": "group", "data_type": "fecha", "name": "Fechas · 3", "parent_id": "c:info:6"},
    {"id": "v:fecha-de-emision-diagnostico", "kind": "variable", "name": "Fecha de emisión diagnóstico",
     "parent_id": "c:info:6", "category_id": "c:info:6", "data_type": "fecha", "data_type_origin": "inferred",
     "confidence": 0.95, "rationale": "Regla 1: el nombre empieza con 'Fecha'.", "cardinality": "unknown",
     "status": "proposed", "standard_ids": []}
  ],
  "edges": [
    {"id": "e1", "kind": "contains", "source": "root", "target": "c:info:6"},
    {"id": "e2", "kind": "has_group", "source": "c:info:6", "target": "g:c:info:6:fecha"},
    {"id": "e3", "kind": "groups", "source": "g:c:info:6:fecha", "target": "v:fecha-de-emision-diagnostico"},
    {"id": "e4", "kind": "precedes", "source": "v:fecha-de-toma-del-informe-diagnostico", "target": "v:fecha-de-emision-diagnostico", "layer": "time", "origin": "inferred"}
  ],
  "observations": [
    {"id": "o3", "priority": "importante", "title": "Descripción duplicada en la categoría 3", "node_ids": ["c:info:3"], "status": "open"}
  ]
}
```

### 9.6 Exportación a Obsidian vault

```
Atlas - {workspace}/
├── 00 Caso oncológico.md
├── Categorías/06 Cronología y Proceso Diagnóstico.md
├── Variables/Fecha de emisión diagnóstico.md
├── Tipos/Fecha.md
├── Terminologías/CIE-O-3.md
└── _Trazabilidad/Observaciones.md
```

Cada archivo con frontmatter YAML (sección 8.5) y `[[wikilinks]]` a padre, grupo, tipo y terminologías, de modo que el grafo nativo de Obsidian reproduzca la misma topología. Colores de grupos: exportar `.obsidian/graph.json` con `colorGroups` por `tag:#tipo/fecha`, etc.

---

## 10. Trazabilidad y auditoría

- Tabla `audit_log`: `timestamp`, `actor` (usuario o `system` o `llm:{modelo}`), `action`, `target_id`, `before`, `after`, `reason`.
- Todo nodo muestra en su nota: documento, ubicación, extracto literal, origen, estado y última modificación.
- Exportable como CSV para auditorías.
- Cada versión publicada guarda: hash del documento, versión del parser, versión de reglas, configuración de IA.

---

## 11. Seguridad y privacidad (contexto salud)

1. **Guardia de datos personales** (`phi_guard.py`): antes de procesar, escanear el documento por RUT chileno (con dígito verificador), correos, teléfonos, fechas de nacimiento asociadas a nombres y patrones de ficha clínica. Si detecta, bloquear el procesamiento con IA, advertir y exigir confirmación explícita.
2. Con `AI_ENABLED=false` nada sale del equipo.
3. Con IA encendida: enviar solo el bloque necesario, nunca el documento completo; registrar el envío.
4. Archivos cargados cifrados en reposo si se despliega fuera del equipo local (**[DECISIÓN ABIERTA]**).
5. Publicación externa (Vercel u otro): solo exportaciones estáticas y con aprobación explícita del usuario (Nivel 3 de su modelo de autonomía).

---

## 12. Requisitos no funcionales

| Requisito | Criterio |
|---|---|
| Rendimiento de ingesta | Documento de 20 páginas procesado con reglas en < 5 s |
| Rendimiento visual | 60 fps con 300 nodos (motor canvas); 2.000 nodos tras 9.3 |
| Reproducibilidad | Mismo documento + misma configuración ⇒ mismo `graph.json` (salvo posiciones) |
| Accesibilidad | WCAG 2.1 AA en paneles; navegación con teclado en notas |
| Idioma | Interfaz en español; claves de código en inglés |
| Estilo de escritura en UI | Formal, preciso; sin guiones largos como puntuación |

---

## 13. Casos de uso principales

1. **Cargar un diccionario nuevo** → ver el grafo en vista Combinada en menos de 10 s, con observaciones listadas.
2. **Validar tipos** → abrir la bandeja, aceptar o corregir cada tipo inferido, ver el grafo actualizarse.
3. **Comparar versiones** → subir la versión 2 del documento y ver resaltadas las variables agregadas, eliminadas o con tipo cambiado.
4. **Consolidar registros** → cargar dos diccionarios (p. ej., registro oncológico y base oncohematológica), revisar propuestas `same_as`.
5. **Presentar** → exportar HTML autónomo o vault de Obsidian.

---

## 14. Caso dorado y criterios de aceptación

**Fixture:** `backend/tests/fixtures/info_para_presentacion.docx` (documento "Detalle de categorías generales y clasificación de datos"). El procesamiento con reglas, sin IA, debe producir exactamente:

| Métrica | Valor esperado |
|---|---|
| Categorías | 16 (numeradas 1 a 16, en orden) |
| Subcategorías | 6 (4 en la categoría 11; 2 en la 14) |
| Variables | 87 |
| Grupos de metadata (umbral 2) | 18 |
| Variables por tipo (asignación de referencia) | fecha 14 · categórica 45 · binario 10 · numérica 5 · código 12 · identificador 1 |
| Variables con terminología | 21 |
| Aristas de cronología | 13 |
| Aristas visibles, vista Combinada sin capas | 176 |
| Observaciones mínimas detectadas | descripción duplicada (cat. 3), variable "S" sin definición, cardinalidad no especificada (cat. 12, 13, 14), metadato de calidad (cat. 10), variable derivable (cat. 1) |
| Concordancia de reglas de tipo vs. referencia | ≥ 85/87 (línea base actual) |

Criterios de aceptación de la v1:

- [ ] El caso dorado reproduce todas las cifras (prueba automatizada).
- [ ] Las tres vistas y dos capas se comportan según la tabla 5.1.
- [ ] Regresión visual contra `reference/prototype.html` (captura Playwright a 1440×900, tema claro y oscuro).
- [ ] Toda inferencia muestra `inferido` en la nota y aparece en la bandeja de revisión.
- [ ] Cargar un segundo documento no altera el grafo del primero.
- [ ] Recargar el mismo documento produce IDs idénticos y diff vacío.
- [ ] Exportación Obsidian abre en Obsidian con la misma topología.
- [ ] Con `AI_ENABLED=false`, cero llamadas de red (prueba con red bloqueada).
- [ ] Versión simplificada: 16 categorías con anillo de composición; abrir y cerrar categorías; Atrás restaura el estado exacto (nodo, pestaña, vista, nivel de detalle, categorías abiertas).

---

## 15. Plan por fases

| Fase | Entregable | Criterio de salida |
|---|---|---|
| F0 · Fundaciones | Repositorio, `CLAUDE.md`, configuración, CI, fixture | CI verde con prueba vacía |
| F1 · Motor visual | Portar el prototipo a `graph-engine/` leyendo `graph.json` | Regresión visual idéntica al prototipo |
| F2 · Parser docx + IR | Parser con heurísticas 6.3, reporte `unparsed` | Caso dorado: 16/6/87 |
| F3 · Constructor del grafo | Builder, IDs, vistas, grupos, capas | Caso dorado completo (tabla 14) |
| F4 · Inferencia y calidad | Reglas de tipo, terminologías, cronología, motor de observaciones | Observaciones mínimas detectadas |
| F5 · Revisión y trazabilidad | Bandeja, auditoría, edición manual | Flujo aceptar/rechazar con registro |
| F6 · Multi documento | Colecciones, versiones, diff, `same_as` | Casos de uso 3 y 4 |
| F7 · Formatos adicionales | PDF, XLSX/CSV, MD | Un fixture por formato |
| F8 · IA opcional | Adaptador LLM, interruptor, guardia PHI | Pruebas con IA apagada y encendida |
| F9 · Exportaciones y despliegue | JSON, Obsidian, HTML autónomo | Criterios de aceptación completos |

---

## 16. Decisiones abiertas (requieren validación del usuario)

| # | Decisión | Opción predeterminada |
|---|---|---|
| D1 | Interpretación de "tipo" para agrupar metadata | Tipo de dato (6 tipos). Alternativas: clínico/administrativo, obligatorio/opcional. |
| D2 | Proveedor y modelo de LLM | Anthropic API, configurable; apagado por defecto |
| D3 | Despliegue | Local |
| D4 | Consolidación de categorías entre documentos | No se consolidan; solo variables con `same_as` validado |
| D5 | Umbral para crear grupo de metadata | 2 variables |
| D6 | Nombre de la raíz cuando el documento no lo declara | Propuesto por el sistema, confirmado por el usuario |
| D7 | Cifrado en reposo | Solo si se despliega fuera del equipo local |
| D8 | Plantillas de cronología por dominio | Solo oncología en v1 |
| D9 a D14 | Decisiones de los módulos Proyectos y Memoria | Ver sección 20.10 |

---

## 17. Guardrails para Claude Code (copiar a `CLAUDE.md`)

- No inventar variables, categorías ni dominios de valores. Si el documento no lo dice, es `unknown` o `inferred`.
- No cambiar parámetros visuales de la sección 8 sin una decisión registrada.
- No agregar dependencias de red en tiempo de ejecución con IA apagada.
- No procesar documentos con datos personales detectados sin confirmación explícita.
- No publicar ni desplegar externamente sin aprobación del usuario.
- Antes de cerrar cada tarea: correr pruebas, actualizar `CHANGELOG.md` y reportar supuestos, límites y decisiones abiertas.

---

## 18. Cambios de la versión 2.0 respecto de la 1.0

| Cambio | Detalle | Motivo |
|---|---|---|
| Tipo `dicotomica` → `binario` | Clave `binario`, etiqueta "Binario", plural "Binarios", token `--t-binario`. | Terminología más clara para usuarios clínicos y de datos. |
| Control "Repulsión" → **"Separar"** | Rango ampliado de 400–4000 a **200–12000** (valor inicial 1700). El radio de corte se escala: `corte² = max(160000, separar × 95)`. Muestra el valor actual. | Permitir desplegar grafos densos. |
| Control "Distancia" | Rango ampliado de 0,5–1,8 a **0,3–3,0** (inicial 1,00×). Muestra el valor. Al soltar cualquiera de los dos controles, el grafo se reencuadra. | Mayor control del espaciado. |
| Severidad alta/media/baja → **Prioridad de corrección** | Bloqueante, Importante, Menor, con definición visible, conteo por nivel, campo **"Qué hacer"** por observación y enlaces a categorías y variables afectadas. Las observaciones también aparecen en la nota de cada categoría o variable afectada. | La escala anterior no explicaba su uso. |
| Anillos de observación | Rojo continuo = bloqueante; dorado = importante; gris punteado = menor. | Leer la prioridad directamente en el grafo. |
| **Navegación Atrás / Inicio** | Barra bajo las pestañas con "← Atrás", "Inicio" y ruta actual. Historial de hasta 60 pasos: nodo seleccionado, pestaña, vista, nivel de detalle y categorías abiertas. Atajos: Alt + ← y Retroceso (fuera de campos de texto). | No existía forma de volver al paso anterior. |
| **Nivel de detalle: Simplificada / Detallada** | Selector en la barra superior (sección 18.1). | Lectura ejecutiva sin perder el detalle técnico. |

### 18.1 Versión simplificada

- Muestra solo la raíz y las 16 categorías, más grandes, con un **anillo de composición** segmentado por tipo de dato (proporción de variables de cada tipo) y una segunda línea: `n variables · clic para abrir`.
- Clic en una categoría: la abre en el grafo (divulgación progresiva) mostrando subcategorías, grupos de metadata y variables con la lógica de la vista Combinada, y abre su nota. La nota ofrece "Abrir / Cerrar categoría en el grafo".
- Ajustes: el selector de vista queda fijo (Combinada) y aparecen "Abrir todas" y "Cerrar todas". Los filtros por tipo afectan a las categorías abiertas.
- Las categorías no enfocadas se atenúan al 55 % (no al 14 %) para mantener la lectura del conjunto.
- Si se navega a un tipo global o a una terminología desde una nota, el sistema cambia a Detallada y lo registra en el historial.
- Radio de categoría en simplificada: `11 + √n × 2,8`.

### 18.2 Versión detallada

Equivale a la especificación de la sección 8, con los cambios de la tabla anterior. Es el nivel predeterminado.

---

## 19. Módulo Proyectos: grafos de conocimiento desde documentos de cualquier formato

### 19.1 Objetivo

Permitir crear **proyectos** a los que se suben documentos de cualquier extensión, incluidas imágenes, para construir un grafo que muestre **cómo se interconectan los datos y la información** entre documentos. El diccionario de variables (secciones 4 a 8) pasa a ser un caso particular: un perfil de extracción entre varios.

### 19.2 Formatos y extracción

| Familia | Extensiones | Extracción | Local / IA |
|---|---|---|---|
| Texto de oficina | `.docx`, `.doc`*, `.odt`, `.rtf` | Estructura (títulos, listas, tablas), texto | Local |
| PDF | `.pdf` con texto | `pdfplumber`: texto, tablas, disposición | Local |
| PDF escaneado | `.pdf` sin capa de texto | OCR por página | Local (OCR); IA opcional para corrección |
| Presentaciones | `.pptx`, `.key`* | Texto por diapositiva, notas, orden | Local |
| Tablas | `.xlsx`, `.xls`*, `.csv`, `.tsv` | Hojas, encabezados, tipos de columna, muestras | Local |
| Texto plano / marcado | `.md`, `.txt`, `.html`, `.json`, `.xml` | Estructura nativa | Local |
| Correo | `.eml`, `.msg` | Remitente, destinatarios, fecha, asunto, cuerpo, adjuntos (recursivo) | Local |
| **Imágenes** | `.png`, `.jpg`, `.jpeg`, `.heic`, `.tiff`, `.webp` | (1) OCR del texto; (2) detección de tablas y diagramas; (3) descripción visual y extracción de entidades con modelo de visión | OCR local; visión solo con IA encendida |
| Audio / video (fase posterior) | `.m4a`, `.mp3`, `.wav`, `.mp4` | Transcripción con marcas de tiempo | Local (Whisper) o IA |
| Otros | cualquier extensión | Se registra como nodo `document` con metadatos (nombre, tamaño, hash, fecha); sin contenido | Local |

\* Conversión previa con LibreOffice en modo sin interfaz.

**[DECISIÓN ABIERTA] D9:** motor de OCR. Predeterminado: Tesseract con idioma español; alternativa: PaddleOCR (mejor en tablas).
**[DECISIÓN ABIERTA] D10:** modelo de visión para imágenes (descripción de diagramas, fotos de pizarras, capturas). Predeterminado: apagado; al encenderlo, modelo configurable.

### 19.3 Perfiles de extracción

Cada documento recibe un **perfil** (propuesto por un clasificador de reglas y, si la IA está encendida, confirmado por el LLM; siempre editable):

| Perfil | Ejemplos | Grafo resultante |
|---|---|---|
| `diccionario` | Diccionarios de variables, fichas de registro, formularios | Modelo estructural de las secciones 4 a 8 (categorías, grupos por tipo, variables) |
| `tabla` | Planillas, exportaciones de bases | Tabla → columnas (como variables, con tipo inferido desde los datos) → valores frecuentes como dominio propuesto |
| `narrativo` | Informes, minutas, artículos, protocolos | Fragmentos → entidades y relaciones → objetos de conocimiento |
| `presentacion` | Decks | Diapositivas como secciones → entidades |
| `correo` | Hilos de correo | Personas, fechas, decisiones, compromisos |
| `imagen` | Diagramas, capturas, fotos de pizarra, escaneos | Texto OCR + elementos del diagrama (cajas, flechas) como nodos y aristas propuestos |

### 19.4 Ontología ampliada (grafo semántico)

Se agregan a los tipos de nodo de la sección 4.1:

| `kind` | Descripción |
|---|---|
| `project` | Proyecto; raíz del grafo de interconexión. |
| `chunk` | Fragmento de un documento (párrafo, diapositiva, celda, región de imagen) con su localizador exacto. Unidad mínima de evidencia. |
| `entity` | Persona, organización, sistema, conjunto de datos, concepto clínico, lugar, instrumento. Subtipo en `entity_type`. |
| `knowledge_object` | Unidad de conocimiento accionable: `decision`, `task`, `event`, `question`, `finding` (afirmación con evidencia). Compatible con los objetos de conocimiento del Segundo Cerebro. |
| `tag` | Etiqueta libre o controlada. |

Aristas nuevas:

| `kind` | Origen → destino | Semántica |
|---|---|---|
| `has_chunk` | document → chunk | Segmentación |
| `mentions` | chunk → entity / variable | Evidencia de aparición |
| `about` | knowledge_object → entity / variable / project | Tema |
| `relates` | entity → entity | Relación tipada; el predicado va en `predicate` (p. ej., `usa`, `produce`, `alimenta`, `es_parte_de`) |
| `supports` / `contradicts` | chunk → knowledge_object | Evidencia a favor o en contra |
| `shares` | document → document | Derivada: dos documentos comparten al menos k entidades o variables (k configurable, predeterminado 2); peso = número de elementos compartidos |

Toda arista semántica conserva `provenance` (chunk de origen), `origin`, `confidence` y `status`, igual que en la sección 4.4. Además, todo nodo y arista admite **vigencia temporal** `valid_from` / `valid_to` (patrón del Segundo Cerebro), para distinguir lo vigente de lo histórico.

### 19.5 Resolución de entidades

1. Normalización del nombre (minúsculas, sin tildes, sin signos).
2. Coincidencia exacta, luego alias configurados (`config/aliases.yaml`), luego similitud (texto y, si hay IA, vectores).
3. Conceptos clínicos: mapeo propuesto a **SNOMED CT** (y CIE-10 / CIE-O-3 cuando aplique) con código, término y edición.
4. Toda fusión es una propuesta `same_as` que requiere validación humana. No se fusionan nodos automáticamente.

### 19.6 Vistas del módulo

Se mantiene el principio que el usuario valoró (**jerarquía anclada, agrupación por tipo, divulgación progresiva**) y se aplica al proyecto:

| Vista | Qué muestra |
|---|---|
| **Mapa del proyecto** (simplificada) | Proyecto al centro; documentos anclados en círculo (orden de carga o por fecha), cada uno con un anillo de composición por tipo de entidad; aristas `shares` con grosor según el peso. Clic en un documento lo abre. |
| **Interconexión** (detallada) | Documentos en el anillo exterior; entidades compartidas por 2 o más documentos en el centro; entidades exclusivas junto a su documento, agrupadas por tipo de entidad (igual que los grupos de metadata). |
| **Estructura del documento** | Para documentos `diccionario`, el grafo de las secciones 4 a 8. |
| **Por tipo** | Catálogo de entidades por tipo. |
| **Línea de tiempo** | Documentos y objetos de conocimiento ordenados por fecha. |

Métricas visibles en la nota del proyecto: entidades puente (presentes en más documentos), comunidades temáticas (algoritmo Leiden), documentos aislados, entidades huérfanas y cobertura (porcentaje de fragmentos con al menos una entidad).

### 19.7 Pipeline del módulo

```
Subir archivo(s) → hash y deduplicación → detección de formato → guardia de datos personales
 → extracción por familia (19.2) → fragmentos con localizador → perfil (19.3)
 → extracción estructural o semántica → resolución de entidades (19.5)
 → cálculo de aristas derivadas (shares, comunidades) → motor de calidad → revisión humana
 → publicación de versión del proyecto → actualización de índices de memoria (sección 20)
```

Procesamiento en segundo plano con cola de trabajos y estado visible por archivo (en cola, extrayendo, pendiente de revisión, publicado, error con causa).

---

## 20. Módulo Memoria: el grafo como cerebro de un agente de IA

### 20.1 Objetivo

Que el grafo validado de un proyecto sirva como **memoria persistente y trazable** para agentes de IA (incluidos Claude Code, agentes de FALP y el Segundo Cerebro): que el agente pueda buscar, recorrer relaciones, citar la evidencia exacta y proponer conocimiento nuevo sin escribir sin supervisión.

### 20.2 Capas de memoria

| Capa | Contenido en el Atlas | Uso por el agente |
|---|---|---|
| **Semántica** | Entidades, variables, relaciones, terminologías | "¿Qué es X y con qué se relaciona?" |
| **Episódica** | Documentos, fragmentos y objetos de conocimiento con fecha (eventos, decisiones) | "¿Qué se decidió sobre X y cuándo?" |
| **Procedimental** | Reglas de calidad y de validación derivadas (cronología, dominios, tipos) | "¿Cómo valido un registro de X?" |
| **De trabajo** | Paquete de contexto armado para una pregunta concreta | Entrada directa al prompt del agente |

### 20.3 Niveles de confianza

| Nivel | Condición | Uso permitido |
|---|---|---|
| **Confiable** | `status: validated` | El agente puede afirmarlo citando la fuente. |
| **Propuesto** | `status: proposed` | El agente debe presentarlo como hipótesis, marcado. |
| **Rechazado** | `status: rejected` | Excluido de la recuperación; se conserva en auditoría. |

La recuperación filtra por nivel según la configuración de cada agente (predeterminado: solo Confiable, más Propuesto marcado si se pide).

### 20.4 Índices

- **Grafo:** tablas `nodes` / `edges` (SQLite en v1; **[DECISIÓN ABIERTA] D11:** migrar a Kùzu o Neo4j si el tamaño lo exige).
- **Texto completo:** SQLite FTS5 sobre fragmentos, nombres y descripciones.
- **Vectores:** embeddings de fragmentos y de descripciones de nodos (`sqlite-vec` en v1; `pgvector` si se migra a PostgreSQL). **[DECISIÓN ABIERTA] D12:** modelo de embeddings local (predeterminado, p. ej. multilingüe de código abierto) o vía API.
- Reindexación incremental al publicar una versión del proyecto.

### 20.5 Recuperación (GraphRAG)

1. Consulta híbrida: texto completo + vectores → nodos y fragmentos semilla.
2. Expansión por el grafo: vecinos a 1–2 saltos, priorizando aristas validadas y tipos relevantes.
3. Re-ranking por relevancia, confianza y vigencia (`valid_to` nulo primero).
4. Armado del **paquete de contexto**: resumen estructurado + lista de hechos con cita `[documento, localizador]` + preguntas abiertas relacionadas; presupuesto de tokens configurable.
5. Todo hecho del paquete incluye su nivel de confianza.

### 20.6 Interfaces para agentes

**Servidor MCP** (`atlas-mcp`), además de la API REST:

| Herramienta | Tipo | Descripción |
|---|---|---|
| `search(query, project?, types?, trust?)` | Lectura | Búsqueda híbrida; devuelve nodos y fragmentos con cita |
| `get_node(id)` | Lectura | Nodo con atributos, procedencia y observaciones |
| `neighbors(id, depth?, edge_kinds?)` | Lectura | Vecindario |
| `path(from_id, to_id)` | Lectura | Camino más corto con aristas explicadas |
| `context_pack(question, project, budget_tokens)` | Lectura | Paquete de contexto (20.5) |
| `open_questions(project)` | Lectura | Preguntas y observaciones pendientes |
| `propose(node_or_edge, evidence)` | Escritura supervisada | Crea una propuesta en la bandeja de revisión; **nunca** escribe directo en la memoria confiable |

**Exportaciones para memoria:**
- `memory.jsonl`: un objeto por línea (nodo o arista) con procedencia.
- Bóveda Obsidian (sección 9.6) extendida a entidades y objetos de conocimiento.
- **Archivos de memoria por entidad** (markdown con frontmatter y hechos citados), compatibles con sistemas de memoria de agentes basados en archivos.

### 20.7 Gobernanza de la memoria

- **Humano en el circuito:** toda escritura de un agente entra como `proposed`.
- **Guardia de datos personales** antes de indexar; los proyectos con datos clínicos identificables quedan fuera de la memoria compartida salvo autorización explícita.
- **Control de acceso por proyecto** (lectura / propuesta / validación).
- **Olvido:** eliminar un documento retira sus fragmentos, reevalúa las aristas que dependían solo de él y registra el cambio.
- **Auditoría:** cada consulta de un agente queda registrada (herramienta, parámetros, nodos devueltos).
- **Interruptor de IA:** con IA apagada, el servidor MCP sigue respondiendo lectura con índices locales (sin embeddings nuevos).

### 20.8 Evaluación

- Conjunto de preguntas de referencia por proyecto con nodos esperados.
- Métricas: `recall@10` de recuperación, precisión de citas (hechos del paquete cuya cita respalda el hecho), tasa de afirmaciones sin cita (objetivo 0) y latencia de `context_pack` (objetivo < 2 s en proyectos de hasta 500 documentos).

### 20.9 Fases adicionales

| Fase | Entregable | Criterio de salida |
|---|---|---|
| F10 · Proyectos multi formato | Carga masiva, cola de trabajos, extracción de las familias 19.2 (sin audio) | Un fixture por familia, incluida una imagen con tabla y un diagrama |
| F11 · Grafo semántico | Fragmentos, entidades, relaciones, resolución, vistas 19.6 | Proyecto de prueba con 10 documentos y entidades puente correctas |
| F12 · Memoria | Índices FTS y vectores, GraphRAG, `context_pack` | Métricas 20.8 sobre el conjunto de referencia |
| F13 · Servidor MCP y exportaciones | `atlas-mcp`, `memory.jsonl`, archivos de memoria | Un agente responde preguntas citando fragmentos; toda escritura llega a la bandeja |
| F14 · Audio y video | Transcripción y fragmentación temporal | Fixture de audio de una reunión |

### 20.10 Decisiones abiertas adicionales

| # | Decisión | Opción predeterminada |
|---|---|---|
| D9 | Motor de OCR | Tesseract (español) |
| D10 | Modelo de visión para imágenes | Apagado; configurable |
| D11 | Base de grafos | SQLite; migración si supera ~1 millón de aristas |
| D12 | Modelo de embeddings | Local multilingüe |
| D13 | Qué agentes pueden conectarse al servidor MCP y con qué nivel | Solo lectura para todos; propuesta para agentes autorizados |
| D14 | Relación con el Segundo Cerebro | El Atlas exporta objetos de conocimiento compatibles; el Segundo Cerebro los importa como fuente |


---

## Anexo A · Catálogo de referencia del caso dorado (87 variables)

Tipos y terminologías son **asignaciones de referencia inferidas**; están pendientes de validación con el responsable del registro.

| # | Cat. | Subcategoría | Variable (literal normalizada) | Tipo | Terminología | Nota |
|---|---|---|---|---|---|---|
| 1 | 01 | — | Fecha de nacimiento | `fecha` | — |  |
| 2 | 01 | — | Edad al diagnóstico | `numerica` | — | Variable derivable de fecha de nacimiento y fecha de diagnóstico. |
| 3 | 01 | — | Sexo | `categorica` | — |  |
| 4 | 01 | — | Nacionalidad | `categorica` | — |  |
| 5 | 01 | — | Pueblo originario | `categorica` | — |  |
| 6 | 02 | — | Región de vivienda habitual | `categorica` | CUT |  |
| 7 | 02 | — | Comuna de vivienda habitual | `categorica` | CUT |  |
| 8 | 03 | — | Nivel educacional | `categorica` | — |  |
| 9 | 03 | — | Actividad ocupacional | `categorica` | — |  |
| 10 | 04 | — | Previsión primera consulta | `categorica` | — |  |
| 11 | 04 | — | Previsión al diagnóstico | `categorica` | — |  |
| 12 | 04 | — | Convenio oncológico | `categorica` | — |  |
| 13 | 05 | — | Categoría | `categorica` | — |  |
| 14 | 05 | — | Subcategoría | `categorica` | — |  |
| 15 | 05 | — | Clasificación GES | `categorica` | GES |  |
| 16 | 05 | — | Fecha de ingreso al GES | `fecha` | — |  |
| 17 | 05 | — | Clasificación del caso (Diagnóstico/Tratamiento) | `categorica` | — |  |
| 18 | 05 | — | Centro Responsable del Diagnóstico | `categorica` | — |  |
| 19 | 06 | — | Fecha primera consulta | `fecha` | — |  |
| 20 | 06 | — | Base Diagnóstica | `categorica` | — |  |
| 21 | 06 | — | Fecha de toma del informe diagnóstico | `fecha` | — |  |
| 22 | 06 | — | Fecha de emisión diagnóstico | `fecha` | — |  |
| 23 | 06 | — | Número de Informe diagnóstico | `identificador` | — |  |
| 24 | 07 | — | Tipo de Neoplasia | `categorica` | — |  |
| 25 | 07 | — | Diagnóstico CIE 10 | `codigo` | CIE-10 |  |
| 26 | 07 | — | Código de Topografía (CIEO) | `codigo` | CIE-O-3 |  |
| 27 | 07 | — | Código de Morfología (CIEO) | `codigo` | CIE-O-3 |  |
| 28 | 07 | — | Comportamiento | `codigo` | CIE-O-3 | En CIE-O corresponde al 5.º dígito de morfología (/0 a /3). |
| 29 | 08 | — | Grado de Diferenciación | `categorica` | CIE-O-3 |  |
| 30 | 08 | — | Focalidad Tumoral | `categorica` | — |  |
| 31 | 08 | — | Márgenes Quirúrgicos | `categorica` | — |  |
| 32 | 08 | — | Invasión Linfovascular | `binario` | — |  |
| 33 | 08 | — | Lateralidad | `categorica` | — |  |
| 34 | 09 | — | cTNM (Estadiaje Clínico) | `codigo` | TNM |  |
| 35 | 09 | — | pTNM (Estadiaje Patológico) | `codigo` | TNM |  |
| 36 | 09 | — | ypTNM (Estadiaje Post-tratamiento) | `codigo` | TNM |  |
| 37 | 09 | — | Estadio de Diagnóstico | `categorica` | TNM |  |
| 38 | 09 | — | Extensión al diagnóstico | `categorica` | — |  |
| 39 | 09 | — | Metástasis al diagnóstico | `binario` | — |  |
| 40 | 09 | — | Fecha metástasis | `fecha` | — |  |
| 41 | 09 | — | Topografía Metástasis | `codigo` | CIE-O-3 |  |
| 42 | 10 | — | Topografía Específica (Piel) | `categorica` | — |  |
| 43 | 10 | — | FIGO | `codigo` | FIGO |  |
| 44 | 10 | — | Estadio/FIGO diagnóstico disponible en historia clínica | `binario` | FIGO | Indicador de disponibilidad del dato: metadato de calidad más que variable clínica. |
| 45 | 11 | Características histopatológicas y factores pronósticos | S | `categorica` | TNM | Sin definición en la fuente. Podría corresponder a la categoría S (marcadores séricos) de tumores de células germinales; requiere confirmación. |
| 46 | 11 | Características histopatológicas y factores pronósticos | Grado de la OMS | `categorica` | Clasificación OMS |  |
| 47 | 11 | Características histopatológicas y factores pronósticos | Tasa Mitótica | `numerica` | — |  |
| 48 | 11 | Características histopatológicas y factores pronósticos | Breslow | `numerica` | — | Espesor en mm (melanoma). |
| 49 | 11 | Características histopatológicas y factores pronósticos | Ulceración | `binario` | — |  |
| 50 | 11 | Características histopatológicas y factores pronósticos | Gleason | `categorica` | Gleason / ISUP |  |
| 51 | 11 | Marcadores de inmunohistoquímica | P16 | `binario` | — |  |
| 52 | 11 | Marcadores de inmunohistoquímica | Her2 Estómago | `categorica` | — |  |
| 53 | 11 | Marcadores de inmunohistoquímica | Her2 Mama | `categorica` | — |  |
| 54 | 11 | Marcadores de inmunohistoquímica | Receptor de Estrógeno | `categorica` | — |  |
| 55 | 11 | Marcadores de inmunohistoquímica | Receptor de Progesterona | `categorica` | — |  |
| 56 | 11 | Marcadores de inmunohistoquímica | Ki-67 | `numerica` | — | Porcentaje de células positivas. |
| 57 | 11 | Alteraciones genéticas y perfil molecular | KRAS | `categorica` | — |  |
| 58 | 11 | Alteraciones genéticas y perfil molecular | EGFR | `categorica` | — |  |
| 59 | 11 | Alteraciones genéticas y perfil molecular | FISH (Hibridación fluorescente in situ) | `categorica` | — |  |
| 60 | 11 | Alteraciones genéticas y perfil molecular | Subtipo Molecular | `categorica` | — |  |
| 61 | 11 | Infecciones oncogénicas y biomarcadores | HPV | `binario` | — |  |
| 62 | 11 | Infecciones oncogénicas y biomarcadores | PSA al diagnóstico | `numerica` | — | ng/mL. |
| 63 | 12 | — | ¿Presentado a Comité Oncológico? | `binario` | — |  |
| 64 | 12 | — | Tipo de Comité | `categorica` | — |  |
| 65 | 12 | — | Fecha de comité | `fecha` | — |  |
| 66 | 12 | — | Clase de Caso | `categorica` | — |  |
| 67 | 12 | — | Intención de la resolución | `categorica` | — |  |
| 68 | 13 | — | Tipo de Centro responsable del tratamiento | `categorica` | — |  |
| 69 | 13 | — | Categoría de tratamiento | `categorica` | — |  |
| 70 | 13 | — | Subcategoría de tratamiento | `categorica` | — |  |
| 71 | 13 | — | Intención del tratamiento | `categorica` | — |  |
| 72 | 13 | — | Fecha de inicio tratamiento (externos o en Fundación) | `fecha` | — |  |
| 73 | 13 | — | Fecha de término de tratamiento (externos o en Fundación) | `fecha` | — |  |
| 74 | 14 | Progresión | ¿Presenta evidencia de progresión? | `binario` | — |  |
| 75 | 14 | Progresión | Fecha de progresión | `fecha` | — |  |
| 76 | 14 | Progresión | Código de Topografía (CIEO) de progresión | `codigo` | CIE-O-3 |  |
| 77 | 14 | Progresión | Tipo de progresión (extensión) | `categorica` | — |  |
| 78 | 14 | Recurrencia | ¿Presenta evidencia de recurrencia? | `binario` | — |  |
| 79 | 14 | Recurrencia | Fecha de recurrencia | `fecha` | — |  |
| 80 | 14 | Recurrencia | Código de Topografía (CIEO) de recurrencia | `codigo` | CIE-O-3 |  |
| 81 | 14 | Recurrencia | Tipo de recurrencia (extensión) | `categorica` | — |  |
| 82 | 15 | — | Fecha de último contacto con Fundación | `fecha` | — |  |
| 83 | 15 | — | Fecha de último contacto con médico tratante | `fecha` | — |  |
| 84 | 15 | — | Condición del caso al último contacto | `categorica` | — |  |
| 85 | 16 | — | Estado Vital | `binario` | — | Vivo / fallecido. |
| 86 | 16 | — | Fecha de defunción | `fecha` | — |  |
| 87 | 16 | — | Causa de defunción | `codigo` | CIE-10 |  |

## Anexo B · Categorías y descripciones literales

- **01 · Datos Demográficos Básicos**. Información básica de identificación demográfica del paciente.
- **02 · Datos Geográficos / Territoriales**. Información territorial asociada al lugar de residencia habitual del paciente.
- **03 · Datos Socioeconómicos y Educacionales**. Información territorial asociada al lugar de residencia habitual del paciente. *(Descripción duplicada de la categoría 02 en la fuente.)*
- **04 · Datos Clínico-Administrativos y de Previsión**. Información relacionada con la previsión de salud y las condiciones administrativas asociadas a la atención oncológica.
- **05 · Información Administrativa y Regulación (GES)**. Información administrativa, de categorización y trazabilidad institucional relacionada con el proceso GES.
- **06 · Cronología y Proceso Diagnóstico**. Registra los hitos temporales y los respaldos documentales desde la sospecha hasta la confirmación.
- **07 · Identificación y Codificación del Tumor**. Información utilizada para identificar y clasificar la neoplasia mediante sistemas de codificación estandarizados.
- **08 · Características del Tumor Primario e Histopatología**. Características anatómicas, histológicas y de extensión local del tumor primario.
- **09 · Estadificación y Extensión de la Enfermedad**. Variables que describen la extensión de la enfermedad y su clasificación según sistemas de estadificación oncológica.
- **10 · Sistemas de Estadificación Específicos**. Sistemas o variables de estadificación aplicables a determinados tipos de cáncer y sitios anatómicos.
- **11 · Características Biológicas, Histopatológicas y Biomarcadores del Tumor**. Variables que caracterizan las propiedades histopatológicas, biológicas, moleculares y de biomarcadores del tumor, incluidos factores pronósticos y resultados de estudios para clasificar determinadas neoplasias.
  - Subcategoría: Características histopatológicas y factores pronósticos (6 variables)
  - Subcategoría: Marcadores de inmunohistoquímica (6 variables)
  - Subcategoría: Alteraciones genéticas y perfil molecular (4 variables)
  - Subcategoría: Infecciones oncogénicas y biomarcadores (2 variables)
- **12 · Gestión del Comité Oncológico**. Información relacionada con la presentación, discusión y resolución del caso en comité oncológico.
- **13 · Historial de Tratamientos**. Información sobre los tratamientos oncológicos recibidos, incluyendo modalidad, intención, institución responsable y fechas.
- **14 · Evolución de la Enfermedad: Progresión y Recurrencia**. Información relacionada con la aparición de progresión o recurrencia de la enfermedad durante la evolución del caso.
  - Subcategoría: Progresión (4 variables)
  - Subcategoría: Recurrencia (4 variables)
- **15 · Seguimiento Clínico**. Información relacionada con el último contacto registrado y la situación clínica conocida durante el seguimiento.
- **16 · Desenlace y Estatus Vital**. Información relacionada con el estado vital del paciente y, cuando corresponde, con su fallecimiento y causa de muerte.

## Anexo C · Observaciones al documento fuente

| Prioridad | Observación | Detalle | Qué hacer | Categorías |
|---|---|---|---|---|
| Bloqueante | Cardinalidad no especificada | Comités (12), tratamientos (13) y progresión o recurrencia (14) pueden ocurrir varias veces por caso, pero el documento los describe como un único juego de campos. | Definir con el equipo de registro si cada caso admite uno o varios eventos de cada tipo (1:1 o 1:N). Condiciona el diseño de las tablas. | 12, 13, 14 |
| Bloqueante | Dominios de valores ausentes | Ninguna variable declara su lista de valores, unidad ni obligatoriedad. Los tipos de dato de este grafo son inferidos. | Completar para cada variable: lista de valores permitidos, unidad (si es numérica) y si es obligatoria. | todas |
| Importante | Descripción duplicada en la categoría 03 | La descripción repite la de la categoría 02 («información territorial…»). | Reemplazar por: «Nivel educacional y actividad ocupacional del paciente». | 03 |
| Importante | Variable «S» sin definición | Aparece sola en la subcategoría de factores pronósticos. Podría ser la categoría S de marcadores séricos (tumores germinales). | Confirmar su significado con el equipo de registro y renombrarla con un nombre explícito. | 11 |
| Importante | Posible solapamiento de grado | «Grado de diferenciación» (08) y «Grado de la OMS» (11) pueden capturar el mismo concepto según el tumor. | Definir el alcance de cada una (qué tumores la usan) o fusionarlas. | 08, 11 |
| Menor | Metadato de calidad mezclado con variables clínicas | Describe si el dato está disponible, no una característica del tumor. | Moverla a una sección de metadatos de completitud del registro. | 10 |
| Menor | Variable derivada | Se calcula desde la fecha de nacimiento y la fecha de diagnóstico. | Marcarla como calculada y validar su coherencia de forma automática. | 01 |

## Anexo D · Parser de referencia para el caso dorado (Python)

Implementación mínima verificada (16 categorías, 6 subcategorías, 87 variables, 0 sin clasificar). Punto de partida de `backend/app/parsers/docx.py`; debe extenderse para producir el IR completo con localizadores.

```python
import docx,re,sys
d=docx.Document(sys.argv[1])
cats=[];cur=None;sub=None;unparsed=[]
for i,p in enumerate(d.paragraphs):
    t=p.text.strip()
    if not t or i==0: continue
    islist=p._p.pPr is not None and p._p.pPr.numPr is not None
    bold=''.join(r.text for r in p.runs if r.bold).strip()
    m=re.match(r'^(\d+)\.\s*(.+)$',bold) if not islist else None
    if m:
        name=m.group(2).rstrip('. ').strip()
        rest=''.join(r.text for r in p.runs if not r.bold).strip()
        cur={'n':int(m.group(1)),'name':name,'desc':rest or None,'subs':[],'vars':[]};cats.append(cur);sub=None;continue
    if re.match(r'^subcategor[ií]a\s*:',t,re.I):
        sub={'name':t.split(':',1)[1].strip(),'vars':[]};cur['subs'].append(sub);continue
    if islist and cur:
        (sub or cur)['vars'].append(t);continue
    if cur and cur['desc'] is None and not cur['vars'] and not cur['subs']:
        cur['desc']=t;continue
    unparsed.append((i,t))
nv=sum(len(c['vars'])+sum(len(s['vars']) for s in c['subs']) for c in cats)
print(len(cats),sum(len(c['subs']) for c in cats),nv,'unparsed',unparsed)
print([ (c['n'],bool(c['desc'])) for c in cats])
```
