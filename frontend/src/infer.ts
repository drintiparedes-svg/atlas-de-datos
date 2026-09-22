/** Inferencia en el navegador: espejo de backend/atlas/infer/rules.py sobre config/inference.json y standards.
 *  Toda salida es inferida (origin: inferred, status: proposed) con confianza y justificación. */
import { norm } from "./lib/text";

export interface Inference { value: string | null; confidence: number; rationale: string; origin: "inferred" | "extracted" }
interface Rule { id: string; type: string; starts?: string[]; contains?: string[]; equals?: string[] }
export interface InferenceConfig {
  data_type: { rules: Rule[]; default: string; from_values: { date_patterns: string[]; binary_sets: string[][]; code_patterns: string[]; categorical_max_distinct_ratio: number; categorical_max_distinct: number; identifier_unique_ratio: number; free_text_min_avg_len: number } };
  info_domain: { section_keywords: Record<string, string[]>; element_keywords: Record<string, string[]>; element_keyword_confidence: number; section_inherit_confidence: number };
  sensitivity: { rules: { value: string; confidence: number; contains: string[] }[]; default: string | null };
  personal_data_guard: { patterns: Record<string, string>; max_hits_to_show: number };
}
export interface Standards { [key: string]: { label: string; full?: string; patterns?: string[] } }

let CFG: InferenceConfig | null = null;
let STD: Standards = {};
let TIMELINE: [string, string][] = [];

