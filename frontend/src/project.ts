/** Consolidación de fuentes en un proyecto y propuestas de relación en el navegador (espejo de backend/atlas/{project,relations}.py). */
import { charNgrams, norm, tokens } from "./lib/text";
import { cosine, hashOne } from "./search/hash";
import type { Agf, AgfEdge, AgfNode } from "./types";

const STOP = new Set(["de", "del", "la", "el", "los", "las", "en", "al", "y", "o", "con", "por", "a", "un", "una", "the", "of"]);
const DATA_KINDS = new Set(["field", "column", "concept"]);
const jaccard = (a: Set<string>, b: Set<string>) => { if (!a.size || !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); };
const words = (s: string) => new Set(tokens(s).filter((t) => !STOP.has(t)));
export const nameSimilarity = (a: string, b: string) => 0.5 * jaccard(new Set(charNgrams(a)), new Set(charNgrams(b))) + 0.5 * jaccard(words(a), words(b));
const short = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(16).slice(0, 6); };

/** Une una fuente nueva al proyecto actual. Si el actual es de una sola fuente, se convierte en proyecto. */
export function mergeIntoProject(current: Agf, incoming: Agf): Agf {
  const parts = current.sources.length > 1 ? [current, incoming] : [current, incoming];
  const nodes: AgfNode[] = [], edges: AgfEdge[] = [], findings: Agf["findings"] = [], sources: Agf["sources"] = [];
  const seen = new Set<string>(["prj"]), seenE = new Set<string>();
  let ec = 0, fc = 0;
  const projectName = current.sources.length > 1 ? current.project.name : `${current.project.name} (proyecto)`;
  nodes.push({ id: "prj", kind: "project_root", name: projectName, origin: "manual", status: "proposed", confidence: 1 });
  const addSource = (agf: Agf, src: Agf["sources"][0], subNodes: AgfNode[], subEdges: AgfEdge[], subFindings: NonNullable<Agf["findings"]>) => {
    const sid = src.id, remap = new Map<string, string>();
    if (sources.some((s) => s.id === sid)) return;   // ya cargada (misma fuente)
    sources.push(src);
    const rootLike = subNodes.find((n) => n.kind === "project_root" && (n.source_id === sid || agf.sources.length === 1));
    if (rootLike) remap.set(rootLike.id, sid);
    const existing = subNodes.find((n) => n.kind === "source" && n.id === sid);
    nodes.push(existing ? { ...existing } : { id: sid, kind: "source", name: src.name, title: src.title || rootLike?.name, source_id: sid, facets: { source_type: src.facets?.source_type || "otro" }, origin: "extracted", status: src.status || "proposed", confidence: 1, adapter: src.adapter, ingested_at: src.ingested_at });
    seen.add(sid);
    edges.push({ id: `e${++ec}`, kind: "contains", source: "prj", target: sid });
    for (const n of subNodes) {
      if (n.kind === "project_root" || (n.kind === "source" && n.id === sid)) continue;
      if (n.kind === "source") continue;
      if (n.kind === "vocabulary") { if (!seen.has(n.id)) { nodes.push({ ...n }); seen.add(n.id); } remap.set(n.id, n.id); continue; }
      if (n.source_id && n.source_id !== sid) continue;
      let nid = n.id; if (seen.has(nid)) nid = `${n.id}~${short(sid)}`;
      remap.set(n.id, nid); seen.add(nid);
      const m = { ...n, id: nid, source_id: sid };
      if (m.parent_id) m.parent_id = remap.get(m.parent_id) || m.parent_id;
      if (m.section_id) m.section_id = remap.get(m.section_id) || m.section_id;
      nodes.push(m);
    }
    for (const e of subEdges) {
      const s = remap.get(e.source) || e.source, t = remap.get(e.target) || e.target;
      if (e.source === "prj" || e.kind === "shares") continue;
      const key = `${e.kind}|${s}|${t}`; if (seenE.has(key)) continue; seenE.add(key);
      edges.push({ ...e, id: `e${++ec}`, source: s, target: t });
    }
    for (const f of subFindings) if (!f.source_id || f.source_id === sid) findings!.push({ ...f, id: `f${++fc}`, node_ids: (f.node_ids || []).map((x) => remap.get(x) || x), source_id: sid });
  };
  for (const agf of parts) for (const src of agf.sources) addSource(agf, src, agf.nodes, agf.edges, agf.findings || []);
  // aristas entre fuentes ya existentes (same_as, relates, shares) del proyecto actual
  if (current.sources.length > 1) {
    const ids = new Set(nodes.map((n) => n.id));
    for (const e of current.edges) if (["same_as", "relates", "shares"].includes(e.kind) && ids.has(e.source) && ids.has(e.target)) { const key = `${e.kind}|${e.source}|${e.target}`; if (!seenE.has(key)) { seenE.add(key); edges.push({ ...e, id: `e${++ec}` }); } }
  }
  return { agf_version: "1.0", project: { id: current.sources.length > 1 ? current.project.id : current.project.id + "-proyecto", name: projectName }, profile: current.profile || "default", sources, nodes, edges, findings, built_at: new Date().toISOString() };
}

