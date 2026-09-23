/** Pestaña Proyectos: gestión de proyectos contra el backend (crear, elegir, subir fuentes con distintas
 *  extensiones, confirmar la guardia, publicar versión) y, debajo, el inventario del proyecto abierto.
 *  Sin backend configurado, muestra cómo conectarlo y el inventario del AGF actual. */
import type { App } from "../app";
import { AtlasApi, loadApiConfig, saveApiConfig, type ApiProject, type ApiSource } from "../api";
import { esc } from "../lib/text";
import { renderInventario } from "./inventory";

export const projectsState = {
  api: null as AtlasApi | null,
  cfg: loadApiConfig(),
  list: [] as ApiProject[],
  current: null as ApiProject | null,
  health: null as { database: string; auth: string; ai_enabled: boolean; version: string } | null,
  error: "" as string,
  busy: "" as string,
  showConfig: false,
};

export function apiClient(): AtlasApi | null {
  const s = projectsState;
  if (!s.cfg?.url) return null;
  if (!s.api || s.api.base !== s.cfg.url.replace(/\/+$/, "") || s.api.token !== s.cfg.token) s.api = new AtlasApi(s.cfg.url, s.cfg.token, s.cfg.actor);
  return s.api;
}

export async function refreshProjects(app: App) {
  const api = apiClient(); const s = projectsState;
  if (!api) return;
  try {
    s.health = await api.health();
    s.list = await api.projects();
    s.error = "";
    if (s.current) s.current = s.list.find((p) => p.id === s.current!.id) || null;
  } catch (e) { s.error = `No se pudo conectar con el backend (${(e as Error).message}).`; s.health = null; }
  if (app.tab === "proyectos") app.renderTab();
}

export async function openProject(app: App, id: string) {
  const api = apiClient()!; const s = projectsState;
  s.busy = "Abriendo proyecto…"; app.renderTab();
  try {
    s.current = await api.project(id);
    if (s.current.version > 0) {
      const [agf, vectors] = await Promise.all([api.agf(id), api.vectors(id)]);
      app.load(agf, app.pv.p, vectors);
      app.rebuildModel(true);
    }
    s.error = "";
  } catch (e) { s.error = (e as Error).message; }
  s.busy = ""; app.tab = "proyectos"; app.renderTab();
}

function statusLabel(st: string) {
  return ({ queued: "en cola", pending_confirmation: "pendiente de confirmación", published: "publicado", error: "error", discarded: "descartado" } as Record<string, string>)[st] || st;
}

function sourceRow(s: ApiSource, pid: string) {
  const hits = Object.entries(s.guard_hits || {}).filter(([, v]) => v).map(([k, v]) => `${k} ×${v}`).join(", ");
  return `<div class="src-row"><span>${esc(s.filename)}</span><span class="st">${esc(statusLabel(s.status))}</span>
    <span class="meta">${esc(s.detail || "")}${s.guard_confirmed_by ? ` · confirmado por ${esc(s.guard_confirmed_by)}` : ""}</span>
    ${s.status === "pending_confirmation" ? `<div style="grid-column:1/3;display:flex;gap:.35rem;flex-wrap:wrap"><span class="conf">Posibles datos personales: ${esc(hits)}</span><button class="btn" data-confirm-src="${esc(s.id)}" data-pid="${esc(pid)}">Confirmo que no contiene datos de pacientes: continuar</button><button class="btn" data-discard-src="${esc(s.id)}" data-pid="${esc(pid)}">Descartar</button></div>` : ""}
    ${s.status === "error" ? `<div style="grid-column:1/3"><button class="btn" data-discard-src="${esc(s.id)}" data-pid="${esc(pid)}">Quitar</button></div>` : ""}</div>`;
}