export async function loadInferenceConfig(base: string) {
  const [c, s, t] = await Promise.all([
    fetch(`${base}data/inference.json`).then((r) => r.json()),
    fetch(`${base}data/standards.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    fetch(`${base}data/timeline.oncologia.json`).then((r) => (r.ok ? r.json() : { edges: [] })).catch(() => ({ edges: [] })),
  ]);
  CFG = c; STD = s; TIMELINE = t.edges || [];
}
export const config = () => { if (!CFG) throw new Error("configuración de inferencia no cargada"); return CFG; };
export const standards = () => STD;
export const timeline = () => TIMELINE;

function match(rule: Rule, n: string): string | null {
  for (const p of rule.equals || []) if (n === norm(p)) return `igual a «${p}»`;
  for (const p of rule.starts || []) if (n.startsWith(norm(p)) || ("¿?".includes(p) && n.startsWith(p))) return `empieza con «${p}»`;
  for (const p of rule.contains || []) if (n.includes(norm(p))) return `contiene «${p}»`;
  return null;
}

export function inferDataType(name: string, declared?: string | null): Inference {
  if (declared) return { value: declared, confidence: 1, rationale: "declarado por el documento", origin: "extracted" };
  const n = norm(name), cfg = config().data_type;
  for (const r of cfg.rules) { const why = match(r, n); if (why) return { value: r.type, confidence: 0.8, rationale: `regla ${r.id}: ${why}`, origin: "inferred" }; }
  return { value: cfg.default, confidence: 0.5, rationale: "sin patrón reconocido: valor por defecto", origin: "inferred" };
}

export function inferDataTypeFromValues(values: string[], name = ""): Inference {
  const cfg = config().data_type.from_values;
  const vals = values.map((v) => String(v ?? "").trim()).filter(Boolean);
  if (!vals.length) { const b = inferDataType(name); return { ...b, confidence: Math.min(b.confidence, 0.4), rationale: "columna vacía: " + b.rationale }; }
  const total = vals.length, distinct = new Set(vals), low = new Set([...distinct].map(norm));
  for (const bset of cfg.binary_sets) if ([...low].every((v) => bset.includes(v))) return { value: "binario", confidence: 0.9, rationale: `valores dentro de {${bset.join(", ")}}`, origin: "inferred" };
  const allMatch = (pats: string[]) => vals.every((v) => pats.some((p) => new RegExp(p).test(v)));
  if (allMatch(cfg.date_patterns)) return { value: "fecha", confidence: 0.95, rationale: "todos los valores tienen formato de fecha", origin: "inferred" };
  if (allMatch(cfg.code_patterns)) return { value: "codigo", confidence: 0.85, rationale: "todos los valores siguen un patrón de código (CIE, CIE-O o TNM)", origin: "inferred" };
  const numeric = vals.every((v) => /^-?\d+([.,]\d+)?$/.test(v));
  if (numeric && distinct.size >= cfg.identifier_unique_ratio * total && total >= 20) return { value: "identificador", confidence: 0.7, rationale: "numérica con valores casi todos únicos", origin: "inferred" };
  if (numeric) return distinct.size <= 2 && [...low].every((v) => v === "0" || v === "1") ? { value: "binario", confidence: 0.9, rationale: "valores 0/1", origin: "inferred" } : { value: "numerica", confidence: 0.9, rationale: "todos los valores son números", origin: "inferred" };
  const avg = vals.reduce((a, v) => a + v.length, 0) / total;
  if (distinct.size >= cfg.identifier_unique_ratio * total && total >= 20 && avg < cfg.free_text_min_avg_len) return { value: "identificador", confidence: 0.75, rationale: "valores casi todos únicos y cortos", origin: "inferred" };
  if (avg >= cfg.free_text_min_avg_len) return { value: "texto_libre", confidence: 0.8, rationale: `longitud media ${avg.toFixed(0)} caracteres`, origin: "inferred" };
  if (distinct.size <= cfg.categorical_max_distinct || distinct.size / total <= cfg.categorical_max_distinct_ratio) return { value: "categorica", confidence: 0.85, rationale: `${distinct.size} valores distintos en ${total} filas`, origin: "inferred" };
  return { value: "categorica", confidence: 0.5, rationale: "sin señal clara: valor por defecto", origin: "inferred" };
}

function keywordHit(keywords: Record<string, string[]>, n: string): [string | null, string | null] {
  let best: [string | null, string | null, number] = [null, null, 0];
  for (const [value, words] of Object.entries(keywords)) for (const w of words) { const wn = norm(w); if (wn && n.includes(wn) && wn.length > best[2]) best = [value, w, wn.length]; }
  return [best[0], best[1]];
}
export function inferSectionDomain(sectionName: string): Inference {
  const [v, w] = keywordHit(config().info_domain.section_keywords, norm(sectionName));
  return v ? { value: v, confidence: 0.7, rationale: `léxico de la sección: «${w}»`, origin: "inferred" } : { value: null, confidence: 0, rationale: "sin léxico reconocido: sin clasificar", origin: "inferred" };
}
export function inferInfoDomain(name: string, sectionName?: string, parentDomain?: string | null): Inference {
  const cfg = config().info_domain, n = norm(name);
  const [v, w] = keywordHit(cfg.element_keywords, n);
  if (v) return { value: v, confidence: cfg.element_keyword_confidence, rationale: `léxico del elemento: «${w}»`, origin: "inferred" };
  if (parentDomain) return { value: parentDomain, confidence: cfg.section_inherit_confidence, rationale: "heredado de la sección", origin: "inferred" };
  if (sectionName) { const [sv, sw] = keywordHit(cfg.section_keywords, norm(sectionName)); if (sv) return { value: sv, confidence: cfg.section_inherit_confidence, rationale: `léxico de la sección: «${sw}»`, origin: "inferred" }; }
  return { value: null, confidence: 0, rationale: "sin léxico reconocido: sin clasificar", origin: "inferred" };
}
export function inferSensitivity(name: string): Inference {
  const n = norm(name);
  for (const r of config().sensitivity.rules) for (const w of r.contains) if (n.includes(norm(w))) return { value: r.value, confidence: r.confidence, rationale: `léxico «${w}» (clasificación provisional, pendiente de revisión legal)`, origin: "inferred" };
  return { value: config().sensitivity.default, confidence: 0, rationale: "sin léxico reconocido: sin clasificar", origin: "inferred" };
}
export function inferVocabulary(name: string): Inference {
  const n = norm(name);
  for (const [key, std] of Object.entries(STD)) for (const p of std.patterns || []) if (n.includes(norm(p))) return { value: key, confidence: 0.75, rationale: `patrón «${p}» de ${std.label}`, origin: "inferred" };
  return { value: null, confidence: 0, rationale: "sin patrón de terminología", origin: "inferred" };
}

export interface GuardReport { hits: Record<string, number>; samples: Record<string, string[]> }
export function scanPersonalData(text: string): GuardReport {
  const cfg = config().personal_data_guard, rep: GuardReport = { hits: {}, samples: {} };
  for (const [k, pat] of Object.entries(cfg.patterns)) {
    const found = text.match(new RegExp(pat, "g")) || [];
    rep.hits[k] = found.length;
    if (found.length) rep.samples[k] = found.slice(0, cfg.max_hits_to_show).map((s) => (s.length <= 4 ? "*".repeat(s.length) : s.slice(0, 2) + "*".repeat(s.length - 4) + s.slice(-2)));
  }
  return rep;
}
