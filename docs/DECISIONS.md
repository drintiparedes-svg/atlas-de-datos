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

## Observaciones del documento fuente pendientes (equipo de registro)

Cardinalidad 1:1 o 1:N (secciones 12, 13, 14) · dominios de valores · descripción duplicada sección 3 · significado de la variable "S" · solapamiento de grado (8 y 11) · metadato de calidad en sección 10 · edad al diagnóstico como variable derivada.
