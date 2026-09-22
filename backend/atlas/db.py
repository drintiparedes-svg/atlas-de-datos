"""Persistencia del módulo Proyectos (decisión D11 aplicada: PostgreSQL en Neon; SQLite como respaldo local y de pruebas).

Se guardan metadatos, AGF (JSON) y auditoría. Nunca filas de datos: los adaptadores solo producen
estadísticas agregadas. Los archivos subidos se conservan en ATLAS_UPLOAD_DIR (fuera de la base) el tiempo
necesario para la extracción y quedan referenciados por su sha256.

Configuración: DATABASE_URL (p. ej. postgresql+psycopg://usuario:clave@ep-xxx.neon.tech/atlas?sslmode=require).
Sin DATABASE_URL se usa sqlite:///data/atlas.db.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

from . import ROOT


def now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    purpose: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    sources: Mapped[list["Source"]] = relationship(back_populates="project", cascade="all, delete-orphan", order_by="Source.created_at")
    versions: Mapped[list["ProjectVersion"]] = relationship(back_populates="project", cascade="all, delete-orphan", order_by="ProjectVersion.version")


class Source(Base):
    __tablename__ = "sources"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(300))
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    adapter: Mapped[str | None] = mapped_column(String(60), nullable=True)
    source_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="queued")   # queued | pending_confirmation | published | error | discarded
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    guard_hits: Mapped[dict] = mapped_column(JSON, default=dict)
    guard_confirmed_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    stored_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    agf: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    stats: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    project: Mapped[Project] = relationship(back_populates="sources")


class ProjectVersion(Base):
    __tablename__ = "project_versions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    agf: Mapped[dict] = mapped_column(JSON)
    vectors: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    stats: Mapped[dict] = mapped_column(JSON, default=dict)
    built_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    built_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    project: Mapped[Project] = relationship(back_populates="versions")


class Audit(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    actor: Mapped[str | None] = mapped_column(String(200), nullable=True)
    action: Mapped[str] = mapped_column(String(60))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


_engine = None
_Session: sessionmaker[Session] | None = None


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        if url.startswith("postgres://"):
            url = "postgresql+psycopg://" + url[len("postgres://"):]
        elif url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url
    data = ROOT / "data"
    data.mkdir(exist_ok=True)
    return f"sqlite:///{data / 'atlas.db'}"


def get_engine(url: str | None = None):
    global _engine, _Session
    if _engine is None or url:
        u = url or database_url()
        kw = {"pool_pre_ping": True}
        if u.startswith("sqlite"):
            kw["connect_args"] = {"check_same_thread": False}
        _engine = create_engine(u, **kw)
        if u.startswith("sqlite"):
            @event.listens_for(_engine, "connect")
            def _fk(dbapi_conn, _):
                dbapi_conn.execute("PRAGMA foreign_keys=ON")
        Base.metadata.create_all(_engine)
        _Session = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def session() -> Session:
    if _Session is None:
        get_engine()
    return _Session()  # type: ignore[misc]


def upload_dir() -> Path:
    p = Path(os.environ.get("ATLAS_UPLOAD_DIR") or (ROOT / "data" / "uploads"))
    p.mkdir(parents=True, exist_ok=True)
    return p
