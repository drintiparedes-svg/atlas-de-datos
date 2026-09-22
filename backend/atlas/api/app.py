"""API REST del módulo Proyectos (FastAPI).

Arranque:  uvicorn atlas.api.app:app --host 127.0.0.1 --port 8000
Variables: DATABASE_URL (Neon Postgres o SQLite), ATLAS_API_TOKEN, ATLAS_CORS_ORIGINS, ATLAS_UPLOAD_DIR,
           ATLAS_MAX_UPLOAD_MB, AI_ENABLED, ATLAS_EMBEDDINGS.
Todas las rutas /api/* exigen autenticación (ver security.py); /api/health es pública.
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .. import __version__, db
from . import service
from .security import MAX_UPLOAD_MB, api_token, check_extension, cors_origins, require_auth, safe_filename

log = logging.getLogger("atlas.api")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.get_engine()
    if not api_token():
        log.warning("ATLAS_API_TOKEN no definido: el backend solo acepta peticiones locales. No exponer en red sin token (decisión M7).")
    log.info("Base de datos: %s", "postgresql (Neon)" if db.database_url().startswith("postgresql") else db.database_url())
    yield


app = FastAPI(title="Atlas de Datos · API de proyectos", version=__version__, docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=cors_origins(), allow_methods=["GET", "POST", "DELETE"], allow_headers=["X-Atlas-Token", "X-Atlas-Actor", "Content-Type"])


class ProjectIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    purpose: str | None = Field(default=None, max_length=2000)
    owner: str | None = Field(default=None, max_length=200)


class ReviewEdgeIn(BaseModel):
    edge_id: str
    decision: str = Field(pattern="^(validated|rejected|proposed)$")
    note: str | None = None


class ReviewNodeIn(BaseModel):
    node_id: str
    decision: str = Field(default="validated", pattern="^(validated|rejected|proposed)$")
    facets: dict[str, str] | None = None


@app.get("/api/health")
def health():
    return {"ok": True, "version": __version__, "database": "postgresql" if db.database_url().startswith("postgresql") else "sqlite",
            "auth": "token" if api_token() else "local-only", "ai_enabled": os.environ.get("AI_ENABLED", "false").lower() in ("1", "true", "yes")}


@app.get("/api/projects")
def projects(actor: str = Depends(require_auth)):
    return service.list_projects()


@app.post("/api/projects", status_code=201)
def create_project(body: ProjectIn, actor: str = Depends(require_auth)):
    return service.create_project(body.name, body.purpose, body.owner, actor)


@app.get("/api/projects/{pid}")
def project(pid: str, actor: str = Depends(require_auth)):
    p = service.get_project(pid)
    if not p:
        raise HTTPException(404, "Proyecto no encontrado")
    return p


@app.delete("/api/projects/{pid}")
def delete_project(pid: str, actor: str = Depends(require_auth)):
    if not service.delete_project(pid, actor):
        raise HTTPException(404, "Proyecto no encontrado")
    return {"deleted": pid}


@app.post("/api/projects/{pid}/sources", status_code=201)
async def upload_sources(pid: str, request: Request, files: list[UploadFile] = File(...), actor: str = Depends(require_auth)):
    """Sube uno o varios archivos. Cada uno pasa por la guardia de datos personales antes de extraerse."""
    out = []
    root_name = request.query_params.get("root_name")
    for f in files:
        name = safe_filename(f.filename or "archivo")
        check_extension(name)
        data = await f.read()
        if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
            raise HTTPException(413, f"{name}: supera {MAX_UPLOAD_MB:g} MB")
        if not data:
            raise HTTPException(400, f"{name}: archivo vacío")
        try:
            out.append(service.add_source(pid, name, data, actor, root_name))
        except KeyError:
            raise HTTPException(404, "Proyecto no encontrado")
    return out


@app.post("/api/projects/{pid}/sources/{sid}/confirm")
def confirm_source(pid: str, sid: str, actor: str = Depends(require_auth)):
    try:
        return service.confirm_source(pid, sid, actor)
    except KeyError:
        raise HTTPException(404, "Fuente no encontrada")


@app.delete("/api/projects/{pid}/sources/{sid}")
def discard_source(pid: str, sid: str, actor: str = Depends(require_auth)):
    if not service.discard_source(pid, sid, actor):
        raise HTTPException(404, "Fuente no encontrada")
    return {"discarded": sid}


@app.post("/api/projects/{pid}/build")
def build(pid: str, actor: str = Depends(require_auth)):
    try:
        return service.build_version(pid, actor, os.environ.get("ATLAS_EMBEDDINGS", "hash"))
    except KeyError:
        raise HTTPException(404, "Proyecto no encontrado")
    except ValueError as e:
        raise HTTPException(409, str(e))
    except RuntimeError as e:
        raise HTTPException(400, str(e))


@app.get("/api/projects/{pid}/agf")
def agf(pid: str, actor: str = Depends(require_auth)):
    g = service.latest_agf(pid)
    if not g:
        raise HTTPException(404, "El proyecto aún no tiene una versión publicada; ejecute build.")
    return JSONResponse(g)


@app.get("/api/projects/{pid}/vectors")
def vectors(pid: str, actor: str = Depends(require_auth)):
    v = service.latest_vectors(pid)
    if not v:
        raise HTTPException(404, "Sin índice de vectores")
    return JSONResponse(v)


@app.post("/api/projects/{pid}/review/edge")
def review_edge(pid: str, body: ReviewEdgeIn, actor: str = Depends(require_auth)):
    try:
        return service.review_edge(pid, body.edge_id, body.decision, actor, body.note)
    except KeyError as e:
        raise HTTPException(404, f"No encontrado: {e}")


@app.post("/api/projects/{pid}/review/node")
def review_node(pid: str, body: ReviewNodeIn, actor: str = Depends(require_auth)):
    try:
        return service.review_node(pid, body.node_id, body.decision, actor, body.facets)
    except KeyError as e:
        raise HTTPException(404, f"No encontrado: {e}")


@app.get("/api/projects/{pid}/search")
def search(pid: str, q: str, k: int = 12, actor: str = Depends(require_auth)):
    return service.search(pid, q, min(k, 50))


@app.get("/api/projects/{pid}/path")
def path(pid: str, a: str, b: str, actor: str = Depends(require_auth)):
    p = service.path(pid, a, b)
    return {"path": p or [], "found": p is not None}


@app.get("/api/projects/{pid}/inventory")
def inventory(pid: str, actor: str = Depends(require_auth)):
    from .. import project as P
    g = service.latest_agf(pid)
    if not g:
        raise HTTPException(404, "Sin versión publicada")
    return P.inventory(g)


@app.get("/api/projects/{pid}/audit")
def audit(pid: str, limit: int = 100, actor: str = Depends(require_auth)):
    return service.audit_log(pid, min(limit, 500))
