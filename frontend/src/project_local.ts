/** Proyectos locales: agregar fuentes (con guardia), activar o quitar fuentes y reconstruir el grafo consolidado.
 *  Todo ocurre en el navegador; el proyecto se guarda en IndexedDB y, si se enlazó, en una carpeta del equipo. */
import type { App } from "./app";
import { ingestFile } from "./adapters";
import { mergeIntoProject, proposeRelations } from "./project";
import { getProject, newProject, putFile, saveProject, sha256Hex, writeToFolder, type Review, type StoredProject, type StoredSource } from "./store";
import type { Agf } from "./types";

export const local = { project: null as StoredProject | null, busy: "" as string, error: "" as string };

export function currentProject() { return local.project; }

export async function createLocalProject(app: App, name: string, purpose?: string, owner?: string): Promise<StoredProject> {
  const p = newProject(name, purpose, owner);
  await saveProject(p);
  local.project = p;
  await rebuild(app);
  return p;
}

export async function openLocalProject(app: App, id: string): Promise<StoredProject | null> {
  const p = await getProject(id);
  if (!p) return null;
  local.project = p;
  await rebuild(app);
  return p;
}

/** Agrega archivos al proyecto actual. Con hallazgos de la guardia, la fuente queda pendiente hasta confirmar. */
export async function addFiles(app: App, files: File[]): Promise<StoredSource[]> {
  const p = local.project; if (!p) throw new Error("No hay un proyecto abierto.");
  const out: StoredSource[] = [];
  for (const f of files) {
    const buf = await f.arrayBuffer();
    const sha = await sha256Hex(buf);
    const existing = p.sources.find((s) => s.sha256 === sha);
    if (existing) { out.push(existing); continue; }
    await putFile(sha, buf);
    const src: StoredSource = { id: "src_" + sha.slice(0, 12), filename: f.name, sha256: sha, size: f.size, ext: (f.name.split(".").pop() || "").toLowerCase(), active: true, status: "publicado", guard_hits: {}, guard_confirmed_by: null, agf: null, added_at: new Date().toISOString() };
    try {
      const r = await ingestFile(new File([buf], f.name, { type: f.type }));
      const hits = r.agf.sources[0].personal_data_guard?.hits || {};
      src.guard_hits = hits; src.adapter = r.adapter; src.source_type = r.agf.sources[0].facets?.source_type || undefined;
      src.detail = `${r.adapter}: ${r.summary.sections} secciones, ${r.summary.elements} elementos, ${r.summary.unparsed} sin clasificar, ${r.agf.findings?.length || 0} hallazgos`;
      if (Object.values(hits).some(Boolean)) { src.status = "pendiente de confirmación"; src.active = false; src.agf = null; }
      else src.agf = r.agf;
    } catch (e) { src.status = "error"; src.active = false; src.detail = String((e as Error).message || e); }
    p.sources.push(src); out.push(src);
  }
  await saveProject(p);
  await rebuild(app);
  return out;
}

/** Confirmación explícita de que el archivo no contiene datos de pacientes (queda registrada con el nombre). */
export async function confirmSource(app: App, sid: string, actor: string) {
  const p = local.project!; const s = p.sources.find((x) => x.id === sid); if (!s) return;
  const buf = await (await import("./store")).getFile(s.sha256); if (!buf) { s.status = "error"; s.detail = "archivo no disponible"; await saveProject(p); return; }
  const r = await ingestFile(new File([buf], s.filename));
  r.agf.sources[0].personal_data_guard = { hits: s.guard_hits, confirmed_by_user: true };
  s.agf = r.agf; s.status = "publicado"; s.active = true; s.guard_confirmed_by = actor || "usuario";
  s.detail = `${r.adapter}: ${r.summary.sections} secciones, ${r.summary.elements} elementos, ${r.summary.unparsed} sin clasificar, ${r.agf.findings?.length || 0} hallazgos`;
  await saveProject(p); await rebuild(app);
}

export async function setActive(app: App, sid: string, active: boolean) {
  const p = local.project!; const s = p.sources.find((x) => x.id === sid); if (!s || s.status !== "publicado") return;
  s.active = active; await saveProject(p); await rebuild(app);
}

export async function removeSource(app: App, sid: string) {
  const p = local.project!;
  p.sources = p.sources.filter((x) => x.id !== sid);
  await saveProject(p); await rebuild(app);
}

export async function recordReview(kind: "edge" | "node", key: string, decision: "validated" | "rejected", actor?: string) {
  const p = local.project; if (!p) return;
  p.reviews = p.reviews.filter((r) => !(r.kind === kind && r.id === key));
  p.reviews.push({ kind, id: key, decision, actor, at: new Date().toISOString() });
  await saveProject(p);
}

export const edgeKey = (e: { kind: string; source: string; target: string }) => `${e.kind}|${e.source}|${e.target}`;

function applyReviews(agf: Agf, reviews: Review[]) {
  const byEdge = new Map(reviews.filter((r) => r.kind === "edge").map((r) => [r.id, r]));
  const byNode = new Map(reviews.filter((r) => r.kind === "node").map((r) => [r.id, r]));
  for (const e of agf.edges) { const r = byEdge.get(edgeKey(e)); if (r) { e.status = r.decision; (e as unknown as Record<string, unknown>).reviewed_by = r.actor || "usuario"; } }
  for (const n of agf.nodes) { const r = byNode.get(n.id); if (r) { n.status = r.decision; (n as unknown as Record<string, unknown>).reviewed_by = r.actor || "usuario"; } }
}

/** Reconstruye el grafo consolidado con las fuentes activas y lo carga en el visor. */
export async function rebuild(app: App): Promise<Agf | null> {
  const p = local.project; if (!p) return null;
  const active = p.sources.filter((s) => s.active && s.status === "publicado" && s.agf);
  let merged: Agf;
  if (!active.length) {
    merged = { agf_version: "1.0", project: { id: p.id, name: p.name }, profile: "default", sources: [], nodes: [{ id: "root", kind: "project_root", name: p.name, origin: "manual", status: "proposed", confidence: 1 }], edges: [], findings: [] };
  } else {
    merged = JSON.parse(JSON.stringify(active[0].agf)) as Agf;
    for (const s of active.slice(1)) merged = mergeIntoProject(merged, JSON.parse(JSON.stringify(s.agf)) as Agf);
    merged.project = { id: p.id, name: p.name };
    if (active.length > 1) await proposeRelations(merged);
    applyReviews(merged, p.reviews);
  }
  p.version = (p.version || 0) + 1;
  app.load(merged, app.pv.p, null);
  app.rebuildModel(true);
  await saveProject(p);
  await writeToFolder(p, merged).catch(() => false);
  return merged;
}
