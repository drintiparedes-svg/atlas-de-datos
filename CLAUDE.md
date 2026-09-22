# CLAUDE.md · Atlas de Datos

Instrucciones permanentes para Claude Code en este repositorio. Léelas completas al iniciar cada sesión.

## Qué es este proyecto

El Atlas convierte documentos que describen información (diccionarios de variables, planillas, esquemas de bases de datos, informes, presentaciones, imágenes, correos) en un **grafo de conocimiento navegable tipo Obsidian**. El grafo muestra cómo se organiza la metadata y cómo se relaciona, y responde qué tipos de documentos, información y datos contiene un proyecto. Lo validado se exporta como **memoria para agentes de IA**.

Responsable del producto: Dr. Inti Paredes (Informática Médica y Salud Digital, FALP). Contexto de salud: evidencia, trazabilidad y seguridad no son negociables.

## Documentos fuente de verdad (en este orden)

1. `docs/DECISIONS.md` · decisiones tomadas y abiertas. Prevalece sobre todo lo demás.
2. `docs/PLAN-modulo-proyectos.md` · plan agnóstico al documento, fases F0 a F6, formato AGF.
3. `docs/SPEC.md` · especificación v2 del modelo, visualización, memoria y caso dorado.
4. `reference/prototype.html` · prototipo funcional de referencia (visual e interacción). Publicado en https://atlas-oncologico.vercel.app.

Donde el PLAN sea más específico que la SPEC, prevalece el PLAN.

## Artefactos ya preparados

| Ruta | Contenido | Estado |
|---|---|---|
| `schemas/agf-1.0.json` | JSON Schema del Atlas Graph Format | Borrador validado contra la muestra |
| `samples/oncologia.agf.json` | Grafo oncológico en AGF (118 nodos, 143 aristas, 7 hallazgos) | Válido contra el esquema |
| `profiles/default.json` | Tokens, facetas, formas, parámetros de fuerzas y etiquetas del prototipo | Extraído del prototipo |
| `config/*.yaml` | Facetas, vocabularios, cronología oncológica, reglas de calidad | Borrador |
| `scripts/reference_parser.py` | Parser de referencia del docx (16 / 6 / 87, 0 sin clasificar) | Verificado |
| `backend/tests/fixtures/` | `info_para_presentacion.docx` y `golden_expected.json` | Caso dorado |
| `backend/tests/test_golden.py` | 3 pruebas del caso dorado y del AGF | En verde |

## Comandos

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q backend/tests            # debe quedar en verde antes y después de cada cambio
python scripts/reference_parser.py backend/tests/fixtures/info_para_presentacion.docx
```

## Forma de trabajo

1. **Planifica antes de construir.** Al comenzar cada fase, propone un plan breve (archivos, pasos, pruebas) y espera aprobación antes de cambios grandes.
2. **Trabaja por fases** del PLAN (§11). No avances de fase sin cumplir su criterio de aceptación.
3. **Caso dorado siempre en verde.** Cifras en `backend/tests/fixtures/golden_expected.json`: 16 secciones, 6 subsecciones, 87 elementos, 18 grupos de metadata, tipos fecha 14 · categórica 45 · binario 10 · numérica 5 · código 12 · identificador 1, 21 elementos con vocabulario, 13 aristas de cronología, 176 aristas visibles en vista Combinada sin capas.
4. **Regresión visual:** toda versión del visor se compara contra `reference/prototype.html` (Playwright, 1440×900, tema claro y oscuro).
5. **Al cerrar cada tarea:** pruebas en verde, `CHANGELOG.md` actualizado y un resumen con qué se hizo, por qué, con qué datos, supuestos y límites detectados.
6. **Decisiones abiertas:** si una tarea depende de una decisión marcada como abierta en `docs/DECISIONS.md`, implementa la opción predeterminada detrás de configuración, regístralo y avisa. No la resuelvas en silencio.

## Guardrails (no negociables)

- No inventar variables, secciones, dominios de valores ni equivalencias. Lo no declarado es `unknown` o `inferred`, nunca un hecho.
- Toda inferencia lleva `origin: inferred`, `confidence`, `rationale` y queda `status: proposed` hasta validación humana.
- No procesar documentos con datos personales detectados sin confirmación explícita del usuario. Nunca usar datos reales de pacientes en fixtures: solo sintéticos o públicos.
- El adaptador de bases de datos trabaja **solo con metadatos y estadísticas agregadas**, nunca con filas.
- Con `AI_ENABLED=false` (valor por defecto), cero llamadas de red en tiempo de ejecución.
- No publicar, desplegar ni subir a repositorios remotos sin aprobación explícita. El módulo con carga de documentos **no** se despliega en URLs públicas.
- No cambiar parámetros visuales del perfil (`profiles/default.json`) sin decisión registrada.
- Las etiquetas del grafo **nunca se superponen** (algoritmo en PLAN §5.4, implementado en `reference/prototype.html`, función `drawLabels`).
- `backend/tests/fixtures/info_para_presentacion.docx` es un documento interno de FALP (sin datos de pacientes): no subirlo a repositorios públicos.

## Estilo de la interfaz y la documentación

- Español formal, claro y preciso. Claves de código en inglés.
- No usar guiones largos (rayas) como puntuación; usar comas, dos puntos, paréntesis o frases separadas.
- Estética editorial (tokens del perfil, Fraunces · Albert Sans · JetBrains Mono). Evitar el look genérico de "IA generativa".

## Terminología acordada

- "Binario" (no "dicotómico"). Control "Separar" (no "repulsión"), rango 200 a 12000; "Distancia" 0,3 a 3,0.
- Prioridad de corrección: Bloqueante, Importante, Menor (no alta/media/baja), siempre con "Qué hacer".
- Nombre del producto visible: "Atlas de Datos Oncológicos" para el caso oncológico; "Atlas de Datos" para el módulo general.