export function renderProyectos(app: App): string {
  const s = projectsState, api = apiClient();
  const cfgBox = `
    <details ${s.showConfig || !api || !s.cfg?.token ? "open" : ""} style="margin:.5rem 0">
      <summary class="eyebrow" style="cursor:pointer">Conexión con el backend</summary>
      <div class="pick" style="margin-top:.5rem">
        <input id="api-url" placeholder="URL del backend, p. ej. http://127.0.0.1:8000" value="${esc(s.cfg?.url || "")}" autocomplete="off">
        <input id="api-token" type="password" placeholder="Token (X-Atlas-Token)" value="${esc(s.cfg?.token || "")}" autocomplete="off">
        <input id="api-actor" placeholder="Tu nombre (queda en la auditoría)" value="${esc(s.cfg?.actor || "")}" autocomplete="off">
        <div style="display:flex;gap:.35rem;flex-wrap:wrap"><button class="btn-primary" id="api-save">Conectar</button>${api ? `<button class="btn" id="api-forget">Desconectar</button>` : ""}</div>
      </div>
      <p style="font-size:.74rem">El backend guarda proyectos, fuentes y versiones en PostgreSQL (Neon) o SQLite, con token, guardia de datos personales y auditoría. Arranque: <code>uvicorn atlas.api.app:app</code>. Sin backend, la pestaña Fuentes procesa documentos en este navegador.</p>
    </details>`;
  if (!api) {
    return `<div class="eyebrow">Proyectos</div><h2>Proyectos del Atlas</h2>
      <p>Conecta el backend para crear proyectos, subir documentos con distintas extensiones y publicar versiones con trazabilidad. Mientras tanto ves el inventario del grafo cargado.</p>${cfgBox}<hr style="border:0;border-top:1px solid var(--line);margin:1rem 0">${renderInventario(app)}`;
  }
  const cur = s.current;
  const head = `
    <div class="eyebrow">Proyectos · ${s.health ? `${esc(s.health.database)} · ${s.health.auth === "token" ? "con token" : "solo local"} · IA ${s.health.ai_enabled ? "activa" : "apagada"}` : "sin conexión"}</div>
    <h2>${cur ? esc(cur.name) : "Proyectos del Atlas"}</h2>
    ${s.error ? `<div class="alert"><b>Error.</b> ${esc(s.error)}</div>` : ""}
    ${s.busy ? `<p><em>${esc(s.busy)}</em></p>` : ""}`;
  const list = `
    <h3>Proyectos · ${s.list.length}</h3>
    ${s.list.map((p) => `<div class="src-row"><span><button class="chip" data-open-project="${esc(p.id)}" ${cur?.id === p.id ? 'style="border-color:var(--accent);color:var(--ink)"' : ""}>${esc(p.name)}</button></span><span class="st">v${p.version} · ${p.sources.length} fuentes</span><span class="meta">${esc(p.purpose || "")}${p.owner ? " · " + esc(p.owner) : ""}</span></div>`).join("") || "<p>Aún no hay proyectos.</p>"}
    <h3>Crear proyecto</h3>
    <div class="pick">
      <input id="np-name" placeholder="Nombre del proyecto (p. ej. Registro oncológico 2026)" autocomplete="off">
      <input id="np-purpose" placeholder="Propósito (opcional)" autocomplete="off">
      <input id="np-owner" placeholder="Responsable (opcional)" autocomplete="off">
      <div><button class="btn-primary" id="np-create">Crear proyecto</button></div>
    </div>`;
  const current = cur ? `
    <h3>Fuentes de «${esc(cur.name)}» · ${cur.sources.length}</h3>
    <p>Sube documentos: docx (diccionario), csv, tsv, xlsx (tabla), sql (esquema de base de datos, solo metadatos), md, txt, json. Cada archivo pasa por la guardia de datos personales; con hallazgos queda pendiente hasta tu confirmación, que se registra con tu nombre.</p>
    <label class="drop" id="p-drop"><input type="file" id="p-file-input" multiple accept=".docx,.csv,.tsv,.xlsx,.sql,.ddl,.md,.txt,.json">Suelta archivos o haz clic para elegirlos</label>
    ${cur.sources.map((x) => sourceRow(x, cur.id)).join("") || "<p>Sin fuentes todavía.</p>"}
    <div style="margin:.8rem 0;display:flex;gap:.35rem;flex-wrap:wrap">
      <button class="btn-primary" id="p-build" ${cur.sources.some((x) => x.status === "published") ? "" : "disabled"}>Publicar versión ${cur.version + 1} (consolidar y proponer relaciones)</button>
      ${cur.version > 0 ? `<button class="btn" id="p-open-graph">Ver grafo de la versión ${cur.version}</button>` : ""}
      <button class="btn" id="p-audit">Auditoría</button>
      <button class="btn" id="p-delete" title="Marca el proyecto como eliminado; queda en auditoría">Eliminar proyecto</button>
    </div>
    <div id="p-audit-box"></div>
    ${cur.version > 0 && app.agf.project.id === cur.id ? `<hr style="border:0;border-top:1px solid var(--line);margin:1rem 0">${renderInventario(app)}` : cur.version > 0 ? `<p>Abre el grafo para ver el inventario de la versión ${cur.version}.</p>` : ""}` : "";
  return head + cfgBox + list + current;
}

