/** Modelo del grafo visible: AGF + perfil + ajustes → nodos y aristas por vista.
 *  Regla 1 del contrato AGF: los grupos de metadata no se guardan; se calculan aquí según la faceta activa
 *  («Agrupar por»), de modo que reagrupar no reprocesa nada. */
import { facetValue, ProfileView, UNCLASSIFIED } from "./profile";
import type { Agf, AgfEdge, AgfFinding, AgfNode } from "./types";

export type VKind = "root" | "source" | "section" | "sub" | "group" | "facet" | "element" | "vocab";
export type LinkKind = "struct" | "type" | "typefaint" | "std" | "time" | "link" | "ref" | "sim" | "latent" | "derived" | "shares";
export type View = "estructura" | "combinada" | "tipo";
export type Mode = "simple" | "detalle";

export interface VNode {
  id: string; kind: VKind; name: string;
  n?: number; order: number;
  parent?: string; section?: string; source?: string;
  value: string;                 // valor de la faceta activa (elemento, grupo, hub)
  agf?: AgfNode;
  elements: VNode[];             // elementos bajo el nodo (secciones, grupos, hubs, fuentes)
  x: number; y: number; vx: number; vy: number; r: number;
  ax?: number; ay?: number; angle?: number; tax?: number; tay?: number;
  lblPos?: string; lblShown?: boolean;
  obsSev?: string | null;
  bridge?: boolean;
}

export interface VLink {
  a: string; b: string; kind: LinkKind; views: View[]; layer?: string; short?: boolean; edge?: AgfEdge; weight?: number;
  A: VNode; B: VNode;
}

export interface Scope { level: "project" | "source"; sourceId?: string }

export interface ModelOptions { groupBy: string; scope: Scope; threshold: number; maxColors: number }

const SEV_RANK: Record<string, number> = { bloqueante: 0, importante: 1, menor: 2 };
export const LAYER_OF_EDGE: Record<string, string> = { coded_with: "std", precedes: "time", same_as: "link", references: "ref", relates: "sim", derived_from: "derived", mentions: "sim", supports: "sim", contradicts: "sim" };
export const layerOfEdge = (e: AgfEdge) => (e.kind === "relates" && e.predicate === "latent" ? "latent" : LAYER_OF_EDGE[e.kind]);
export const LAYER_LABEL: Record<string, string> = {
  std: "Terminologías y estándares", time: "Cronología esperada", link: "Equivalencias entre fuentes (same_as)",
  ref: "Referencias y llaves foráneas", sim: "Parecidos semánticos (propuestos)", latent: "Relaciones latentes (modelo)", derived: "Derivaciones", shares: "Fuentes que comparten datos",
};
const LINK_KIND_OF_LAYER: Record<string, LinkKind> = { std: "std", time: "time", link: "link", ref: "ref", sim: "sim", latent: "latent", derived: "derived", shares: "shares" };

export class Model {
  N: Record<string, VNode> = {};
  links: VLink[] = [];
  elements: VNode[] = [];
  sections: VNode[] = [];       // secciones de primer nivel (o fuentes en nivel proyecto) en orden
  hubs: VNode[] = [];           // nodos de valor de faceta presentes
  vocabs: VNode[] = [];
  values: string[] = [];        // valores de la faceta activa en orden de perfil (con «otros» si excede el máximo)
  valueMap = new Map<string, string>(); // valor real → valor mostrado (para «otros»)
  layers: string[] = [];        // capas disponibles en el ámbito actual
  layerCount: Record<string, number> = {};
  findingsByNode = new Map<string, AgfFinding[]>();
  isProject = false;
  root!: VNode;
  agfNode = new Map<string, AgfNode>();
  agfIdToV = new Map<string, string>();

  constructor(public agf: Agf, public pv: ProfileView, public opt: ModelOptions) {
    for (const n of agf.nodes) this.agfNode.set(n.id, n);
    this.build();
  }

  private add(n: Partial<VNode> & { id: string; kind: VKind; name: string; value?: string }): VNode {
    const v: VNode = { order: 0, value: "", elements: [], x: 0, y: 0, vx: 0, vy: 0, r: 4.6, ...n } as VNode;
    this.N[v.id] = v;
    return v;
  }
  private link(a: string, b: string, kind: LinkKind, views: View[], extra: Partial<VLink> = {}) {
    if (!this.N[a] || !this.N[b]) return;
    this.links.push({ a, b, kind, views, ...extra, A: this.N[a], B: this.N[b] });
  }

