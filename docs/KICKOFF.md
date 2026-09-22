# Mensaje de arranque para Claude Code

Copia y pega este texto como primer mensaje en Claude Code, abierto en la carpeta raíz de este repositorio.

---

Hola. Vamos a construir el Atlas de Datos, incluido el módulo Proyectos.

1. Lee completos, en este orden: `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PLAN-modulo-proyectos.md`, `docs/SPEC.md`. Revisa `reference/prototype.html`, `samples/oncologia.agf.json`, `schemas/agf-1.0.json` y `profiles/default.json`.
2. Inicializa git (sin remoto), crea un entorno virtual, instala `requirements-dev.txt` y corre `pytest -q backend/tests`. Deben pasar 3 pruebas.
3. Entra en modo plan y propón el plan de la **Fase F0 (motor agnóstico)**: refactorizar el prototipo para que el visor lea `samples/oncologia.agf.json` y `profiles/default.json` en lugar de datos escritos en el HTML, sin cambiar su aspecto ni su comportamiento. Incluye: estructura del frontend (TypeScript + Vite), módulos del motor del grafo (simulación, render, etiquetas sin solapamiento, interacción, historial), cómo se calculan los grupos según la faceta activa, y la prueba de regresión visual con Playwright contra `reference/prototype.html`.
4. Antes de escribir código, dime: supuestos, riesgos, decisiones abiertas que toca la fase y cómo las resolverás por defecto.
5. No despliegues ni subas nada a remotos. Al terminar F0, entrégame el resumen de cierre definido en `CLAUDE.md` y el plan de F1.
