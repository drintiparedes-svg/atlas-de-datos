/** IR (árbol intermedio) común y construcción de AGF en el navegador: espejo de backend/atlas/{ir,agf,quality}.py. */
import { inferDataType, inferInfoDomain, inferSectionDomain, inferSensitivity, inferVocabulary, standards, timeline, type Inference } from "../infer";
import { norm, slug, tokens } from "../lib/text";
import type { Agf, AgfEdge, AgfFinding, AgfNode } from "../types";

export interface IRElement { name: string; raw?: string; locator: Record<string, unknown>; note?: string | null; declared: Record<string, unknown>; stats?: Record<string, unknown>; element_kind: string }
export interface IRSection { name: string; number?: number; description?: string | null; locator: Record<string, unknown>; elements: IRElement[]; subsections: IRSection[]; declared?: Record<string, unknown> }
export interface IRRelation { kind: "references" | "relates" | "derived_from" | "precedes"; source: string; target: string; origin?: "extracted" | "inferred"; predicate?: string }
export interface IRDocument { filename: string; title?: string | null; source_type: string; adapter: string; sections: IRSection[]; relations: IRRelation[]; unparsed: { locator?: Record<string, unknown>; text?: string }[]; meta: Record<string, unknown>; text?: string }

export const el = (name: string, locator: Record<string, unknown>, extra: Partial<IRElement> = {}): IRElement => ({ name, raw: name, locator, note: null, declared: {}, element_kind: "field", ...extra });
export const sec = (name: string, locator: Record<string, unknown>, extra: Partial<IRSection> = {}): IRSection => ({ name, locator, elements: [], subsections: [], ...extra });

export function summary(doc: IRDocument) {
  let elements = 0; const walk = (s: IRSection) => { elements += s.elements.length; s.subsections.forEach(walk); };
  doc.sections.forEach(walk);
  return { sections: doc.sections.length, subsections: doc.sections.reduce((a, s) => a + s.subsections.length, 0), elements, unparsed: doc.unparsed.length };
}

async function sha256(buf: ArrayBuffer): Promise<string | undefined> {
  try { const h = await crypto.subtle.digest("SHA-256", buf); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join(""); } catch { return undefined; }
}

