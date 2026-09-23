/** Pestaña Fuentes: subir uno o varios archivos al proyecto abierto, activarlos o desactivarlos y quitarlos.
 *  Todo se procesa en este navegador (nada sale del equipo); la guardia de datos personales detiene
 *  los archivos sospechosos hasta confirmación explícita. */
import type { App } from "../app";
import { esc } from "../lib/text";
import { addFiles, confirmSource, local, removeSource, setActive } from "../project_local";
import { downloadAgf } from "./relations";

/** Decisión M7 (N3): en la URL pública (VITE_PUBLIC_DEPLOY=true) la carga de documentos queda desactivada. */
export const PUBLIC_DEPLOY = import.meta.env.VITE_PUBLIC_DEPLOY === "true";
export const ACCEPT = ".docx,.csv,.tsv,.xlsx,.sql,.ddl,.md,.txt,.json";

export function renderFuentes(app: App): string {
  const p = local.project;
  if (PUBLIC_DEPLOY) return `
    <div class="eyebrow">Fuentes</div>
    <h2>Archivos del proyecto</h2>
    <div class="alert"><b>Carga desactivada en esta versión pública.</b> Por política del proyecto (decisión M7), la carga de documentos solo se habilita en una instalación local o institucional. Esta URL muestra las muestras publicadas.</div>
    <h3>Fuentes de la muestra · ${app.agf.sources.length}</h3>
    ${app.agf.sources.map((s) => `<div class="src-row"><span><button class="chip" data-id="${esc(s.id)}">${esc(s.title || s.name)}</button></span><span class="st">${esc(app.pv.valueLabel("source_type", s.facets?.source_type))}</span><span class="meta">${app.agf.nodes.filter((n) => n.kind === "element" && n.source_id === s.id).length} elementos</span></div>`).join("")}
    <div style="margin-top:.8rem"><button class="btn" id="download-agf">Descargar grafo (AGF)</button></div>`;
  if (!p) return `
    <div class="eyebrow">Fuentes</div>
    <h2>Archivos del proyecto</h2>
    <p>Primero crea o abre un proyecto en la pestaña <button class="chip" data-go="proyectos">Proyectos</button>. Después podrás subir aquí uno o varios archivos y activarlos o quitarlos.</p>
    ${app.agf.sources.length ? `<h3>Fuentes de la muestra actual · ${app.agf.sources.length}</h3>${app.agf.sources.map((s) => `<div class="src-row"><span><button class="chip" data-id="${esc(s.id)}">${esc(s.title || s.name)}</button></span><span class="st">${esc(app.pv.valueLabel("source_type", s.facets?.source_type))}</span></div>`).join("")}` : ""}`;
  const active = p.sources.filter((s) => s.active && s.status === "publicado").length;
  return `
    <div class="eyebrow">Fuentes · ${esc(p.name)}</div>
    <h2>Archivos del proyecto</h2>
    <p>Sube uno o varios archivos: diccionarios en Word (docx), planillas (csv, tsv, xlsx), esquemas de base de datos (sql), notas (md, txt) o json. Se procesan en este equipo; <b>ningún dato sale del navegador</b>.</p>
    <label class="drop" id="drop"><input type="file" id="file-input" multiple accept="${ACCEPT}">Suelta archivos aquí o haz clic para elegir uno o varios</label>
    ${local.busy ? `<p><em>${esc(local.busy)}</em></p>` : ""}
    ${local.error ? `<div class="alert"><b>Atención.</b> ${esc(local.error)}</div>` : ""}
    <h3>Archivos · ${p.sources.length} <span class="conf">(${active} activos en el grafo)</span></h3>
    <p style="font-size:.76rem">Activa o desactiva cada archivo para incluirlo en el grafo; el grafo y las relaciones se recalculan solos. Quitar elimina el archivo del proyecto.</p>
    ${p.sources.map((s) => `<div class="src-row">
      <span><label class="row" style="padding:0;display:inline-flex"><input type="checkbox" data-active="${esc(s.id)}" ${s.active ? "checked" : ""} ${s.status !== "publicado" ? "disabled" : ""}> <b>${esc(s.filename)}</b></label></span>
      <span class="st">${esc(s.status)}</span>
      <span class="meta">${esc(s.detail || "")}${s.guard_confirmed_by ? ` · confirmado por ${esc(s.guard_confirmed_by)}` : ""} · ${(s.size / 1024).toFixed(0)} KB</span>
      <div style="grid-column:1/3;display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.2rem">
        ${s.status === "pendiente de confirmación" ? `<span class="conf">Posibles datos personales: ${esc(Object.entries(s.guard_hits).filter(([, v]) => v).map(([k, v]) => `${k} ×${v}`).join(", "))}</span><input class="pick-inline" data-actor-for="${esc(s.id)}" placeholder="Tu nombre" style="background:var(--surface-2);color:var(--ink);border:1px solid var(--line);border-radius:.45rem;padding:.15rem .4rem;font-size:.74rem"><button class="btn" data-confirm="${esc(s.id)}">Confirmo que no contiene datos de pacientes</button>` : ""}
        <button class="btn" data-remove="${esc(s.id)}">Quitar</button>
      </div></div>`).join("") || "<p>Aún no hay archivos.</p>"}
    <div style="margin-top:.8rem;display:flex;gap:.35rem;flex-wrap:wrap"><button class="btn" id="download-agf">Descargar grafo (AGF)</button><button class="chip" data-go="proyectos">Guardar en carpeta o descargar paquete</button></div>`;
}

export function afterFuentes(app: App) {
  const body = app.body;
  body.querySelector("#download-agf")?.addEventListener("click", () => downloadAgf(app));
  const drop = body.querySelector<HTMLElement>("#drop"), input = body.querySelector<HTMLInputElement>("#file-input");
  const run = async (label: string, fn: () => Promise<void>) => {
    local.busy = label; local.error = ""; app.tab = "fuentes"; app.renderTab();
    try { await fn(); } catch (e) { local.error = String((e as Error).message || e); }
    local.busy = ""; app.tab = "fuentes"; app.renderTab();
  };
  if (drop && input) {
    const add = (files: File[]) => { if (files.length) void run(`Procesando ${files.length} archivo(s)…`, async () => { const r = await addFiles(app, files); const pend = r.filter((s) => s.status === "pendiente de confirmación").length; app.toast(pend ? `${r.length} archivo(s) procesados; ${pend} requieren tu confirmación.` : `${r.length} archivo(s) agregados al grafo.`); }); };
    input.addEventListener("change", () => { if (input.files) add(Array.from(input.files)); });
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer?.files) add(Array.from(e.dataTransfer.files)); });
  }
  body.querySelectorAll<HTMLInputElement>("[data-active]").forEach((c) => c.addEventListener("change", () => void run(c.checked ? "Activando…" : "Desactivando…", async () => { await setActive(app, c.dataset.active!, c.checked); })));
  body.querySelectorAll<HTMLElement>("[data-remove]").forEach((b) => b.addEventListener("click", () => { if (confirm("¿Quitar este archivo del proyecto?")) void run("Quitando…", async () => { await removeSource(app, b.dataset.remove!); }); }));
  body.querySelectorAll<HTMLElement>("[data-confirm]").forEach((b) => b.addEventListener("click", () => {
    const actor = (body.querySelector<HTMLInputElement>(`[data-actor-for="${b.dataset.confirm}"]`)?.value || "").trim();
    if (!actor) { app.toast("Escribe tu nombre: la confirmación queda registrada."); return; }
    void run("Procesando archivo confirmado…", async () => { await confirmSource(app, b.dataset.confirm!, actor); });
  }));
}
