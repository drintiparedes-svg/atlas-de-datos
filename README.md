# Atlas de Datos

Grafo de conocimiento tipo Obsidian para entender cómo se organiza y relaciona la metadata de un conjunto de documentos, y convertir lo validado en memoria para agentes de IA. Primer caso: diccionario de variables del registro oncológico (FALP).

- Prototipo de referencia: `reference/prototype.html` (abrir en el navegador) · https://atlas-oncologico.vercel.app
- Inicio con Claude Code: `docs/KICKOFF.md`
- Reglas del proyecto: `CLAUDE.md` · Decisiones: `docs/DECISIONS.md`
- Plan: `docs/PLAN-modulo-proyectos.md` · Especificación: `docs/SPEC.md`

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q backend/tests
```

Estructura objetivo: `frontend/` (visor TypeScript) y `backend/` (FastAPI, adaptadores, memoria), según PLAN §10.
