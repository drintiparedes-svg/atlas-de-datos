/** Almacenamiento local de proyectos para personas no técnicas: sin servidores, sin URL ni token.
 *
 *  - Registro de proyectos en IndexedDB (nombre, propósito, fuentes con su AGF y decisiones de revisión).
 *  - Carpeta en el equipo (File System Access API, Chrome y Edge): el proyecto se escribe como archivos
 *    (`proyecto.atlas.json`, `fuentes/`, `proyecto.agf.json`). Si la carpeta está dentro de Google Drive,
 *    OneDrive o un repositorio, la sincronización la hace esa herramienta.
 *  - Paquete .zip descargable y reabrible en cualquier navegador (respaldo, envío, otro equipo).
 *  Los archivos originales se conservan por sha256; nunca se envían a ningún servicio. */
import JSZip from "jszip";
import type { Agf } from "./types";

export interface StoredSource {
  id: string; filename: string; sha256: string; size: number; ext: string;
  active: boolean; status: "publicado" | "pendiente de confirmación" | "error" | "bloqueado";
  adapter?: string; source_type?: string; detail?: string;
  guard_hits: Record<string, number>; guard_confirmed_by?: string | null;
  agf?: Agf | null; added_at: string;
}
export interface Review { kind: "edge" | "node"; id: string; decision: "validated" | "rejected"; actor?: string; at: string; note?: string }
export interface StoredProject {
  id: string; name: string; purpose?: string; owner?: string; created_at: string; updated_at: string;
  sources: StoredSource[]; reviews: Review[]; folder_name?: string | null; version: number;
}

const DB_NAME = "atlas-de-datos", DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");      // sha256 → ArrayBuffer
      if (!db.objectStoreNames.contains("handles")) db.createObjectStore("handles");  // projectId → FileSystemDirectoryHandle
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | IDBRequest): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode), r = fn(t.objectStore(store));
    r.onsuccess = () => resolve(r.result as T); r.onerror = () => reject(r.error);
  }));
}

export const storageAvailable = typeof indexedDB !== "undefined";
export const folderApiAvailable = typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";

export async function listProjects(): Promise<StoredProject[]> {
  if (!storageAvailable) return [];
  const all = await tx<StoredProject[]>("projects", "readonly", (s) => s.getAll());
  return all.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
}
export async function getProject(id: string): Promise<StoredProject | undefined> { return tx("projects", "readonly", (s) => s.get(id)); }
export async function saveProject(p: StoredProject): Promise<void> {
  p.updated_at = new Date().toISOString();
  await tx("projects", "readwrite", (s) => s.put(p));
  await writeToFolder(p).catch(() => { /* sin carpeta enlazada o permiso denegado: queda en el navegador */ });
}
export async function deleteProject(id: string): Promise<void> {
  await tx("projects", "readwrite", (s) => s.delete(id));
  await tx("handles", "readwrite", (s) => s.delete(id)).catch(() => undefined);
}
export async function putFile(sha: string, buf: ArrayBuffer): Promise<void> { await tx("files", "readwrite", (s) => s.put(buf, sha)); }
export async function getFile(sha: string): Promise<ArrayBuffer | undefined> { return tx("files", "readonly", (s) => s.get(sha)); }

export function newProject(name: string, purpose?: string, owner?: string): StoredProject {
  const now = new Date().toISOString();
  const slug = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "proyecto";
  return { id: `prj_${slug}-${Math.random().toString(36).slice(2, 6)}`, name: name.trim(), purpose, owner, created_at: now, updated_at: now, sources: [], reviews: [], folder_name: null, version: 0 };
}

/* ── carpeta en el equipo (File System Access API) ─────────────────────── */
type DirHandle = FileSystemDirectoryHandle & { queryPermission?: (o: { mode: string }) => Promise<string>; requestPermission?: (o: { mode: string }) => Promise<string> };