export async function buildAgf(doc: IRDocument, buf: ArrayBuffer | null, opts: { rootName?: string; useTimeline?: boolean } = {}): Promise<Agf> {
  const srcId = "src_" + slug(doc.title || doc.filename.replace(/\.[^.]+$/, "")).slice(0, 40);
  const nodes: AgfNode[] = [], edges: AgfEdge[] = [];
  let ec = 0;
  const edge = (kind: AgfEdge["kind"], s: string, t: string, extra: Partial<AgfEdge> = {}) => { edges.push({ id: `e${++ec}`, kind, source: s, target: t, ...extra }); };
  const rname = opts.rootName || doc.title || doc.filename;
  nodes.push({ id: "root", kind: "project_root", name: rname, source_id: srcId, origin: opts.rootName ? "manual" : "inferred", status: "proposed", confidence: opts.rootName ? 1 : 0.6, rationale: opts.rootName ? null : "Nombre de la raíz propuesto desde el título del documento; confirmar (decisión D6)." });
  const used = new Set<string>(); const bySlug = new Map<string, string>(); const vocabUsed = new Map<string, number>();
  const addElement = (e: IRElement, sectionId: string, topId: string, s: IRSection, secDomain: string | null) => {
    const base = "el:" + (slug(e.name) || Math.random().toString(36).slice(2, 8));
    let id = base, k = 2; while (used.has(id)) id = `${base}~${slug(sectionId).slice(-6)}${k++ > 2 ? k : ""}`;
    used.add(id);
    const facets: Record<string, string | null> = { element_kind: e.element_kind }, fo: Record<string, "extracted" | "inferred" | "manual"> = { element_kind: "extracted" }, fc: Record<string, number> = {}, fw: Record<string, string> = {};
    const fv = e.declared._data_type_from_values as Inference | undefined;
    const dt = e.declared.data_type ? inferDataType(e.name, String(e.declared.data_type)) : fv ? { ...fv, origin: "inferred" as const } : inferDataType(e.name);
    facets.data_type = dt.value; fo.data_type = dt.origin; fc.data_type = dt.confidence; fw.data_type = dt.rationale;
    if (e.declared.vocabulary) { facets.vocabulary = String(e.declared.vocabulary); fo.vocabulary = "extracted"; }
    else { const v = inferVocabulary(e.name); if (v.value) { facets.vocabulary = v.value; fo.vocabulary = "inferred"; fc.vocabulary = v.confidence; fw.vocabulary = v.rationale; } }
    if (facets.vocabulary) vocabUsed.set(facets.vocabulary, (vocabUsed.get(facets.vocabulary) || 0) + 1);
    if (e.declared.info_domain) { facets.info_domain = String(e.declared.info_domain); fo.info_domain = "extracted"; }
    else { const d = inferInfoDomain(e.name, s.name, secDomain); if (d.value) { facets.info_domain = d.value; fo.info_domain = "inferred"; fc.info_domain = d.confidence; fw.info_domain = d.rationale; } }
    if (e.declared.sensitivity) { facets.sensitivity = String(e.declared.sensitivity); fo.sensitivity = "extracted"; }
    else { const sn = inferSensitivity(e.name); if (sn.value) { facets.sensitivity = sn.value; fo.sensitivity = "inferred"; fc.sensitivity = sn.confidence; fw.sensitivity = sn.rationale; } }
    const node: AgfNode = { id, kind: "element", source_id: srcId, parent_id: sectionId, section_id: topId, name: e.name, facets, facet_origin: fo, facet_confidence: fc, facet_rationale: fw, note: e.note ?? null, origin: "extracted", status: "proposed", confidence: 1, cardinality: "unknown", required: null, provenance: { locator: e.locator, excerpt: (e.raw || e.name).slice(0, 300) } };
    if (e.declared._value_domain) node.value_domain = e.declared._value_domain as string[];
    for (const k2 of ["native_type", "nullable", "key"]) if (k2 in e.declared) node[k2] = e.declared[k2];
    if (e.stats) node.stats = e.stats;
    nodes.push(node); edge("contains", sectionId, id);
    bySlug.set(slug(e.name), id); bySlug.set(slug(s.name + "." + e.name), id);
  };
  const addSection = (s: IRSection, parentId: string, top: IRSection, order: number, sid: string, inherited: string | null) => {
    const sd = inferSectionDomain(s.name); const dom = sd.value || inherited;
    const node: AgfNode = { id: sid, kind: "section", source_id: srcId, name: s.name, order, origin: "extracted", status: "proposed", confidence: 1, provenance: { locator: s.locator, excerpt: (s.description || s.name).slice(0, 300) } };
    if (s.number !== undefined) node.number = s.number;
    if (s.description) node.description = s.description;
    if (parentId !== "root") node.parent_id = parentId;
    if (sd.value) { node.facets = { info_domain: sd.value }; node.facet_origin = { info_domain: "inferred" }; node.facet_confidence = { info_domain: sd.confidence }; node.facet_rationale = { info_domain: sd.rationale }; }
    nodes.push(node); edge("contains", parentId, sid);
    for (const e of s.elements) addElement(e, sid, sid.split(".")[0], s, dom);
    s.subsections.forEach((sub, k) => addSection(sub, sid, top, k + 1, `${sid}.${k + 1}`, dom));
  };
  doc.sections.forEach((s, i) => addSection(s, "root", s, i + 1, `sec:${srcId}:${s.number !== undefined ? s.number : slug(s.name).slice(0, 30) || i + 1}`, null));
  const STD = standards();
  for (const key of vocabUsed.keys()) { const st = STD[key] || { label: key.toUpperCase(), full: key }; nodes.push({ id: `voc:${key}`, kind: "vocabulary", name: st.label, full_name: st.full, origin: "inferred", status: "proposed" }); }
  for (const n of nodes) if (n.kind === "element" && n.facets?.vocabulary) edge("coded_with", n.id, `voc:${n.facets.vocabulary}`, { layer: "std", origin: n.facet_origin?.vocabulary || "inferred", status: "proposed" });
  if (opts.useTimeline !== false) {
    const pairs = timeline().map(([a, b]) => [bySlug.get(slug(a)), bySlug.get(slug(b))]).filter(([a, b]) => a && b) as [string, string][];
    if (pairs.length >= 2) for (const [a, b] of pairs) edge("precedes", a, b, { layer: "time", origin: "inferred", status: "proposed", confidence: 0.7 });
  }
  for (const r of doc.relations) {
    const s = bySlug.get(slug(r.source)) || bySlug.get(slug(r.source.split(".").pop()!)), t = bySlug.get(slug(r.target)) || bySlug.get(slug(r.target.split(".").pop()!));
    if (s && t && s !== t) edge(r.kind, s, t, { origin: r.origin || "extracted", status: (r.origin || "extracted") === "extracted" ? "validated" : "proposed", ...(r.predicate ? { predicate: r.predicate } : {}), ...(r.kind === "references" ? { layer: "ref" } : {}) });
  }
  const agf: Agf = {
    agf_version: "1.0", project: { id: "prj_" + slug(rname).slice(0, 40), name: rname }, profile: "default",
    sources: [{ id: srcId, name: doc.filename, sha256: buf ? await sha256(buf) : undefined, facets: { source_type: doc.source_type }, adapter: doc.adapter, ingested_at: new Date().toISOString(), status: "proposed", title: doc.title || undefined, unparsed: doc.unparsed.slice(0, 50), unparsed_count: doc.unparsed.length }],
    nodes, edges, findings: [],
  };
  agf.findings = runQuality(agf);
  return agf;
}

const REPEATABLE = ["comite", "tratamiento", "progresion", "recurrencia", "evento", "episodio", "ciclo", "sesion", "visita", "consulta"];
const QMETA = ["disponible", "registrado en", "consignado", "completitud"];
const STOP = new Set(["de", "del", "la", "el", "los", "las", "en", "al", "y", "o", "con", "por"]);