/** Propuestas same_as / relates entre fuentes con vectores hash (sin red). Devuelve cuántas se agregaron. */
export async function proposeRelations(agf: Agf, sameAsThreshold = 0.85, relatesThreshold = 0.55, neighbors = 3): Promise<number> {
  const els = agf.nodes.filter((n) => n.kind === "element");
  const vec = new Map(els.map((n) => [n.id, hashOne([n.name, n.description || n.note || ""].filter(Boolean).join(". "))]));
  const existing = new Set(agf.edges.map((e) => `${e.kind}|${e.source}|${e.target}`));
  let k = agf.edges.filter((e) => e.id?.startsWith("r")).length, added = 0;
  const cand = new Map<string, [number, string][]>();
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j];
    const lex = nameSimilarity(a.name, b.name), sem = cosine(vec.get(a.id)!, vec.get(b.id)!);
    const score = 0.5 * lex + 0.5 * Math.max(0, sem);
    const exact = norm(a.name) === norm(b.name), wa = words(a.name), wb = words(b.name);
    const sameWords = wa.size > 0 && wa.size === wb.size && [...wa].every((w) => wb.has(w));
    const cross = a.source_id !== b.source_id, datalike = [a, b].every((x) => DATA_KINDS.has(x.facets?.element_kind || "field"));
    if (cross && datalike && (exact || sameWords || score >= sameAsThreshold)) {
      if (existing.has(`same_as|${a.id}|${b.id}`) || existing.has(`same_as|${b.id}|${a.id}`)) continue;
      agf.edges.push({ id: `r${++k}`, kind: "same_as", source: a.id, target: b.id, origin: "inferred", status: "proposed", confidence: +(exact ? 0.95 : sameWords ? 0.9 : score).toFixed(3), rationale: exact ? "nombre normalizado idéntico" : sameWords ? "mismas palabras (sin conectores ni guiones)" : `similitud léxica ${lex.toFixed(2)}, semántica ${sem.toFixed(2)}`, layer: "link" });
      added++;
    } else if (score >= relatesThreshold && a.parent_id !== b.parent_id) {
      (cand.get(a.id) || cand.set(a.id, []).get(a.id)!).push([score, b.id]);
      (cand.get(b.id) || cand.set(b.id, []).get(b.id)!).push([score, a.id]);
    }
  }
  const seenPair = new Set<string>();
  for (const [src, list] of cand) for (const [score, tgt] of list.sort((x, y) => y[0] - x[0]).slice(0, neighbors)) {
    const key = [src, tgt].sort().join("|"); if (seenPair.has(key) || existing.has(`relates|${src}|${tgt}`) || existing.has(`relates|${tgt}|${src}`)) continue; seenPair.add(key);
    agf.edges.push({ id: `r${++k}`, kind: "relates", source: src, target: tgt, predicate: "similar_to", origin: "inferred", status: "proposed", confidence: +score.toFixed(3), rationale: `similitud ${score.toFixed(2)}`, layer: "sim" });
    added++;
  }
  addShares(agf);
  return added;
}

export function addShares(agf: Agf, k = 2) {
  const srcOf = new Map(agf.nodes.map((n) => [n.id, n.source_id]));
  const pairs = new Map<string, number>();
  for (const e of agf.edges) if (e.kind === "same_as" && e.status !== "rejected") { const a = srcOf.get(e.source), b = srcOf.get(e.target); if (a && b && a !== b) { const key = [a, b].sort().join("|"); pairs.set(key, (pairs.get(key) || 0) + 1); } }
  agf.edges = agf.edges.filter((e) => e.kind !== "shares");
  let n = 0;
  for (const [key, w] of pairs) if (w >= k) { const [a, b] = key.split("|"); agf.edges.push({ id: `s${++n}`, kind: "shares", source: a, target: b, weight: w, origin: "inferred", status: "proposed", confidence: Math.min(1, w / 5) }); }
}
