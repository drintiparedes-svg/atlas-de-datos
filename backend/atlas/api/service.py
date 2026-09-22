"""Lógica del módulo Proyectos: crear proyectos, recibir fuentes, guardia, extracción, publicación de versiones,
relaciones, revisión y auditoría. Independiente de FastAPI para poder probarse y reutilizarse desde la CLI."""
from __future__ import annotations

import hashlib
import json
import secrets
from pathlib import Path

from sqlalchemy import select

from .. import PROFILE_PATH, agf as A, guard, project as P, relations, search as S
from ..adapters import parse_file
from ..cli import raw_text
from ..db import Audit, Project, ProjectVersion, Source, session, upload_dir
from ..embeddings import get_provider
from ..embeddings.index import build_index
from ..text import slug


def _profile() -> dict:
    return json.loads(PROFILE_PATH.read_text(encoding="utf-8"))


def audit(db, project_id: str | None, actor: str, action: str, **detail):
    db.add(Audit(project_id=project_id, actor=actor, action=action, detail=detail))


# ── proyectos ───────────────────────────────────────────────────────────────

def create_project(name: str, purpose: str | None, owner: str | None, actor: str) -> dict:
    with session() as db:
        base = "prj_" + (slug(name)[:40] or "proyecto")
        pid = base
        while db.get(Project, pid):
            pid = f"{base}-{secrets.token_hex(2)}"
        p = Project(id=pid, name=name.strip()[:200], purpose=purpose, owner=owner)
        db.add(p)
        audit(db, pid, actor, "project.create", name=name)
        db.commit()
        return project_dict(p)


def list_projects() -> list[dict]:
    with session() as db:
        return [project_dict(p) for p in db.scalars(select(Project).where(Project.status != "deleted").order_by(Project.updated_at.desc()))]


def get_project(pid: str) -> dict | None:
    with session() as db:
        p = db.get(Project, pid)
        return project_dict(p, full=True) if p and p.status != "deleted" else None


def delete_project(pid: str, actor: str) -> bool:
    with session() as db:
        p = db.get(Project, pid)
        if not p:
            return False
        p.status = "deleted"
        audit(db, pid, actor, "project.delete")
        db.commit()
        return True


def project_dict(p: Project, full: bool = False) -> dict:
    latest = p.versions[-1] if p.versions else None
    d = {"id": p.id, "name": p.name, "purpose": p.purpose, "owner": p.owner, "status": p.status,
         "created_at": p.created_at.isoformat() if p.created_at else None, "updated_at": p.updated_at.isoformat() if p.updated_at else None,
         "sources": [source_dict(s) for s in p.sources if s.status != "discarded"],
         "version": latest.version if latest else 0, "stats": latest.stats if latest else {}}
    if full and latest:
        d["inventory"] = P.inventory(latest.agf, _profile())
    return d


def source_dict(s: Source) -> dict:
    return {"id": s.id, "filename": s.filename, "sha256": s.sha256, "size_bytes": s.size_bytes, "adapter": s.adapter,
            "source_type": s.source_type, "status": s.status, "detail": s.detail, "guard_hits": s.guard_hits,
            "guard_confirmed_by": s.guard_confirmed_by, "stats": s.stats, "created_at": s.created_at.isoformat() if s.created_at else None}


# ── fuentes ─────────────────────────────────────────────────────────────────

def add_source(pid: str, filename: str, data: bytes, actor: str, root_name: str | None = None) -> dict:
    """Guarda el archivo por sha256, corre la guardia de datos personales y, si no hay hallazgos, extrae y publica.
    Con hallazgos queda `pending_confirmation` hasta `confirm_source` (nunca se procesa en silencio)."""
    sha = hashlib.sha256(data).hexdigest()
    with session() as db:
        p = db.get(Project, pid)
        if not p or p.status == "deleted":
            raise KeyError(pid)
        dup = db.scalar(select(Source).where(Source.project_id == pid, Source.sha256 == sha, Source.status != "discarded"))
        if dup:
            return source_dict(dup)
        ext = Path(filename).suffix.lower()
        dest = upload_dir() / pid
        dest.mkdir(parents=True, exist_ok=True)
        path = dest / f"{sha}{ext}"
        path.write_bytes(data)
        s = Source(id="src_" + secrets.token_hex(6), project_id=pid, filename=filename, sha256=sha, size_bytes=len(data), stored_path=str(path))
        db.add(s)
        audit(db, pid, actor, "source.upload", filename=filename, sha256=sha, size=len(data))
        db.commit()
        sid = s.id
    return _extract(pid, sid, actor, root_name)