export function runQuality(agf: Agf): AgfFinding[] {
  const nodes = new Map(agf.nodes.map((n) => [n.id, n]));
  const secs = agf.nodes.filter((n) => n.kind === "section"), els = agf.nodes.filter((n) => n.kind === "element");
  const srcType = new Map(agf.sources.map((s) => [s.id, s.facets?.source_type]));
  const referenced = new Set(agf.edges.filter((e) => ["references", "same_as", "derived_from"].includes(e.kind)).map((e) => [e.source, e.target].sort().join("|")));
  const out: AgfFinding[] = []; let k = 0;
  const F = (priority: AgfFinding["priority"], title: string, detail: string, action: string, node_ids: string[], rule: string): AgfFinding => ({ id: `f${++k}`, priority, title, detail, action, node_ids, status: "open", origin: "inferred", rule });
  const lbl = (s: AgfNode) => s.number !== undefined ? `${String(s.number).padStart(2, "0")} · ${s.name}` : s.name;
  const seen = new Map<string, string>();
  for (const s of secs) { const d = norm(s.description || ""); if (d.length < 20) continue; if (seen.has(d)) { const a = nodes.get(seen.get(d)!)!; out.push(F("importante", `Descripción duplicada en «${lbl(s)}»`, `La descripción repite la de «${lbl(a)}».`, "Redactar una descripción propia de la sección o confirmar que ambas comparten alcance.", [a.id, s.id], "duplicate_description")); } else seen.set(d, s.id); }
  for (const e of els) if (norm(e.name).length <= 2) out.push(F("importante", `Elemento «${e.name}» sin definición`, "El nombre tiene 2 caracteres o menos y no permite saber qué registra.", "Confirmar su significado con el equipo responsable y renombrarlo con un nombre explícito.", [e.id], "undefined_element"));
  const toks = new Map(els.map((e) => [e.id, new Set(tokens(e.name).filter((t) => !STOP.has(t)))]));
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j];
    if (a.source_id !== b.source_id || a.section_id === b.section_id || referenced.has([a.id, b.id].sort().join("|"))) continue;
    const ta = toks.get(a.id)!, tb = toks.get(b.id)!; if (!ta.size || !tb.size) continue;
    let inter = 0; for (const t of ta) if (tb.has(t)) inter++;
    const jac = inter / (ta.size + tb.size - inter);
    if (jac >= 0.6 || norm(a.name) === norm(b.name)) out.push(F("importante", `Posible solapamiento: «${a.name}» y «${b.name}»`, `Nombres de alta similitud (${Math.round(jac * 100)} % de palabras compartidas) en secciones distintas.`, "Definir el alcance de cada uno (cuándo se usa cada variable) o fusionarlos.", [a.id, b.id], "possible_overlap"));
  }
  for (const e of els) if (QMETA.some((w) => norm(e.name).includes(w))) out.push(F("menor", "Metadato de calidad mezclado con variables", `«${e.name}» describe si el dato está disponible, no una característica del caso.`, "Moverlo a una sección de metadatos de completitud del registro.", [e.id], "quality_metadata_mixed"));
  const names = els.map((e) => norm(e.name));
  const target = els.find((e) => norm(e.name).startsWith("edad"));
  if (target && names.some((n) => n.startsWith("fecha de nacimiento")) && names.some((n) => ["fecha de emision diagnostico", "fecha de diagnostico", "fecha diagnostico"].some((p) => n.startsWith(p)))) out.push(F("menor", `Variable derivada: «${target.name}»`, "Se calcula desde la fecha de nacimiento y la fecha de diagnóstico.", "Marcarla como calculada y validar su coherencia de forma automática.", [target.id], "derivable_element"));
  const rep = secs.filter((s) => REPEATABLE.some((w) => norm(s.name).includes(w)) && !s.cardinality && !["esquema_bd", "tabla"].includes(String(srcType.get(s.source_id || "") || "")));
  if (rep.length) out.push(F("bloqueante", "Cardinalidad no especificada", "Las secciones " + rep.map(lbl).join(", ") + " describen eventos que pueden ocurrir varias veces por caso, pero el documento no indica si admiten uno o varios registros.", "Definir con el equipo responsable si cada caso admite uno o varios eventos de cada tipo (1:1 o 1:N). Condiciona el diseño de las tablas.", rep.map((s) => s.id), "unspecified_cardinality"));
  const catAll = els.filter((e) => ["categorica", "binario"].includes(e.facets?.data_type || "")), cat = catAll.filter((e) => !e.value_domain);
  if (cat.length && cat.length >= Math.max(3, 0.5 * catAll.length)) out.push(F("bloqueante", "Dominios de valores ausentes", `${cat.length} variables categóricas o binarias no declaran su lista de valores, unidad ni obligatoriedad. Los tipos de dato de este grafo son inferidos.`, "Completar para cada variable: lista de valores permitidos, unidad (si es numérica) y si es obligatoria.", [], "missing_value_domains"));
  return out;
}
