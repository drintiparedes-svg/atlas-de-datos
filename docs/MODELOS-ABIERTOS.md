# Modelos abiertos en el Atlas de Datos

Decisiones D2 y D12: proveedor de IA apagado por defecto; embeddings con un modelo local multilingüe cuando se enciende. Este documento describe qué modelos se usan, para qué, y cómo se verifica su efecto.

## 1. Para qué se usan

| Uso | Dónde | Sin IA (predeterminado) | Con modelo abierto |
|---|---|---|---|
| Búsqueda de datos por nombre o idea | Barra de búsqueda del visor, `atlas search` | Léxica (nombre normalizado, palabras, prefijos) + vectores `hash` | Léxica + vectores del modelo (captura sinónimos: «defunción» ≈ «fallecimiento») |
| «Parecidos por nombre y descripción» en cada nota | Nota del elemento | Vecinos por vectores `hash` | Vecinos por vectores del modelo |
| Propuestas `same_as` entre fuentes | `atlas relate`, `atlas project`, pestaña Fuentes | Nombre normalizado idéntico, mismas palabras, similitud léxica ≥ 0,85 combinada con coseno `hash` | La misma regla, con coseno del modelo |
| Propuestas `relates` (similar_to) | ídem | Umbral 0,55 sobre la combinación léxica + `hash` | ídem con el modelo |

Todo lo producido por modelos queda como `origin: inferred`, `status: proposed`, con `confidence` y `rationale`. Nada entra a la memoria confiable sin validación humana.

## 2. Proveedores

| Proveedor | Modelo | Licencia | Red | Cómo activarlo |
|---|---|---|---|---|
| `hash` | FNV-1a sobre palabras y trigramas, 256 dimensiones | Propio | Ninguna | Predeterminado. Idéntico en Python y TypeScript (prueba de paridad `hash_parity.json`). |
| `st` | `intfloat/multilingual-e5-small` (384 dimensiones, multilingüe); alternativa `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` | MIT / Apache 2.0 | Descarga los pesos una vez desde Hugging Face; luego `HF_HUB_OFFLINE=1` | `pip install "atlas-de-datos[ai]"`, `AI_ENABLED=true atlas embed X.agf.json --provider st` |
| `ollama` | `nomic-embed-text`, `bge-m3` u otro servido por Ollama | Apache 2.0 / MIT | Solo localhost | `AI_ENABLED=true atlas embed X.agf.json --provider ollama:bge-m3` |

El índice se guarda junto al AGF (`X.vectors.json`) con el nombre del proveedor y del modelo. El visor lo carga automáticamente. Las consultas libres del navegador se vectorizan con el mismo proveedor solo si está disponible en el cliente: `hash` siempre lo está; para `st` u `ollama` el navegador usa los vecinos precalculados y la búsqueda léxica, o un proveedor registrado con `window.atlasRegisterEmbeddings` (por ejemplo, transformers.js con el mismo modelo, cuando la persona activa la IA local).

## 3. Guardrails

- Con `AI_ENABLED=false` el comando `atlas` rechaza `st` y `ollama` y no hay llamadas de red en tiempo de ejecución (prueba `test_provider_gating_by_ai_enabled`).
- La guardia de datos personales bloquea la IA para cualquier archivo con patrones de datos personales hasta confirmación explícita.
- El adaptador de bases de datos y el de tablas trabajan solo con metadatos y estadísticas agregadas: los modelos nunca ven filas.
- Ningún proveedor fusiona nodos: solo propone aristas.

## 4. Qué está verificado y qué no

- Verificado en este repositorio: proveedor `hash` (paridad Python ↔ TypeScript, determinismo), propuestas `same_as` sobre el conjunto de 4 fuentes (43 propuestas, todas correctas por construcción del fixture en las de nombre idéntico), búsqueda híbrida y camino explicado.
- No verificado aquí: la descarga y ejecución de `multilingual-e5-small` y de Ollama, porque el entorno de construcción no tiene acceso a Hugging Face ni a un servidor Ollama. El código del proveedor está escrito contra la API estable de `sentence-transformers` (`encode(normalize_embeddings=True)`) y de Ollama (`POST /api/embed`), y debe validarse en un equipo con acceso antes de confiar en las cifras. Se recomienda medir precisión de `same_as` (objetivo ≥ 0,9, PLAN §11 F4) sobre un conjunto de referencia con el modelo elegido.