export async function linkFolder(p: StoredProject): Promise<string> {
  const picker = (window as unknown as { showDirectoryPicker: (o: { mode: string; id?: string }) => Promise<DirHandle> }).showDirectoryPicker;
  const handle = await picker({ mode: "readwrite", id: "atlas-" + p.id });
  await tx("handles", "readwrite", (s) => s.put(handle, p.id));
  p.folder_name = handle.name;
  await saveProject(p);
  return handle.name;
}
export async function unlinkFolder(p: StoredProject): Promise<void> {
  await tx("handles", "readwrite", (s) => s.delete(p.id)).catch(() => undefined);
  p.folder_name = null; await saveProject(p);
}
async function folderHandle(id: string, requestIfNeeded = true): Promise<DirHandle | null> {
  const h = await tx<DirHandle | undefined>("handles", "readonly", (s) => s.get(id)).catch(() => undefined);
  if (!h) return null;
  if (h.queryPermission) {
    let st = await h.queryPermission({ mode: "readwrite" });
    if (st !== "granted" && requestIfNeeded && h.requestPermission) st = await h.requestPermission({ mode: "readwrite" });
    if (st !== "granted") return null;
  }
  return h;
}
async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: Blob | string) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable(); await w.write(data); await w.close();
}
/** Escribe el proyecto completo en la carpeta enlazada: manifiesto, fuentes originales, AGF por fuente y consolidado. */
export async function writeToFolder(p: StoredProject, merged?: Agf | null): Promise<boolean> {
  const dir = await folderHandle(p.id, false);
  if (!dir) return false;
  const manifest = { ...p, sources: p.sources.map((s) => ({ ...s, agf: undefined })) };
  await writeFile(dir, "proyecto.atlas.json", JSON.stringify(manifest, null, 1));
  const fuentes = await dir.getDirectoryHandle("fuentes", { create: true });
  const agfDir = await dir.getDirectoryHandle("agf", { create: true });
  for (const s of p.sources) {
    const buf = await getFile(s.sha256);
    if (buf) await writeFile(fuentes, `${s.sha256.slice(0, 12)}_${s.filename}`, new Blob([buf]));
    if (s.agf) await writeFile(agfDir, `${s.sha256.slice(0, 12)}.agf.json`, JSON.stringify(s.agf));
  }
  if (merged) await writeFile(dir, "proyecto.agf.json", JSON.stringify(merged, null, 1));
  await writeFile(dir, "LEEME.txt", `Proyecto del Atlas de Datos: ${p.name}\nEsta carpeta la mantiene el Atlas. Puede estar dentro de Google Drive, OneDrive o un repositorio para conservar una copia segura.\nArchivos: proyecto.atlas.json (manifiesto), fuentes/ (documentos originales), agf/ (grafo por fuente), proyecto.agf.json (grafo consolidado).\nPara reabrirlo en otro equipo: Atlas › Proyectos › Abrir paquete o carpeta.\n`);
  return true;
}
/** Reabre un proyecto desde una carpeta (manifiesto + fuentes). */
export async function openFolder(): Promise<StoredProject> {
  const picker = (window as unknown as { showDirectoryPicker: (o: { mode: string }) => Promise<DirHandle> }).showDirectoryPicker;
  const dir = await picker({ mode: "readwrite" });
  const mf = await (await (await dir.getFileHandle("proyecto.atlas.json")).getFile()).text();
  const p = JSON.parse(mf) as StoredProject;
  const fuentes = await dir.getDirectoryHandle("fuentes").catch(() => null);
  const agfDir = await dir.getDirectoryHandle("agf").catch(() => null);
  for (const s of p.sources) {
    if (fuentes) { try { const f = await (await fuentes.getFileHandle(`${s.sha256.slice(0, 12)}_${s.filename}`)).getFile(); await putFile(s.sha256, await f.arrayBuffer()); } catch { /* fuente ausente */ } }
    if (agfDir) { try { s.agf = JSON.parse(await (await (await agfDir.getFileHandle(`${s.sha256.slice(0, 12)}.agf.json`)).getFile()).text()); } catch { s.agf = null; } }
  }
  p.folder_name = dir.name;
  await tx("handles", "readwrite", (s) => s.put(dir, p.id));
  await tx("projects", "readwrite", (s) => s.put(p));
  return p;
}

/* ── paquete .zip ───────────────────────────────────────────────────────── */
export async function exportZip(p: StoredProject, merged?: Agf | null): Promise<Blob> {
  const zip = new JSZip();
  zip.file("proyecto.atlas.json", JSON.stringify({ ...p, sources: p.sources.map((s) => ({ ...s, agf: undefined })) }, null, 1));
  for (const s of p.sources) {
    const buf = await getFile(s.sha256);
    if (buf) zip.file(`fuentes/${s.sha256.slice(0, 12)}_${s.filename}`, buf);
    if (s.agf) zip.file(`agf/${s.sha256.slice(0, 12)}.agf.json`, JSON.stringify(s.agf));
  }
  if (merged) zip.file("proyecto.agf.json", JSON.stringify(merged, null, 1));
  return zip.generateAsync({ type: "blob" });
}
export async function importZip(file: File): Promise<StoredProject> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const mf = zip.file("proyecto.atlas.json"); if (!mf) throw new Error("El zip no contiene proyecto.atlas.json");
  const p = JSON.parse(await mf.async("string")) as StoredProject;
  for (const s of p.sources) {
    const f = zip.file(`fuentes/${s.sha256.slice(0, 12)}_${s.filename}`);
    if (f) await putFile(s.sha256, await f.async("arraybuffer"));
    const a = zip.file(`agf/${s.sha256.slice(0, 12)}.agf.json`);
    s.agf = a ? JSON.parse(await a.async("string")) : null;
  }
  p.folder_name = null;
  await tx("projects", "readwrite", (s) => s.put(p));
  return p;
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
