/** Pestaña Fuentes: carga de documentos en el navegador (nada sale del equipo), guardia de datos personales,
 *  cola con estado por archivo, consolidación en el proyecto y descarga del AGF. */
import type { App } from "../app";
import { ingestFile, type IngestResult } from "../adapters";
import { esc } from "../lib/text";
import { mergeIntoProject, proposeRelations } from "../project";
import { downloadAgf } from "./relations";

interface QueueItem { name: string; size: number; status: "en cola" | "extrayendo" | "pendiente de confirmación" | "publicado" | "error"; detail?: string; result?: IngestResult; file: File }
export const queue: QueueItem[] = [];

/** Decisión M7 (N3): el módulo con carga de documentos no se expone en URLs públicas. En un despliegue público
 *  (VITE_PUBLIC_DEPLOY=true) la zona de carga se reemplaza por instrucciones para ejecutarlo en el equipo propio. */
export const PUBLIC_DEPLOY = import.meta.env.VITE_PUBLIC_DEPLOY === "true";

export function renderFuentes(app: App): string {
  const srcs = app.agf.sources;
  if (PUBLIC_DEPLOY) return `
    <div class="eyebrow">Fuentes · ${srcs.length}</div>
    <h2>Documentos del proyecto</h2>
    <div class="alert"><b>Carga desactivada en esta versión pública.</b> Por política del proyecto (decisión M7), la carga de documentos solo se habilita en una instalación local o institucional con autenticación. Esta URL muestra las muestras publicadas.</div>
    <p>Para cargar tus propios documentos: clona el repositorio, ejecuta <code>npm run dev</code> en <code>frontend/</code> y usa la pestaña Fuentes; o genera un AGF con <code>atlas ingest</code> y ábrelo con <code>?agf=</code>.</p>
    <h3>Fuentes cargadas · ${srcs.length}</h3>
    ${srcs.map((s) => `<div class="src-row"><span><button class="chip" data-id="${esc(s.id)}">${esc(s.title || s.name)}</button></span><span class="st">${esc(app.pv.valueLabel("source_type", s.facets?.source_type))}</span><span class="meta">${esc(s.adapter || "")} · ${app.agf.nodes.filter((n) => n.kind === "element" && n.source_id === s.id).length} elementos</span></div>`).join("")}
    <div style="margin-top:.8rem"><button class="btn" id="download-agf">Descargar AGF del proyecto</button></div>`;
  return `
    <div class="eyebrow">Fuentes · ${srcs.length}</div>
    <h2>Documentos del proyecto</h2>
    <p>Arrastra archivos aquí. Se procesan en este navegador: <b>ningún dato sale del equipo</b>. Formatos: docx (diccionario), csv, tsv, xlsx (tabla), sql (esquema), md, txt, json y AGF (.agf.json).</p>
    <label class="drop" id="drop"><input type="file" id="file-input" multiple accept=".docx,.csv,.tsv,.xlsx,.sql,.ddl,.md,.txt,.json">Suelta archivos o haz clic para elegirlos</label>
    <div class="alert" style="border-color:var(--line)"><b style="color:var(--ink)">Guardia de datos personales.</b> Si un archivo parece contener RUT, correos, teléfonos o nombres con fechas, se detiene y pide confirmación. Con IA apagada (predeterminado) no se llama a ningún servicio.</div>
    ${queue.length ? `<h3>Cola</h3>${queue.map((q, i) => `<div class="src-row"><span>${esc(q.name)}</span><span class="st">${esc(q.status)}</span><span class="meta">${esc(q.detail || "")}</span>${q.status === "pendiente de confirmación" ? `<div style="grid-column:1/3;display:flex;gap:.35rem;flex-wrap:wrap"><button class="btn" data-confirm="${i}">Confirmo que no contiene datos de pacientes: continuar</button><button class="btn" data-discard="${i}">Descartar</button></div>` : ""}</div>`).join("")}` : ""}
    <h3>Fuentes cargadas · ${srcs.length}</h3>
    ${srcs.map((s) => `<div class="src-row"><span><button class="chip" data-id="${esc(s.id)}">${esc(s.title || s.name)}</button></span><span class="st">${esc(app.pv.valueLabel("source_type", s.facets?.source_type))}</span><span class="meta">${esc(s.adapter || "")} · ${app.agf.nodes.filter((n) => n.kind === "element" && n.source_id === s.id).length} elementos · ${s.unparsed_count ?? 0} sin clasificar${s.sha256 ? " · sha256 " + esc(s.sha256.slice(0, 12)) : ""}</span></div>`).join("")}
    <div style="margin-top:.8rem;display:flex;gap:.35rem;flex-wrap:wrap"><button class="btn" id="download-agf">Descargar AGF del proyecto</button><button class="btn" id="relate-now">Recalcular equivalencias</button></div>
    <p style="font-size:.74rem">El AGF descargado se puede abrir con <code>?agf=</code> en la URL, validar con <code>atlas validate</code> y exportar a memoria con <code>atlas export-memory</code>.</p>`;
}

