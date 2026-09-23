/** Pestaña Proyectos, pensada para personas no técnicas: proyectos guardados en este equipo (sin URL ni token),
 *  carpeta segura elegida por la persona (puede ser una carpeta de Google Drive, OneDrive o un repositorio),
 *  paquete descargable y, debajo, el inventario del proyecto abierto.
 *  El modo institucional con backend sigue disponible solo con `?api=` en la URL (ver projects_api.ts). */
import type { App } from "../app";
import { esc } from "../lib/text";
import { createLocalProject, local, openLocalProject } from "../project_local";
import { deleteProject, exportZip, folderApiAvailable, importZip, linkFolder, listProjects, openFolder, storageAvailable, unlinkFolder, type StoredProject } from "../store";
import { renderInventario } from "./inventory";
import { afterProyectos as afterApi, projectsState as apiState, renderProyectos as renderApi } from "./projects_api";

const apiMode = () => !!apiState.cfg?.url && new URLSearchParams(location.search).has("api");
let cache: StoredProject[] = [];

export async function refreshLocal(app: App) {
  cache = await listProjects().catch(() => []);
  if (app.tab === "proyectos") app.renderTab();
}

export function renderProyectos(app: App): string {
  if (apiMode()) return renderApi(app);
  const p = local.project;
  const head = `
    <div class="eyebrow">Proyectos · guardados en este equipo</div>
    <h2>${p ? esc(p.name) : "Tus proyectos"}</h2>
    ${local.error ? `<div class="alert"><b>Atención.</b> ${esc(local.error)}</div>` : ""}
    ${local.busy ? `<p><em>${esc(local.busy)}</em></p>` : ""}
    ${!storageAvailable ? `<div class="alert"><b>Este navegador no permite guardar proyectos.</b> Usa Chrome, Edge o Firefox actualizados.</div>` : ""}`;
  const list = `
    <h3>Proyectos · ${cache.length}</h3>
    ${cache.map((x) => `<div class="src-row"><span><button class="chip" data-open-local="${esc(x.id)}" ${p?.id === x.id ? 'style="border-color:var(--accent);color:var(--ink)"' : ""}>${esc(x.name)}</button></span><span class="st">${x.sources.length} archivo${x.sources.length === 1 ? "" : "s"}${x.folder_name ? " · carpeta" : ""}</span><span class="meta">${esc(x.purpose || "")}${x.owner ? " · " + esc(x.owner) : ""} · actualizado ${esc((x.updated_at || "").slice(0, 10))}</span></div>`).join("") || "<p>Aún no hay proyectos. Crea uno o abre un paquete.</p>"}
    <h3>Nuevo proyecto</h3>
    <div class="pick">
      <input id="lp-name" placeholder="Nombre (p. ej. Registro oncológico 2026)" autocomplete="off">
      <input id="lp-purpose" placeholder="Para qué es (opcional)" autocomplete="off">
      <input id="lp-owner" placeholder="Responsable (opcional)" autocomplete="off">
      <div style="display:flex;gap:.35rem;flex-wrap:wrap"><button class="btn-primary" id="lp-create">Crear proyecto</button><label class="btn" style="cursor:pointer">Abrir paquete .zip<input type="file" id="lp-import" accept=".zip" style="display:none"></label>${folderApiAvailable ? `<button class="btn" id="lp-open-folder">Abrir carpeta de un proyecto</button>` : ""}</div>
    </div>`;
  const current = p ? `
    <h3>Dónde se guarda «${esc(p.name)}»</h3>
    <p>Siempre queda una copia en este navegador. Para conservarlo en un espacio seguro, enlaza una carpeta de tu equipo: si esa carpeta está dentro de <b>Google Drive</b>, <b>OneDrive</b> o de un <b>repositorio</b>, la copia se sincroniza sola. Los documentos nunca se envían a ningún servidor.</p>
    <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin:.4rem 0 .8rem">
      ${folderApiAvailable ? (p.folder_name ? `<span class="chip" style="border-color:var(--accent);color:var(--ink)">Carpeta enlazada: ${esc(p.folder_name)}</span><button class="btn" id="lp-unlink">Dejar de usar la carpeta</button>` : `<button class="btn-primary" id="lp-link">Elegir carpeta en este equipo</button>`) : `<span class="conf">Este navegador no permite enlazar carpetas (usa Chrome o Edge). Puedes descargar el paquete.</span>`}
      <button class="btn" id="lp-export">Descargar paquete .zip</button>
      <button class="btn" id="lp-delete" title="Quita el proyecto de este navegador; la carpeta enlazada no se borra">Quitar de este navegador</button>
    </div>
    <p style="font-size:.76rem">Archivos: ${p.sources.length} (${p.sources.filter((s) => s.active).length} activos). Gestiona los archivos en la pestaña <button class="chip" data-go="fuentes">Fuentes</button>.</p>
    ${p.sources.some((s) => s.active && s.status === "publicado") ? `<hr style="border:0;border-top:1px solid var(--line);margin:1rem 0">${renderInventario(app)}` : `<p>Sube archivos en Fuentes para ver el inventario.</p>`}` : (app.agf.sources.length ? `<hr style="border:0;border-top:1px solid var(--line);margin:1rem 0"><p style="font-size:.76rem">Estás viendo una muestra. Crea un proyecto para trabajar con tus propios documentos.</p>${renderInventario(app)}` : "");
  return head + list + current;
}