export function afterProyectos(app: App) {
  const body = app.body, s = projectsState;
  body.querySelector("#api-save")?.addEventListener("click", () => {
    const url = (body.querySelector("#api-url") as HTMLInputElement).value.trim();
    const token = (body.querySelector("#api-token") as HTMLInputElement).value.trim();
    const actor = (body.querySelector("#api-actor") as HTMLInputElement).value.trim();
    if (!url) { app.toast("Indica la URL del backend."); return; }
    s.cfg = { url, token, actor }; saveApiConfig(s.cfg); s.api = null; s.showConfig = false;
    void refreshProjects(app);
  });
  body.querySelector("#api-forget")?.addEventListener("click", () => { s.cfg = null; s.api = null; s.list = []; s.current = null; saveApiConfig(null); app.renderTab(); });
  body.querySelector("#np-create")?.addEventListener("click", async () => {
    const api = apiClient()!; const name = (body.querySelector("#np-name") as HTMLInputElement).value.trim();
    if (name.length < 2) { app.toast("El nombre necesita al menos 2 caracteres."); return; }
    try {
      const p = await api.createProject(name, (body.querySelector("#np-purpose") as HTMLInputElement).value.trim() || undefined, (body.querySelector("#np-owner") as HTMLInputElement).value.trim() || undefined);
      s.current = p; await refreshProjects(app); app.toast(`Proyecto «${p.name}» creado. Sube sus fuentes.`);
    } catch (e) { s.error = (e as Error).message; app.renderTab(); }
  });
  body.querySelectorAll<HTMLElement>("[data-open-project]").forEach((b) => b.addEventListener("click", () => void openProject(app, b.dataset.openProject!)));
  const drop = body.querySelector<HTMLElement>("#p-drop"), input = body.querySelector<HTMLInputElement>("#p-file-input");
  const upload = async (files: File[]) => {
    const api = apiClient()!, cur = s.current!; if (!files.length) return;
    s.busy = `Subiendo ${files.length} archivo(s)…`; app.renderTab();
    try { await api.upload(cur.id, files); s.error = ""; } catch (e) { s.error = (e as Error).message; }
    s.busy = ""; s.current = await api.project(cur.id).catch(() => cur); await refreshProjects(app);
  };
  if (drop && input) {
    input.addEventListener("change", () => { if (input.files) void upload(Array.from(input.files)); });
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer?.files) void upload(Array.from(e.dataTransfer.files)); });
  }
  body.querySelectorAll<HTMLElement>("[data-confirm-src]").forEach((b) => b.addEventListener("click", async () => {
    const api = apiClient()!; try { await api.confirm(b.dataset.pid!, b.dataset.confirmSrc!); } catch (e) { s.error = (e as Error).message; }
    s.current = await api.project(b.dataset.pid!); app.renderTab();
  }));
  body.querySelectorAll<HTMLElement>("[data-discard-src]").forEach((b) => b.addEventListener("click", async () => {
    const api = apiClient()!; try { await api.discard(b.dataset.pid!, b.dataset.discardSrc!); } catch (e) { s.error = (e as Error).message; }
    s.current = await api.project(b.dataset.pid!); app.renderTab();
  }));
  body.querySelector("#p-build")?.addEventListener("click", async () => {
    const api = apiClient()!, cur = s.current!;
    s.busy = "Consolidando fuentes y proponiendo relaciones…"; app.renderTab();
    try { const r = await api.build(cur.id); app.toast(`Versión ${r.version} publicada.`); s.error = ""; } catch (e) { s.error = (e as Error).message; }
    s.busy = ""; await openProject(app, cur.id);
  });
  body.querySelector("#p-open-graph")?.addEventListener("click", () => void openProject(app, s.current!.id));
  body.querySelector("#p-delete")?.addEventListener("click", async () => {
    const api = apiClient()!, cur = s.current!;
    if (!confirm(`¿Eliminar el proyecto «${cur.name}»? Queda registrado en auditoría.`)) return;
    try { await api.deleteProject(cur.id); s.current = null; await refreshProjects(app); } catch (e) { s.error = (e as Error).message; app.renderTab(); }
  });
  body.querySelector("#p-audit")?.addEventListener("click", async () => {
    const api = apiClient()!, box = body.querySelector("#p-audit-box")!;
    try {
      const rows = await api.audit(s.current!.id);
      box.innerHTML = `<h3>Auditoría · ${rows.length}</h3>` + rows.map((r) => `<div class="src-row"><span>${esc(r.action)}</span><span class="st">${esc((r.at || "").slice(0, 19).replace("T", " "))}</span><span class="meta">${esc(r.actor || "")} · ${esc(JSON.stringify(r.detail)).slice(0, 160)}</span></div>`).join("");
    } catch (e) { box.innerHTML = `<div class="alert">${esc((e as Error).message)}</div>`; }
  });
}
