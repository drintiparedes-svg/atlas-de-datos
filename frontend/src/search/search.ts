/** Búsqueda híbrida (léxica + vectores) y camino explicado entre dos nodos. Espejo de backend/atlas/search.py. */
import { norm, tokens } from "../lib/text";
import type { Agf, AgfEdge, AgfNode, VectorIndex } from "../types";
import { cosine, getProvider } from "./hash";

export interface Hit { node: AgfNode; score: number; lexical: number; semantic: number; why: string }

export function lexicalScore(query: string, name: string, extra = ""): number {
  const q = norm(query), n = norm(name);
  if (!q) return 0;
  if (q === n) return 1;
  if (n.includes(q)) return 0.8;
  const qt = new Set(tokens(q)), nt = new Set(tokens(n)), et = new Set(tokens(extra));
  if (!qt.size) return 0;
  let common = 0;
  for (const t of qt) {
    if (nt.has(t)) { common += 1; continue; }
    if (et.has(t)) { common += 0.5; continue; }
    // prefijos: "diagn" coincide con "diagnostico"
    if (t.length >= 4 && [...nt].some((u) => u.startsWith(t))) common += 0.7;
    else if (t.length >= 4 && [...et].some((u) => u.startsWith(t))) common += 0.35;
  }
  return 0.6 * common / qt.size;
}

export class SearchIndex {
  private vec = new Map<string, number[]>();
  provider: string | null = null;
  model = "";
  constructor(private agf: Agf, index: VectorIndex | null, private labelOf: (n: AgfNode) => string) {
    if (index) {
      this.provider = index.provider; this.model = index.model;
      index.ids.forEach((id, i) => this.vec.set(id, index.vectors[i]));
    }
  }
  get semanticAvailable() { return this.provider !== null && getProvider(this.provider) !== null; }
  async queryVector(q: string): Promise<number[] | null> {
    if (!this.provider) return null;
    const p = getProvider(this.provider);
    if (!p) return null;
    return (await p.embed([q], "query"))[0];
  }
  async search(query: string, k = 12, kinds: string[] = ["element", "section", "vocabulary", "source"]): Promise<Hit[]> {
    const qv = await this.queryVector(query);
    const out: Hit[] = [];
    for (const n of this.agf.nodes) {
      if (!kinds.includes(n.kind)) continue;
      const lex = lexicalScore(query, n.name, (n.description || n.note || "") + " " + this.labelOf(n));
      const v = this.vec.get(n.id);
      const sem = qv && v ? cosine(qv, v) : 0;
      const score = lex || sem > 0.3 ? Math.max(lex, 0.9 * sem) : 0;
      if (score > 0.15) out.push({ node: n, score, lexical: lex, semantic: sem, why: lex >= 0.9 * sem ? (lex === 1 ? "nombre exacto" : lex >= 0.8 ? "contiene la consulta" : "comparte palabras") : "parecido semántico" });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, k);
  }
  neighbors(id: string, k = 5, exclude: Set<string> = new Set()): { id: string; score: number }[] {
    const v = this.vec.get(id);
    if (!v) return [];
    const out: { id: string; score: number }[] = [];
    for (const [oid, ov] of this.vec) if (oid !== id && !exclude.has(oid)) out.push({ id: oid, score: cosine(v, ov) });
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, k);
  }
}

const EDGE_COST: Record<string, number> = { contains: 3, shares: 2, relates: 8 };

export interface PathStep { from: string; to: string; edge: AgfEdge }

/** Camino de menor costo (no dirigido). Contención cuesta 3, parecidos (relates) 8, el resto 1. */
export function shortestPath(edges: AgfEdge[], a: string, b: string, maxCost = 40): PathStep[] | null {
  const adj = new Map<string, { v: string; e: AgfEdge }[]>();
  for (const e of edges) {
    if (e.status === "rejected") continue;
    (adj.get(e.source) || adj.set(e.source, []).get(e.source)!).push({ v: e.target, e });
    (adj.get(e.target) || adj.set(e.target, []).get(e.target)!).push({ v: e.source, e });
  }
  const dist = new Map<string, number>([[a, 0]]);
  const prev = new Map<string, { u: string; e: AgfEdge } | null>([[a, null]]);
  const pq: [number, string][] = [[0, a]];
  while (pq.length) {
    pq.sort((x, y) => x[0] - y[0]);
    const [d, u] = pq.shift()!;
    if (d > (dist.get(u) ?? Infinity) || d > maxCost) continue;
    if (u === b) break;
    for (const { v, e } of adj.get(u) || []) {
      const nd = d + (EDGE_COST[e.kind] ?? 1);
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, { u, e }); pq.push([nd, v]); }
    }
  }
  if (!prev.has(b)) return null;
  const path: PathStep[] = [];
  let cur = b;
  while (prev.get(cur)) { const { u, e } = prev.get(cur)!; path.push({ from: u, to: cur, edge: e }); cur = u; }
  return path.reverse();
}
