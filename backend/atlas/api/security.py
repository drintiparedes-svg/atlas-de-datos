"""Seguridad del backend (contexto salud: M7, guardia de datos personales, auditoría).

- Autenticación por token compartido en la cabecera `X-Atlas-Token` (ATLAS_API_TOKEN). Si no está definido,
  el servidor solo acepta peticiones desde localhost y lo advierte al arrancar: nunca exponer sin token.
- CORS restringido a ATLAS_CORS_ORIGINS (lista separada por comas; predeterminado: orígenes locales de Vite).
- Límite de tamaño por archivo (ATLAS_MAX_UPLOAD_MB, predeterminado 25) y lista de extensiones permitidas.
- Nombres de archivo saneados; los archivos se guardan por sha256, nunca con el nombre original como ruta.
- Con AI_ENABLED=false no hay llamadas de red; los proveedores externos de embeddings quedan bloqueados.
"""
from __future__ import annotations

import os
import re
import secrets

from fastapi import HTTPException, Request

ALLOWED_EXTENSIONS = {".docx", ".csv", ".tsv", ".xlsx", ".sql", ".ddl", ".md", ".txt", ".json"}
MAX_UPLOAD_MB = float(os.environ.get("ATLAS_MAX_UPLOAD_MB", "25"))


def cors_origins() -> list[str]:
    raw = os.environ.get("ATLAS_CORS_ORIGINS")
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return ["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:4173", "http://localhost:4173"]


def api_token() -> str | None:
    return os.environ.get("ATLAS_API_TOKEN") or None


def require_auth(request: Request) -> str:
    """Devuelve el actor (identificador del llamante) o lanza 401/403."""
    token = api_token()
    given = request.headers.get("x-atlas-token") or request.query_params.get("token")
    if token:
        if not given or not secrets.compare_digest(given, token):
            raise HTTPException(status_code=401, detail="Token inválido o ausente (cabecera X-Atlas-Token).")
    else:
        host = request.client.host if request.client else ""
        if host not in ("127.0.0.1", "::1", "localhost", "testclient"):
            raise HTTPException(status_code=403, detail="Sin ATLAS_API_TOKEN el backend solo acepta peticiones locales.")
    actor = request.headers.get("x-atlas-actor") or "anonimo"
    return re.sub(r"[^\w.@ -]", "", actor)[:200] or "anonimo"


def safe_filename(name: str) -> str:
    name = os.path.basename(name or "archivo")
    name = re.sub(r"[^\w.\- ()áéíóúÁÉÍÓÚñÑ]", "_", name).strip() or "archivo"
    return name[:200]


def check_extension(name: str) -> str:
    ext = os.path.splitext(name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Extensión no admitida: {ext or '(sin extensión)'}. Permitidas: {', '.join(sorted(ALLOWED_EXTENSIONS))}.")
    return ext