  private build() {
    const { agf, opt } = this;
    const sources = agf.sources;
    const projectRoot = agf.nodes.find((n) => n.kind === "project_root");
    this.isProject = opt.scope.level === "project" && sources.length > 1;
    const inScope = (n: AgfNode) => this.isProject ? true : (sources.length <= 1 || n.source_id === opt.scope.sourceId || !n.source_id);

    // hallazgos por nodo
    for (const f of agf.findings || []) for (const id of f.node_ids || []) (this.findingsByNode.get(id) || this.findingsByNode.set(id, []).get(id)!).push(f);
    const worst = (id: string) => (this.findingsByNode.get(id) || []).slice().sort((a, b) => SEV_RANK[a.priority] - SEV_RANK[b.priority])[0]?.priority || null;

    // raíz
    if (this.isProject) {
      this.root = this.add({ id: "root", kind: "root", name: projectRoot?.name || agf.project.name, agf: projectRoot, value: "" });
    } else if (sources.length > 1) {
      const src = agf.nodes.find((n) => n.kind === "source" && n.id === opt.scope.sourceId) || agf.nodes.find((n) => n.source_id === opt.scope.sourceId && n.kind === "source");
      this.root = this.add({ id: "root", kind: "root", name: src?.title || src?.name || opt.scope.sourceId || "Fuente", agf: src, source: opt.scope.sourceId, value: "" });
    } else {
      this.root = this.add({ id: "root", kind: "root", name: projectRoot?.name || agf.project.name, agf: projectRoot, value: "" });
    }
    this.agfIdToV.set(projectRoot?.id || "root", "root");
    if (!this.isProject && sources.length > 1 && opt.scope.sourceId) this.agfIdToV.set(opt.scope.sourceId, "root");

    // elementos y facetas
    const rawEls = agf.nodes.filter((n) => n.kind === "element" && inScope(n));
    const counts = new Map<string, number>();
    for (const e of rawEls) { const v = facetValue(e, opt.groupBy); counts.set(v, (counts.get(v) || 0) + 1); }
    let ordered = this.pv.orderedValues(opt.groupBy, counts.keys());
    if (ordered.filter((v) => v !== UNCLASSIFIED).length > opt.maxColors) {
      const keep = ordered.filter((v) => v !== UNCLASSIFIED).sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0)).slice(0, opt.maxColors - 1);
      const kept = ordered.filter((v) => keep.includes(v));
      for (const v of ordered) this.valueMap.set(v, keep.includes(v) || v === UNCLASSIFIED ? v : "otros");
      ordered = [...kept, "otros", ...(counts.has(UNCLASSIFIED) ? [UNCLASSIFIED] : [])];
    } else for (const v of ordered) this.valueMap.set(v, v);
    this.values = ordered;
    const shown = (e: AgfNode) => this.valueMap.get(facetValue(e, opt.groupBy)) || UNCLASSIFIED;
    for (const v of ordered) this.hubs.push(this.add({ id: "fv:" + v, kind: "facet", name: this.pv.valueLabel(opt.groupBy, v === "otros" ? null : v) === "Sin clasificar" && v === "otros" ? "Otros" : v === "otros" ? "Otros" : this.pv.valueLabel(opt.groupBy, v), value: v }));

    if (this.isProject) this.buildProject(rawEls, shown, worst);
    else this.buildSource(rawEls, shown, worst);

    // vocabularios
    const vocabIds = new Set<string>();
    for (const e of agf.edges) if (e.kind === "coded_with" && this.N[e.source]) vocabIds.add(e.target);
    for (const vid of vocabIds) {
      const a = this.agfNode.get(vid); if (!a) continue;
      const v = this.add({ id: vid, kind: "vocab", name: a.name, agf: a, value: "" });
      this.vocabs.push(v);
    }
    // aristas transversales (capas): solo entre nodos visibles en el ámbito
    for (const e of agf.edges) {
      const layer = layerOfEdge(e); if (!layer) continue;
      const a = this.agfIdToV.get(e.source) || e.source, b = this.agfIdToV.get(e.target) || e.target;
      if (!this.N[a] || !this.N[b]) continue;
      if (e.kind === "coded_with") this.N[b].elements.push(this.N[a]);
      this.link(a, b, LINK_KIND_OF_LAYER[layer], ["estructura", "combinada", "tipo"], { layer, edge: e });
      this.layerCount[layer] = (this.layerCount[layer] || 0) + 1;
    }
    if (this.isProject) for (const e of agf.edges) if (e.kind === "shares" && this.N[e.source] && this.N[e.target]) {
      this.link(e.source, e.target, "shares", ["estructura", "combinada", "tipo"], { layer: "shares", edge: e, weight: e.weight || 1 });
      this.layerCount.shares = (this.layerCount.shares || 0) + 1;
    }
    for (const e of agf.edges) { const layer = layerOfEdge(e); if (layer && !this.layerCount[layer] && e.status !== "rejected") this.layerCount[layer] = 0; }
    const all: Record<string, number> = {};
    for (const e of agf.edges) { const layer = layerOfEdge(e); if (layer && e.status !== "rejected") all[layer] = (all[layer] || 0) + 1; }
    for (const [l, k] of Object.entries(all)) if (!this.layerCount[l]) this.layerCount[l] = k;
    this.layers = Object.keys(LAYER_LABEL).filter((l) => this.layerCount[l]);
    for (const n of Object.values(this.N)) n.obsSev = n.agf ? worst(n.agf.id) : null;
  }

  /** Nivel fuente: raíz → secciones → subsecciones → grupos → elementos (vista actual del prototipo). */
  private buildSource(rawEls: AgfNode[], shown: (e: AgfNode) => string, _worst: (id: string) => string | null) {
    const { agf, opt } = this;
    const secs = agf.nodes.filter((n) => n.kind === "section" && (agf.sources.length <= 1 || n.source_id === opt.scope.sourceId));
    const top = secs.filter((s) => !s.parent_id || !secs.some((o) => o.id === s.parent_id)).sort((a, b) => (a.order ?? a.number ?? 0) - (b.order ?? b.number ?? 0));
    top.forEach((s, i) => {
      const sec = this.add({ id: s.id, kind: "section", name: s.name, n: s.number, order: i + 1, agf: s, source: s.source_id, value: facetValue(s, "info_domain") });
      this.agfIdToV.set(s.id, s.id);
      this.sections.push(sec);
      this.link("root", sec.id, "struct", ["estructura", "combinada"]);
      const subs = secs.filter((o) => o.parent_id === s.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const parents: VNode[] = subs.length ? subs.map((o, k) => {
        const sub = this.add({ id: o.id, kind: "sub", name: o.name, order: k + 1, parent: sec.id, section: sec.id, agf: o, source: o.source_id, value: facetValue(o, "info_domain") });
        this.agfIdToV.set(o.id, o.id);
        this.link(sec.id, sub.id, "struct", ["estructura", "combinada"]);
        return sub;
      }) : [];
      const holders = [sec, ...parents];
      for (const holder of holders) {
        const list = rawEls.filter((e) => e.parent_id === holder.id);
        const groups: Record<string, VNode[]> = {};
        for (const e of list) {
          const v = shown(e);
          const el = this.add({ id: e.id, kind: "element", name: e.name, value: v, parent: holder.id, section: sec.id, agf: e, source: e.source_id });
          this.agfIdToV.set(e.id, e.id);
          this.elements.push(el); sec.elements.push(el); if (holder !== sec) holder.elements.push(el);
          this.N["fv:" + v]?.elements.push(el);
          (groups[v] = groups[v] || []).push(el);
          this.link(holder.id, el.id, "struct", ["estructura"]);
          this.link("fv:" + v, el.id, "type", ["tipo"]);
        }
        for (const [v, els] of Object.entries(groups)) {
          if (els.length >= opt.threshold) {
            const g = this.add({ id: `g:${holder.id}:${v}`, kind: "group", value: v, name: `${this.labelPlural(v)} · ${els.length}`, parent: holder.id, section: sec.id, elements: els });
            this.link(holder.id, g.id, "struct", ["combinada"]);
            for (const el of els) this.link(g.id, el.id, "struct", ["combinada"], { short: true });
            this.link(g.id, "fv:" + v, "typefaint", ["combinada"]);
          } else {
            this.link(holder.id, els[0].id, "struct", ["combinada"]);
            this.link(els[0].id, "fv:" + v, "typefaint", ["combinada"]);
          }
        }
      }
    });
    // elementos huérfanos (sin sección): cuelgan de la raíz
    for (const e of rawEls) if (!this.N[e.id]) {
      const v = shown(e);
      const el = this.add({ id: e.id, kind: "element", name: e.name, value: v, parent: "root", agf: e, source: e.source_id });
      this.agfIdToV.set(e.id, e.id); this.elements.push(el); this.N["fv:" + v]?.elements.push(el);
      this.link("root", el.id, "struct", ["estructura", "combinada"]); this.link("fv:" + v, el.id, "type", ["tipo"]);
    }
    for (const h of this.hubs) this.link("root", h.id, "struct", ["tipo"]);
  }

  /** Nivel proyecto: raíz → fuentes (anillo) → elementos puente (con same_as) agrupados por faceta. */
  private buildProject(rawEls: AgfNode[], shown: (e: AgfNode) => string, _worst: (id: string) => string | null) {
    const { agf, opt } = this;
    const srcNodes = agf.nodes.filter((n) => n.kind === "source");
    const bridged = new Set<string>();
    const srcOf = new Map(agf.nodes.map((n) => [n.id, n.source_id]));
    for (const e of agf.edges) if ((e.kind === "same_as" || (e.kind === "relates" && e.predicate === "latent" && srcOf.get(e.source) !== srcOf.get(e.target))) && e.status !== "rejected") { bridged.add(e.source); bridged.add(e.target); }
    srcNodes.forEach((s, i) => {
      const src = this.add({ id: s.id, kind: "source", name: s.title || s.name, n: i + 1, order: i + 1, agf: s, source: s.id, value: s.facets?.source_type || UNCLASSIFIED });
      this.agfIdToV.set(s.id, s.id);
      this.sections.push(src);
      this.link("root", src.id, "struct", ["estructura", "combinada"]);
      const all = rawEls.filter((e) => e.source_id === s.id);
      for (const e of all) { const v = shown(e); this.N["fv:" + v]?.elements.push({ id: e.id, name: e.name, value: v } as VNode); }
      src.elements = all.map((e) => ({ id: e.id, name: e.name, value: shown(e), kind: "element" } as VNode));
      const list = all.filter((e) => bridged.has(e.id));
      const groups: Record<string, VNode[]> = {};
      for (const e of list) {
        const v = shown(e);
        const el = this.add({ id: e.id, kind: "element", name: e.name, value: v, parent: src.id, section: src.id, agf: e, source: e.source_id, bridge: true });
        this.agfIdToV.set(e.id, e.id); this.elements.push(el);
        (groups[v] = groups[v] || []).push(el);
        this.link(src.id, el.id, "struct", ["estructura"]);
        this.link("fv:" + v, el.id, "type", ["tipo"]);
      }
      for (const [v, els] of Object.entries(groups)) {
        if (els.length >= opt.threshold) {
          const g = this.add({ id: `g:${src.id}:${v}`, kind: "group", value: v, name: `${this.labelPlural(v)} · ${els.length}`, parent: src.id, section: src.id, elements: els });
          this.link(src.id, g.id, "struct", ["combinada"]);
          for (const el of els) this.link(g.id, el.id, "struct", ["combinada"], { short: true });
          this.link(g.id, "fv:" + v, "typefaint", ["combinada"]);
        } else { this.link(src.id, els[0].id, "struct", ["combinada"]); this.link(els[0].id, "fv:" + v, "typefaint", ["combinada"]); }
      }
    });
    for (const h of this.hubs) this.link("root", h.id, "struct", ["tipo"]);
  }

  labelPlural(v: string) { return v === "otros" ? "Otros" : this.pv.valuePlural(this.opt.groupBy, v); }
  labelValue(v: string) { return v === "otros" ? "Otros" : this.pv.valueLabel(this.opt.groupBy, v); }
  countValue(v: string) { return this.elements.filter((e) => e.value === v).length; }
  sectionLabel(s: VNode) { return s.n !== undefined && s.kind === "section" ? `${String(s.n).padStart(2, "0")} · ${s.name}` : s.name; }
  /** Todos los elementos del AGF (no solo los visibles) para inventario y búsqueda. */
  allElements(): AgfNode[] { return this.agf.nodes.filter((n) => n.kind === "element"); }
}
