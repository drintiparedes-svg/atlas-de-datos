/** Cliente del backend de proyectos. Se activa cuando hay una URL configurada (parámetro ?api=, VITE_API_URL o
 *  localStorage «atlas.api»). Sin backend, el visor sigue funcionando en modo local (todo en el navegador). */
import type { Agf, AgfEdge, AgfNode, VectorIndex } from "./types";

export interface ApiSource { id: string; filename: string; sha256: string; size_bytes: number; adapter?: string; source_type?: string; status: string; detail?: string; guard_hits: Record<string, number>; guard_confirmed_by?: string; stats: Record<string, unknown>; created_at?: string }
export interface ApiProject { id: string; name: string; purpose?: string; owner?: string; status: string; created_at?: string; updated_at?: string; sources: ApiSource[]; version: number; stats: Record<string, unknown> }

export class AtlasApi {
  constructor(public base: string, public token: string, public actor: string) { this.base = base.replace(/\/+$/, ""); }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "X-Atlas-Actor": this.actor || "anonimo" };
    if (this.token) h["X-Atlas-Token"] = this.token;
    return h;
  }
  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const r = await fetch(this.base + path, { ...init, headers: { ...this.headers(), ...(init.headers as Record<string, string> || {}) } });
    if (!r.ok) {
      let msg = `${r.status} ${r.statusText}`;
      try { const j = await r.json(); msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail || j); } catch { /* sin cuerpo */ }
      throw new Error(msg);
    }
    return (await r.json()) as T;
  }
  health() { return this.req<{ ok: boolean; version: string; database: string; auth: string; ai_enabled: boolean }>("/api/health"); }
  projects() { return this.req<ApiProject[]>("/api/projects"); }
  project(id: string) { return this.req<ApiProject & { inventory?: unknown }>(`/api/projects/${encodeURIComponent(id)}`); }
  createProject(name: string, purpose?: string, owner?: string) { return this.req<ApiProject>("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, purpose, owner }) }); }
  deleteProject(id: string) { return this.req<{ deleted: string }>(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }); }
  upload(id: string, files: File[], rootName?: string) {
    const fd = new FormData();
    for (const f of files) fd.append("files", f, f.name);
    const q = rootName ? `?root_name=${encodeURIComponent(rootName)}` : "";
    return this.req<ApiSource[]>(`/api/projects/${encodeURIComponent(id)}/sources${q}`, { method: "POST", body: fd });
  }
  confirm(id: string, sid: string) { return this.req<ApiSource>(`/api/projects/${encodeURIComponent(id)}/sources/${encodeURIComponent(sid)}/confirm`, { method: "POST" }); }
  discard(id: string, sid: string) { return this.req<{ discarded: string }>(`/api/projects/${encodeURIComponent(id)}/sources/${encodeURIComponent(sid)}`, { method: "DELETE" }); }
  build(id: string) { return this.req<{ version: number; stats: Record<string, unknown> }>(`/api/projects/${encodeURIComponent(id)}/build`, { method: "POST" }); }
  agf(id: string) { return this.req<Agf>(`/api/projects/${encodeURIComponent(id)}/agf`); }
  async vectors(id: string): Promise<VectorIndex | null> { try { return await this.req<VectorIndex>(`/api/projects/${encodeURIComponent(id)}/vectors`); } catch { return null; } }
  reviewEdge(id: string, edgeId: string, decision: "validated" | "rejected" | "proposed", note?: string) { return this.req<AgfEdge>(`/api/projects/${encodeURIComponent(id)}/review/edge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edge_id: edgeId, decision, note }) }); }
  reviewNode(id: string, nodeId: string, decision: "validated" | "rejected" | "proposed", facets?: Record<string, string>) { return this.req<AgfNode>(`/api/projects/${encodeURIComponent(id)}/review/node`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ node_id: nodeId, decision, facets }) }); }
  audit(id: string) { return this.req<{ at: string; actor: string; action: string; detail: Record<string, unknown> }[]>(`/api/projects/${encodeURIComponent(id)}/audit`); }
}

export interface ApiConfig { url: string; token: string; actor: string }

export function loadApiConfig(): ApiConfig | null {
  const params = new URLSearchParams(location.search);
  let url = params.get("api") || (import.meta.env.VITE_API_URL as string | undefined) || "";
  let token = "", actor = "";
  try {
    const saved = JSON.parse(localStorage.getItem("atlas.api") || "null") as ApiConfig | null;
    if (saved) { url = url || saved.url; token = saved.token || ""; actor = saved.actor || ""; }
  } catch { /* sin almacenamiento */ }
  if (params.get("token")) token = params.get("token")!;
  return url ? { url, token, actor } : null;
}

export function saveApiConfig(cfg: ApiConfig | null) {
  try { cfg ? localStorage.setItem("atlas.api", JSON.stringify(cfg)) : localStorage.removeItem("atlas.api"); } catch { /* sin almacenamiento */ }
}