export function afterProyectos(app: App) {
  if (apiMode()) return afterApi(app);
  const body = app.body;
  const run = async (label: string, fn: () => Promise<void>) => {
    local.busy = label; local.error = ""; app.renderTab();
    try { await fn(); } catch (e) { const msg = String((e as Error).message || e); if (!/abort/i.test(msg)) local.error = msg; }
    local.busy = ""; await refreshLocal(app); app.renderTab();
  };
  body.querySelector("#lp-create")?.addEventListener("click", () => {
    const name = (body.querySelector("#lp-name") as HTMLInputElement).value.trim();
    if (name.length < 2) { app.toast("Escribe un nombre de al menos 2 caracteres."); return; }
    void run("Creando proyecto…", async () => { await createLocalProject(app, name, (body.querySelector("#lp-purpose") as HTMLInputElement).value.trim() || undefined, (body.querySelector("#lp-owner") as HTMLInputElement).value.trim() || undefined); app.toast(`Proyecto «${name}» creado. Ahora sube sus archivos en Fuentes.`); });
  });
  body.querySelectorAll<HTMLElement>("[data-open-local]").forEach((b) => b.addEventListener("click", () => void run("Abriendo proyecto…", async () => { await openLocalProject(app, b.dataset.openLocal!); })));
  body.querySelector<HTMLInputElement>("#lp-import")?.addEventListener("change", (e) => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    void run("Abriendo paquete…", async () => { const p = await importZip(f); await openLocalProject(app, p.id); app.toast(`Paquete «${p.name}» abierto.`); });
  });
  body.querySelector("#lp-open-folder")?.addEventListener("click", () => void run("Abriendo carpeta…", async () => { const p = await openFolder(); await openLocalProject(app, p.id); app.toast(`Proyecto «${p.name}» abierto desde la carpeta ${p.folder_name}.`); }));
  body.querySelector("#lp-link")?.addEventListener("click", () => void run("Enlazando carpeta…", async () => { const name = await linkFolder(local.project!); app.toast(`Carpeta «${name}» enlazada. El proyecto se guardará ahí.`); }));
  body.querySelector("#lp-unlink")?.addEventListener("click", () => void run("Desenlazando…", async () => { await unlinkFolder(local.project!); }));
  body.querySelector("#lp-export")?.addEventListener("click", () => void run("Preparando paquete…", async () => {
    const blob = await exportZip(local.project!, app.agf);
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${local.project!.name.replace(/[^\w.-]+/g, "_")}.atlas.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }));
  body.querySelector("#lp-delete")?.addEventListener("click", () => {
    const p = local.project!;
    if (!confirm(`¿Quitar «${p.name}» de este navegador? La carpeta enlazada y los paquetes descargados no se borran.`)) return;
    void run("Quitando…", async () => { await deleteProject(p.id); local.project = null; });
  });
}