export function afterFuentes(app: App) {
  const body = app.body, drop = body.querySelector<HTMLElement>("#drop"), input = body.querySelector<HTMLInputElement>("#file-input");
  body.querySelector("#download-agf")?.addEventListener("click", () => downloadAgf(app));
  if (!drop || !input) return;
  const add = (files: FileList | File[]) => { for (const f of Array.from(files)) queue.push({ name: f.name, size: f.size, status: "en cola", file: f }); app.renderTab(); void process(app); };
  input.addEventListener("change", () => { if (input.files) add(input.files); });
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer?.files) add(e.dataTransfer.files); });
  body.querySelector("#relate-now")?.addEventListener("click", async () => {
    const n = await proposeRelations(app.agf);
    app.toast(`${n} relaciones nuevas propuestas.`); app.rebuildModel(false); app.renderTab();
  });
  body.addEventListener("click", (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>("[data-confirm]");
    if (c) { const q = queue[+c.dataset.confirm!]; if (q?.result) { q.result.agf.sources[0].personal_data_guard!.confirmed_by_user = true; void publish(app, q); } return; }
    const d = (e.target as HTMLElement).closest<HTMLElement>("[data-discard]");
    if (d) { queue.splice(+d.dataset.discard!, 1); app.renderTab(); }
  });
}

async function process(app: App) {
  for (const q of queue) {
    if (q.status !== "en cola") continue;
    q.status = "extrayendo"; app.renderTab();
    try {
      q.result = await ingestFile(q.file);
      const guard = q.result.agf.sources[0].personal_data_guard;
      if (guard && Object.values(guard.hits).some(Boolean) && !guard.confirmed_by_user) {
        q.status = "pendiente de confirmación";
        q.detail = "Posibles datos personales: " + Object.entries(guard.hits).filter(([, v]) => v).map(([k, v]) => `${k} ×${v}`).join(", ") + ". La IA queda bloqueada para este archivo.";
        app.renderTab(); continue;
      }
      await publish(app, q);
    } catch (err) {
      q.status = "error"; q.detail = String((err as Error).message || err); app.renderTab();
    }
  }
}

async function publish(app: App, q: QueueItem) {
  const r = q.result!;
  const s = r.summary;
  q.detail = `${r.agf.sources[0].adapter}: ${s.sections} secciones, ${s.elements} elementos, ${s.unparsed} sin clasificar, ${r.agf.findings?.length || 0} hallazgos`;
  if (app.agf.sources.length === 0 || (app.agf.sources.length === 1 && app.agf.project.id === r.agf.project.id)) app.load(r.agf, app.pv.p, null);
  else {
    const merged = mergeIntoProject(app.agf, r.agf);
    app.load(merged, app.pv.p, null);
    await proposeRelations(app.agf);
    app.rebuildModel(true);
  }
  q.status = "publicado";
  app.tab = "fuentes"; app.renderTab();
  app.toast(`${q.name} publicado como propuesta. Revisa las equivalencias en Relaciones.`);
}
