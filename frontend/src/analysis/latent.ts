/** Patrones ocultos: un codificador de grafo con atención (una capa tipo transformer sobre el vecindario de
 *  cada nodo) entrenado en el navegador para predecir enlaces. Con lo aprendido se proponen:
 *    - relaciones latentes: pares no conectados con alta probabilidad de enlace;
 *    - comunidades: grupos de datos que el modelo ve juntos, con nombre por sus palabras frecuentes;
 *    - flujos: cadenas de fechas ordenadas por el documento y reforzadas por enlaces predichos;
 *    - reubicaciones: datos que el modelo sitúa más cerca de otra sección que de la suya.
 *  Límites: trabaja solo con metadata (nombres, facetas y estructura; nunca filas, regla M4). Todo resultado es
 *  hipótesis (`origin: inferred`, `status: proposed`) con puntaje y justificación; requiere validación humana.
 *  Determinista para una semilla dada. Espejo en backend/atlas/analysis/latent.py. */
import { norm, tokens } from "../lib/text";
import { hashOne } from "../search/hash";
import type { Agf, AgfNode } from "../types";

export interface LatentOptions { dim?: number; epochs?: number; lr?: number; seed?: number; negatives?: number; topPairs?: number; minScore?: number; communities?: number }
export interface LatentPair { a: string; b: string; score: number; shared: string[]; why: string; sameSource: boolean }
export interface Community { id: number; label: string; members: string[]; cohesion: number }
export interface Flow { steps: { id: string; predicted: boolean; score: number }[]; label: string }
export interface Relocation { id: string; from: string; to: string; margin: number }
export interface LatentResult {
  pairs: LatentPair[]; communities: Community[]; flows: Flow[]; relocations: Relocation[];
  training: { nodes: number; edges: number; epochs: number; lossStart: number; lossEnd: number; holdoutAuc: number | null; seed: number; dim: number; ms: number };
}

const STOP = new Set(["de", "del", "la", "el", "los", "las", "en", "al", "y", "o", "con", "por", "a", "un", "una", "the", "of", "para"]);

/** Generador determinista (mulberry32). */
function rng(seed: number) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function nodeText(n: AgfNode): string {
  const f = n.facets || {};
  return [n.name, n.description || n.note || "", f.data_type || "", f.info_domain || "", f.element_kind || ""].filter(Boolean).join(". ");
}