def _extract(pid: str, sid: str, actor: str, root_name: str | None = None, confirmed: bool = False) -> dict:
    with session() as db:
        s = db.get(Source, sid)
        try:
            doc = parse_file(s.stored_path)
            rep = guard.scan_text(raw_text(Path(s.stored_path), doc))
            s.guard_hits = rep.hits
            if rep.blocked and not confirmed:
                s.status = "pending_confirmation"
                s.detail = rep.summary() + " Muestras enmascaradas: " + json.dumps(rep.samples, ensure_ascii=False)
                audit(db, pid, actor, "source.guard_blocked", source=sid, hits=rep.hits)
                db.commit()
                return source_dict(s)
            g = A.build(doc, project_id=pid, root_name=root_name)
            g["sources"][0]["personal_data_guard"] = {"hits": rep.hits, "confirmed_by_user": bool(rep.blocked)}
            s.agf = g
            s.adapter = doc.adapter
            s.source_type = doc.source_type
            s.stats = A.stats(g)
            s.status = "published"
            summ = doc.summary()
            s.detail = f"{doc.adapter}: {summ['sections_top']} secciones, {summ['subsections']} subsecciones, {summ['elements']} elementos, {summ['unparsed']} sin clasificar, {len(g['findings'])} hallazgos"
            audit(db, pid, actor, "source.published", source=sid, adapter=doc.adapter, stats=s.stats)
        except Exception as e:  # noqa: BLE001
            s.status = "error"
            s.detail = f"{type(e).__name__}: {e}"[:500]
            audit(db, pid, actor, "source.error", source=sid, error=s.detail)
        db.commit()
        return source_dict(s)


def confirm_source(pid: str, sid: str, actor: str) -> dict:
    """Confirmación explícita de que el archivo no contiene datos de pacientes. Queda en auditoría con el actor."""
    with session() as db:
        s = db.get(Source, sid)
        if not s or s.project_id != pid:
            raise KeyError(sid)
        if s.status != "pending_confirmation":
            return source_dict(s)
        s.guard_confirmed_by = actor
        audit(db, pid, actor, "source.guard_confirmed", source=sid, hits=s.guard_hits)
        db.commit()
    return _extract(pid, sid, actor, confirmed=True)


def discard_source(pid: str, sid: str, actor: str) -> bool:
    with session() as db:
        s = db.get(Source, sid)
        if not s or s.project_id != pid:
            return False
        s.status = "discarded"
        s.agf = None
        try:
            if s.stored_path and Path(s.stored_path).exists():
                Path(s.stored_path).unlink()
        except OSError:
            pass
        audit(db, pid, actor, "source.discard", source=sid)
        db.commit()
        return True


# ── versiones ───────────────────────────────────────────────────────────────

def build_version(pid: str, actor: str, provider: str | None = "hash") -> dict:
    """Consolida las fuentes publicadas, propone relaciones y guarda una versión nueva del proyecto."""
    with session() as db:
        p = db.get(Project, pid)
        if not p or p.status == "deleted":
            raise KeyError(pid)
        srcs = [s.agf for s in p.sources if s.status == "published" and s.agf]
        if not srcs:
            raise ValueError("El proyecto no tiene fuentes publicadas.")
        g = P.merge(srcs, pid, p.name) if len(srcs) > 1 else json.loads(json.dumps(srcs[0]))
        g["project"] = {"id": pid, "name": p.name}
        prov = get_provider(provider)
        idx = build_index(g, prov, _profile()) if prov else None
        g["edges"] += relations.propose(g, idx)
        P.add_shares(g)
        # conservar decisiones de revisión de la versión anterior (misma pareja de nodos)
        prev = p.versions[-1] if p.versions else None
        if prev:
            decided = {(e["kind"], e["source"], e["target"]): e["status"] for e in prev.agf["edges"] if e.get("reviewed_by")}
            for e in g["edges"]:
                st = decided.get((e["kind"], e["source"], e["target"]))
                if st:
                    e["status"] = st
                    e["reviewed_by"] = "heredado"
        A.validate(g)
        stats = A.stats(g)
        stats["inventory_totals"] = P.inventory(g)["totals"]
        v = ProjectVersion(project_id=pid, version=(prev.version + 1 if prev else 1), agf=g, vectors=idx, stats=stats, built_by=actor)
        db.add(v)
        audit(db, pid, actor, "version.build", version=v.version, stats=stats)
        db.commit()
        return {"version": v.version, "stats": stats, "built_at": v.built_at.isoformat() if v.built_at else None}


