"""Atlas de Datos: adaptadores por formato → Atlas Graph Format (AGF) → visor y memoria.

Capas (docs/PLAN-modulo-proyectos.md §0):
  atlas.adapters   archivos → IR (árbol intermedio) con localizadores exactos
  atlas.infer      facetas inferidas (tipo de dato, dominio, sensibilidad, vocabulario)
  atlas.agf        IR → AGF 1.0 con identificadores estables y validación contra el esquema
  atlas.quality    hallazgos de calidad con prioridad de corrección
  atlas.embeddings proveedores de vectores: hash (offline), sentence-transformers, ollama
  atlas.relations  propuestas same_as / relates entre fuentes (siempre proposed)
  atlas.project    consolidación de varias fuentes en un proyecto
  atlas.memory     exportación a memory.jsonl y fichas markdown para agentes
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = ROOT / "config"
SCHEMA_PATH = ROOT / "schemas" / "agf-1.0.json"
PROFILE_PATH = ROOT / "profiles" / "default.json"

__version__ = "0.2.0"