export function trainLatent(agf: Agf, opt: LatentOptions = {}): LatentResult {
  const t0 = performance.now();
  const D = opt.dim ?? 32, EPOCHS = opt.epochs ?? 120, LR = opt.lr ?? 0.03, SEED = opt.seed ?? 7, NEG = opt.negatives ?? 2;
  const rand = rng(SEED);
  const nodes = agf.nodes.filter((n) => n.kind === "element" || n.kind === "section");
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const N = nodes.length;
  const X = nodes.map((n) => hashOne(nodeText(n)));   // 256-d léxico, norma 1
  const F = X[0]?.length || 256;
  // aristas (no dirigidas) con peso; se separa un 15 % de same_as/precedes como prueba ciega
  const edges: [number, number, number][] = [];
  const holdout: [number, number][] = [];
  for (const e of agf.edges) {
    if (e.status === "rejected") continue;
    const a = idx.get(e.source), b = idx.get(e.target);
    if (a === undefined || b === undefined || a === b) continue;
    const w = e.kind === "contains" ? 1 : e.kind === "relates" ? 0.5 : 1;
    if ((e.kind === "same_as" || e.kind === "precedes") && rand() < 0.15) { holdout.push([a, b]); continue; }
    edges.push([a, b, w]);
  }
  const adj: number[][] = Array.from({ length: N }, () => []);
  const adjSet = new Set<string>();
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); adjSet.add(a + "|" + b); adjSet.add(b + "|" + a); }
  const known = new Set(adjSet);   // toda relación registrada, incluidas las retenidas para la prueba ciega
  for (const [a, b] of holdout) { known.add(a + "|" + b); known.add(b + "|" + a); }
  // parámetros
  const init = (rows: number, cols: number, scale: number) => { const m = new Float64Array(rows * cols); for (let i = 0; i < m.length; i++) m[i] = (rand() * 2 - 1) * scale; return m; };
  const Win = init(D, F, 0.3), Q = init(D, D, 0.3), K = init(D, D, 0.3), V = init(D, D, 0.3);
  const matvec = (M: Float64Array, v: ArrayLike<number>, rows: number, cols: number) => { const o = new Float64Array(rows); for (let r = 0; r < rows; r++) { let s = 0; const off = r * cols; for (let c = 0; c < cols; c++) s += M[off + c] * v[c]; o[r] = s; } return o; };
  const matTvec = (M: Float64Array, v: Float64Array, rows: number, cols: number) => { const o = new Float64Array(cols); for (let r = 0; r < rows; r++) { const off = r * cols, vr = v[r]; if (!vr) continue; for (let c = 0; c < cols; c++) o[c] += M[off + c] * vr; } return o; };
  const outer = (G: Float64Array, a: Float64Array, b: ArrayLike<number>, rows: number, cols: number) => { for (let r = 0; r < rows; r++) { const ar = a[r]; if (!ar) continue; const off = r * cols; for (let c = 0; c < cols; c++) G[off + c] += ar * b[c]; } };
  const dot = (a: Float64Array, b: Float64Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  const scale = 1 / Math.sqrt(D);

  let H: Float64Array[] = [], Z: Float64Array[] = [], QH: Float64Array[] = [], KH: Float64Array[] = [], VH: Float64Array[] = [], ALPHA: Float64Array[] = [];
  const forward = () => {
    H = X.map((x) => matvec(Win, x, D, F));
    QH = H.map((h) => matvec(Q, h, D, D)); KH = H.map((h) => matvec(K, h, D, D)); VH = H.map((h) => matvec(V, h, D, D));
    Z = []; ALPHA = [];
    for (let i = 0; i < N; i++) {
      const nb = [i, ...adj[i]];
      const e = nb.map((j) => dot(QH[i], KH[j]) * scale), m = Math.max(...e);
      const ex = e.map((v) => Math.exp(v - m)), s = ex.reduce((a, b) => a + b, 0);
      const alpha = new Float64Array(nb.length); for (let k = 0; k < nb.length; k++) alpha[k] = ex[k] / s;
      const z = new Float64Array(D);
      for (let k = 0; k < nb.length; k++) { const vh = VH[nb[k]], a = alpha[k]; for (let d = 0; d < D; d++) z[d] += a * vh[d]; }
      for (let d = 0; d < D; d++) z[d] += H[i][d];
      Z.push(z); ALPHA.push(alpha);
    }
  };
  let lossStart = 0, lossEnd = 0;
  for (let ep = 0; ep < EPOCHS; ep++) {
    forward();
    const dZ = Z.map(() => new Float64Array(D));
    let loss = 0, count = 0;
    const pair = (a: number, b: number, y: number, w: number) => {
      const s = dot(Z[a], Z[b]), p = sigmoid(s);
      loss += -w * (y ? Math.log(p + 1e-9) : Math.log(1 - p + 1e-9)); count++;
      const g = w * (p - y);
      for (let d = 0; d < D; d++) { dZ[a][d] += g * Z[b][d]; dZ[b][d] += g * Z[a][d]; }
    };
    for (const [a, b, w] of edges) {
      pair(a, b, 1, w);
      for (let k = 0; k < NEG; k++) { const c = Math.floor(rand() * N); if (c !== a && !adjSet.has(a + "|" + c)) pair(a, c, 0, w / NEG); }
    }
    loss /= Math.max(1, count);
    if (ep === 0) lossStart = loss; lossEnd = loss;
    // retropropagación
    const dWin = new Float64Array(D * F), dQ = new Float64Array(D * D), dK = new Float64Array(D * D), dV = new Float64Array(D * D);
    const dH = H.map(() => new Float64Array(D)), dQH = H.map(() => new Float64Array(D)), dKH = H.map(() => new Float64Array(D)), dVH = H.map(() => new Float64Array(D));
    for (let i = 0; i < N; i++) {
      const nb = [i, ...adj[i]], alpha = ALPHA[i], g = dZ[i];
      for (let d = 0; d < D; d++) dH[i][d] += g[d];
      const dAlpha = new Float64Array(nb.length);
      for (let k = 0; k < nb.length; k++) { const j = nb[k]; dAlpha[k] = dot(g, VH[j]); const a = alpha[k]; for (let d = 0; d < D; d++) dVH[j][d] += a * g[d]; }
      let sum = 0; for (let k = 0; k < nb.length; k++) sum += alpha[k] * dAlpha[k];
      for (let k = 0; k < nb.length; k++) {
        const j = nb[k], de = alpha[k] * (dAlpha[k] - sum) * scale;
        for (let d = 0; d < D; d++) { dQH[i][d] += de * KH[j][d]; dKH[j][d] += de * QH[i][d]; }
      }
    }
    for (let i = 0; i < N; i++) {
      outer(dQ, dQH[i], H[i], D, D); outer(dK, dKH[i], H[i], D, D); outer(dV, dVH[i], H[i], D, D);
      const back = matTvec(Q, dQH[i], D, D), back2 = matTvec(K, dKH[i], D, D), back3 = matTvec(V, dVH[i], D, D);
      for (let d = 0; d < D; d++) dH[i][d] += back[d] + back2[d] + back3[d];
      outer(dWin, dH[i], X[i], D, F);
    }
    const step = (M: Float64Array, G: Float64Array) => { const s = LR / Math.max(1, count / 40); for (let i = 0; i < M.length; i++) M[i] -= s * G[i]; };
    step(Win, dWin); step(Q, dQ); step(K, dK); step(V, dV);
  }
  forward();
  const score = (a: number, b: number) => sigmoid(dot(Z[a], Z[b]));
  // prueba ciega: AUC sobre pares retenidos frente a pares al azar
  let auc: number | null = null;
  if (holdout.length >= 3) {
    let wins = 0, total = 0;
    for (const [a, b] of holdout) for (let k = 0; k < 20; k++) { const c = Math.floor(rand() * N); if (c === a || adjSet.has(a + "|" + c)) continue; total++; if (score(a, b) > score(a, c)) wins++; }
    auc = total ? wins / total : null;
  }
  // relaciones latentes: pares no conectados con mayor puntaje (elementos, no secciones)
  const els = nodes.map((n, i) => i).filter((i) => nodes[i].kind === "element");
  const cand: LatentPair[] = [];
  const MIN = opt.minScore ?? 0.8, TOP = opt.topPairs ?? 40;
  for (let x = 0; x < els.length; x++) for (let y = x + 1; y < els.length; y++) {
    const a = els[x], b = els[y];
    if (known.has(a + "|" + b) || nodes[a].parent_id === nodes[b].parent_id) continue;
    const s = score(a, b); if (s < MIN) continue;
    const shared = adj[a].filter((j) => adj[b].includes(j) && nodes[j].kind === "element").map((j) => nodes[j].id);
    const ta = new Set(tokens(nodes[a].name).filter((t) => !STOP.has(t))), tb = tokens(nodes[b].name).filter((t) => !STOP.has(t) && ta.has(t));
    const why = [shared.length ? `${shared.length} vecino(s) en común` : "", tb.length ? `comparten «${tb.slice(0, 3).join("», «")}»` : "", `mismo ${nodes[a].facets?.data_type === nodes[b].facets?.data_type ? "tipo de dato" : "contexto de sección"}`].filter(Boolean).join("; ");
    cand.push({ a: nodes[a].id, b: nodes[b].id, score: +s.toFixed(3), shared, why: why || "cercanía en el espacio aprendido", sameSource: nodes[a].source_id === nodes[b].source_id });
  }
  cand.sort((p, q) => q.score - p.score);
  const pairs = cand.slice(0, TOP);
  // comunidades: k-medias por coseno sobre Z de elementos
  const kC = opt.communities ?? Math.max(2, Math.min(8, Math.round(Math.sqrt(els.length / 2))));
  const unit = (z: Float64Array) => { const n = Math.sqrt(dot(z, z)) || 1; const o = new Float64Array(z.length); for (let i = 0; i < z.length; i++) o[i] = z[i] / n; return o; };
  const U = new Map(els.map((i) => [i, unit(Z[i])]));
  let centers = els.slice(0, kC).map((i) => Float64Array.from(U.get(i)!));
  let assign = new Map<number, number>();
  for (let it = 0; it < 15; it++) {
    assign = new Map(els.map((i) => { let best = 0, bs = -Infinity; centers.forEach((c, k) => { const s = dot(U.get(i)!, c); if (s > bs) { bs = s; best = k; } }); return [i, best]; }));
    centers = centers.map((_, k) => { const m = els.filter((i) => assign.get(i) === k); const c = new Float64Array(D); for (const i of m) for (let d = 0; d < D; d++) c[d] += U.get(i)![d]; return m.length ? unit(c) : centers[k]; });
  }
  const communities: Community[] = centers.map((c, k) => {
    const members = els.filter((i) => assign.get(i) === k);
    const freq = new Map<string, number>();
    for (const i of members) for (const t of new Set(tokens(nodes[i].name).filter((t) => !STOP.has(t) && t.length > 2))) freq.set(t, (freq.get(t) || 0) + 1);
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
    const cohesion = members.length ? members.reduce((s, i) => s + dot(U.get(i)!, c), 0) / members.length : 0;
    return { id: k, label: top.join(" · ") || `grupo ${k + 1}`, members: members.map((i) => nodes[i].id), cohesion: +cohesion.toFixed(3) };
  }).filter((c) => c.members.length >= 2).sort((a, b) => b.members.length - a.members.length);
  // flujos: fechas en orden del documento, con enlaces existentes o predichos entre pasos consecutivos
  const dates = els.filter((i) => nodes[i].facets?.data_type === "fecha");
  const secOrder = new Map(agf.nodes.filter((n) => n.kind === "section").map((n) => [n.id, n.order ?? n.number ?? 0]));
  const bySrc = new Map<string, number[]>();
  for (const i of dates) { const k = nodes[i].source_id || ""; (bySrc.get(k) || bySrc.set(k, []).get(k)!).push(i); }
  const flows: Flow[] = [];
  for (const [src, list] of bySrc) {
    list.sort((a, b) => (secOrder.get(nodes[a].section_id || "") ?? 0) - (secOrder.get(nodes[b].section_id || "") ?? 0));
    if (list.length < 3) continue;
    const steps = list.map((i, k) => { const prev = list[k - 1]; const linked = prev !== undefined && adjSet.has(prev + "|" + i); return { id: nodes[i].id, predicted: prev !== undefined && !linked, score: prev === undefined ? 1 : +score(prev, i).toFixed(3) }; });
    flows.push({ steps, label: `Secuencia de fechas en ${agf.sources.find((s) => s.id === src)?.title || agf.sources.find((s) => s.id === src)?.name || "la fuente"}` });
  }
  // reubicaciones: elemento más cercano al centro de otra sección que al de la suya
  const secCent = new Map<string, Float64Array>();
  for (const [sid] of secOrder) { const m = els.filter((i) => nodes[i].section_id === sid); if (m.length < 2) continue; const c = new Float64Array(D); for (const i of m) for (let d = 0; d < D; d++) c[d] += U.get(i)![d]; secCent.set(sid, unit(c)); }
  const relocations: Relocation[] = [];
  for (const i of els) {
    const own = nodes[i].section_id || ""; const oc = secCent.get(own); if (!oc) continue;
    const so = dot(U.get(i)!, oc); let best = own, bs = so;
    for (const [sid, c] of secCent) if (sid !== own && nodes[i].source_id === agf.nodes.find((n) => n.id === sid)?.source_id) { const s = dot(U.get(i)!, c); if (s > bs) { bs = s; best = sid; } }
    if (best !== own && bs - so > 0.08) relocations.push({ id: nodes[i].id, from: own, to: best, margin: +(bs - so).toFixed(3) });
  }
  relocations.sort((a, b) => b.margin - a.margin);
  return { pairs, communities, flows, relocations: relocations.slice(0, 20), training: { nodes: N, edges: edges.length, epochs: EPOCHS, lossStart: +lossStart.toFixed(4), lossEnd: +lossEnd.toFixed(4), holdoutAuc: auc === null ? null : +auc.toFixed(3), seed: SEED, dim: D, ms: Math.round(performance.now() - t0) } };
}

export const latentKey = (a: string, b: string) => [a, b].sort().join("|");
export const normName = norm;