def latest_agf(pid: str) -> dict | None:
    with session() as db:
        p = db.get(Project, pid)
        if not p or not p.versions:
            return None
        return p.versions[-1].agf


def latest_vectors(pid: str) -> dict | None:
    with session() as db:
        p = db.get(Project, pid)
        if not p or not p.versions:
            return None
        return p.versions[-1].vectors


def review_edge(pid: str, edge_id: str, decision: str, actor: str, note: str | None = None) -> dict:
    """Aceptar o rechazar una propuesta (same_as, relates, references inferidas). Nunca fusiona nodos."""
    if decision not in ("validated", "rejected", "proposed"):
        raise ValueError("decisión inválida")
    with session() as db:
        p = db.get(Project, pid)
        if not p or not p.versions:
            raise KeyError(pid)
        v = p.versions[-1]
        g = json.loads(json.dumps(v.agf))
        e = next((x for x in g["edges"] if x.get("id") == edge_id), None)
        if not e:
            raise KeyError(edge_id)
        e["status"] = decision
        e["reviewed_by"] = actor
        if note:
            e["review_note"] = note[:500]
        P.add_shares(g)
        v.agf = g
        audit(db, pid, actor, "edge.review", edge=edge_id, decision=decision, kind=e["kind"])
        db.commit()
        return e


def review_node(pid: str, node_id: str, decision: str, actor: str, facets: dict | None = None) -> dict:
    """Validar o rechazar un nodo y, opcionalmente, corregir facetas (quedan `manual`)."""
    with session() as db:
        p = db.get(Project, pid)
        if not p or not p.versions:
            raise KeyError(pid)
        v = p.versions[-1]
        g = json.loads(json.dumps(v.agf))
        n = next((x for x in g["nodes"] if x["id"] == node_id), None)
        if not n:
            raise KeyError(node_id)
        if decision in ("validated", "rejected", "proposed"):
            n["status"] = decision
        for k, val in (facets or {}).items():
            n.setdefault("facets", {})[k] = val
            n.setdefault("facet_origin", {})[k] = "manual"
            n.setdefault("facet_confidence", {})[k] = 1.0
            n.setdefault("facet_rationale", {})[k] = f"corregido por {actor}"
        n["reviewed_by"] = actor
        v.agf = g
        audit(db, pid, actor, "node.review", node=node_id, decision=decision, facets=facets or {})
        db.commit()
        return n


def search(pid: str, q: str, k: int = 12) -> list[dict]:
    with session() as db:
        p = db.get(Project, pid)
        if not p or not p.versions:
            return []
        v = p.versions[-1]
        qvec = None
        if v.vectors:
            prov = get_provider(v.vectors.get("provider"))
            if prov:
                qvec = prov.embed_one(q, "query")
        return S.search(v.agf, q, v.vectors, qvec, k)


def path(pid: str, a: str, b: str) -> list[dict] | None:
    g = latest_agf(pid)
    return S.shortest_path(g, a, b) if g else None


def audit_log(pid: str, limit: int = 100) -> list[dict]:
    with session() as db:
        rows = db.scalars(select(Audit).where(Audit.project_id == pid).order_by(Audit.at.desc()).limit(limit))
        return [{"at": r.at.isoformat() if r.at else None, "actor": r.actor, "action": r.action, "detail": r.detail} for r in rows]
