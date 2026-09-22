/** Orquestación del visor: carga AGF + perfil, modelo, motor, historial y pestañas. */
import { Graph } from "./engine/graph";
import { esc, pad } from "./lib/text";
import { Model, type Scope, type View, type VNode, type Mode } from "./model";
import { currentTheme, ProfileView, UNCLASSIFIED } from "./profile";
import { SearchIndex } from "./search/search";
import { emit, state } from "./state";
import type { Agf, AgfNode, Profile, VectorIndex } from "./types";

export type Tab = "nota" | "proyectos" | "secciones" | "facetas" | "relaciones" | "fuentes" | "traza";
export type TabRenderer = (app: App) => string;

interface Snapshot { sel: string | null; tab: Tab; view: View; mode: Mode; expanded: string[]; groupBy: string; scope: Scope }

export class App {
  agf!: Agf;
  pv!: ProfileView;
  model!: Model;
  graph: Graph;
  index: SearchIndex | null = null;
  vectors: VectorIndex | null = null;
  tab: Tab = "nota";
  history: Snapshot[] = [];
  renderers: Partial<Record<Tab, TabRenderer>> = {};
  afterRender: Partial<Record<Tab, (app: App) => void>> = {};
  panel = document.getElementById("panel") as HTMLElement;
  body = document.getElementById("panel-body") as HTMLElement;
  reviewed = new Map<string, "validated" | "rejected">();   // decisiones de revisión en esta sesión (id de arista)

  constructor() {
    this.graph = new Graph(document.getElementById("graph") as HTMLCanvasElement, {
      onSelect: (n) => this.selectNode(n),
      onEmptyClick: () => { this.remember(); this.graph.selected = null; if (this.tab === "nota") this.renderTab(); this.syncBack(); },
      onSimpleOpen: (n) => { this.remember(); state.expanded.add(n.id); this.rebuild(); this.graph.selected = n; this.tab = "nota"; this.openPanel(true); this.renderTab(); },
      onStatus: () => this.updateStatus(),
    });
    this.graph.graphArea = () => {
      const W = this.graph.W, H = this.graph.H;
      const panelOpen = this.panel.classList.contains("open") && W > 900;
      const settingsOpen = !(document.getElementById("settings") as HTMLElement).hidden && W > 900;
      return { x0: settingsOpen ? 300 : 0, x1: W - (panelOpen ? Math.min(27 * 16, W * 0.94) : 0), y0: 60, y1: H - 20 };
    };
  }

  get selected() { return this.graph.selected; }
  set selected(n: VNode | null) { this.graph.selected = n; }

  /* ── carga ── */
  load(agf: Agf, profile: Profile, vectors: VectorIndex | null = null) {
    this.agf = agf; this.pv = new ProfileView(profile); this.vectors = vectors;
    this.pv.applyCssVars();
    if (!state.groupBy || !profile.facets[state.groupBy]) state.groupBy = profile.default_group_by;
    state.rep = profile.layout.separar.default; state.len = profile.layout.distancia.default;
    state.scope = agf.sources.length > 1 ? { level: "project" } : { level: "source", sourceId: agf.sources[0]?.id };
    state.expanded.clear(); this.history = []; this.reviewed.clear();
    this.index = new SearchIndex(agf, vectors, (n) => this.labelsOf(n));
    this.rebuildModel(true);
    document.getElementById("wordmark")!.innerHTML = this.wordmark();
    document.getElementById("tagline")!.textContent = agf.sources.length > 1 ? `${agf.sources.length} fuentes · proyecto` : "grafo de metadata · propuesta";
    emit("loaded");
  }
  wordmark() {
    const name = this.agf.project.name.toLowerCase();
    if (name.includes("oncol")) return "Atlas de <em>Datos Oncológicos</em>";
    return "Atlas de <em>Datos</em>";
  }
  labelsOf(n: AgfNode) {
    return Object.entries(n.facets || {}).map(([f, v]) => this.pv.valueLabel(f, v)).join(" ");
  }

  rebuildModel(reseed = false) {
    const prof = this.pv.p;
    this.model = new Model(this.agf, this.pv, { groupBy: state.groupBy, scope: state.scope, threshold: prof.group_threshold ?? 2, maxColors: prof.max_colors_per_facet ?? 8 });
    state.values = new Set(this.model.values);
    for (const l of [...state.layers]) if (!this.model.layers.includes(l)) state.layers.delete(l);
    if (this.model.isProject) state.layers.add("link").add("shares");
    const keepSel = this.graph.selected?.id;
    this.graph.setModel(this.model, this.pv);
    if (keepSel && this.model.N[keepSel]) this.graph.selected = this.model.N[keepSel];
    this.rebuild();
    if (reseed) { this.graph.prewarm(); this.graph.fit(); }
    emit("model");
  }
  rebuild() { this.graph.rebuild(); }

  /* ── navegación ── */
  snapshot(): Snapshot {
    return { sel: this.selected ? this.selected.id : null, tab: this.tab, view: state.view, mode: state.mode, expanded: [...state.expanded], groupBy: state.groupBy, scope: { ...state.scope } };
  }
  remember() {
    const s = this.snapshot(), top = this.history[this.history.length - 1];
    if (top && JSON.stringify(top) === JSON.stringify(s)) return;
    this.history.push(s); if (this.history.length > 60) this.history.shift();
    this.syncBack();
  }
  syncBack() {
    (document.getElementById("btn-back") as HTMLButtonElement).disabled = this.history.length === 0;
    const c = document.getElementById("crumb")!;
    const s = this.selected;
    const tabName: Record<Tab, string> = { nota: "Inicio", proyectos: "Proyectos", secciones: "Secciones", facetas: "Facetas", relaciones: "Relaciones", fuentes: "Fuentes", traza: "Trazabilidad" };
    const scope = this.agf.sources.length > 1 && state.scope.level === "source" ? (this.model.root.name + " › ") : "";
    c.textContent = scope + (s ? (s.kind === "section" && s.n !== undefined ? pad(s.n) + " · " + s.name : s.name) : tabName[this.tab]);
  }
  goBack() {
    const s = this.history.pop(); if (!s) return;
    let rebuildModel = false, rb = false;
    if (s.groupBy !== state.groupBy) { state.groupBy = s.groupBy; rebuildModel = true; }
    if (JSON.stringify(s.scope) !== JSON.stringify(state.scope)) { state.scope = s.scope; rebuildModel = true; }
    if (s.mode !== state.mode) { this.setMode(s.mode, false); rb = true; }
    if (s.view !== state.view) { this.setView(s.view); rb = true; }
    if (JSON.stringify([...state.expanded]) !== JSON.stringify(s.expanded)) { state.expanded = new Set(s.expanded); rb = true; }
    if (rebuildModel) { this.rebuildModel(true); emit("settings"); } else if (rb) this.rebuild();
    this.graph.selected = s.sel ? this.model.N[s.sel] || null : null; this.tab = s.tab;
    this.openPanel(true); this.renderTab(); if (this.selected) this.graph.centerOn(this.selected);
    this.syncBack();
  }
  goHome() { this.remember(); this.graph.selected = null; this.tab = "nota"; this.openPanel(true); this.renderTab(); this.graph.fit(); }
  selectNode(n: VNode) {
    if (this.selected !== n || this.tab !== "nota") this.remember();
    this.graph.selected = n; this.tab = "nota"; this.openPanel(true); this.renderTab();
  }
  /** Navega a un nodo por id (AGF o visual). Si está oculto por vista, filtro o ámbito, cambia lo mínimo para mostrarlo. */
  selectById(id: string) {
    let n = this.model.N[id];
    if (!n) {
      const a = this.model.agfNode.get(id);
      if (a && this.agf.sources.length > 1 && a.source_id && (state.scope.level === "project" || a.source_id !== state.scope.sourceId) && a.kind !== "source") {
        this.setScope({ level: "source", sourceId: a.source_id }); n = this.model.N[id];
      } else if (a && a.kind === "source") {
        this.setScope({ level: "source", sourceId: a.id }); n = this.model.root;
      } else if (a && a.kind === "project_root") { n = this.model.root; }
    }
    if (!n) return;
    if (!this.graph.nodeVisible(n) && state.mode === "simple") {
      if (n.kind === "facet" || n.kind === "vocab") { this.remember(); this.setMode("detalle", false); }
      else { this.remember(); if (n.section) state.expanded.add(n.section); if (n.value) { state.values.add(n.value); emit("settings"); } this.rebuild(); }
    }
    if (!this.graph.nodeVisible(n)) {
      if (n.kind === "element" || n.kind === "group" || n.kind === "facet") { state.values.add(n.value); emit("settings"); }
      if (n.kind === "vocab") { state.layers.add("std"); emit("settings"); }
      if ((n.kind === "section" || n.kind === "sub") && state.view === "tipo") this.setView("combinada");
      if (n.kind === "facet" && state.view === "estructura") this.setView("combinada");
      if (n.kind === "group" && state.view !== "combinada") this.setView("combinada");
      this.rebuild();
    }
    this.selectNode(n); this.graph.centerOn(n);
  }
  setScope(scope: Scope) {
    this.remember();
    state.scope = scope; state.expanded.clear();
    this.graph.selected = null;
    this.rebuildModel(true);
    emit("settings");
  }
  setMode(m: Mode, withFit = true) {
    state.mode = m;
    document.querySelectorAll(".modeseg button[data-mode]").forEach((b) => b.classList.toggle("on", (b as HTMLElement).dataset.mode === m));
    try { localStorage.setItem("atlas.mode", m); } catch { /* sin almacenamiento */ }
    emit("settings");
    this.rebuild();
    if (withFit) setTimeout(() => this.graph.fit(), 600);
    if (this.tab === "nota" && !this.selected) this.renderTab();
  }
  setView(v: View) { state.view = v; emit("settings"); }
  setGroupBy(f: string) { this.remember(); state.groupBy = f; this.rebuildModel(false); this.graph.prewarm(); setTimeout(() => this.graph.fit(), 300); emit("settings"); if (this.tab !== "nota" || !this.selected) this.renderTab(); }
  toggleTheme() {
    const t = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", t);
    this.pv.applyCssVars(t);
    try { localStorage.setItem("atlas.theme", t); } catch { /* sin almacenamiento */ }
  }

  /* ── panel ── */
  openPanel(open = true) { this.panel.classList.toggle("open", open); document.getElementById("btn-panel")!.setAttribute("aria-expanded", String(open)); }
  setTab(t: Tab) {
    if (t !== this.tab || this.selected) this.remember();
    this.tab = t; if (t !== "nota") this.graph.selected = null; this.openPanel(true); this.renderTab();
  }
  renderTab() {
    document.querySelectorAll("#tabs button[data-tab]").forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.tab === this.tab));
    const r = this.renderers[this.tab];
    this.body.innerHTML = r ? r(this) : `<p>Pestaña ${esc(this.tab)} no disponible.</p>`;
    this.body.scrollTop = 0;
    this.afterRender[this.tab]?.(this);
    this.syncBack();
  }
  toast(msg: string, ms = 4000) {
    const t = document.getElementById("toast")!; t.textContent = msg; t.hidden = false;
    window.clearTimeout((t as unknown as { _t?: number })._t); (t as unknown as { _t?: number })._t = window.setTimeout(() => { t.hidden = true; }, ms);
  }
  updateStatus() {
    const g = this.graph, hits = state.query ? g.visNodes.filter((n) => g.matches(n)).length : null;
    const els = g.visNodes.filter((n) => n.kind === "element").length;
    const what = this.model?.isProject ? "elementos puente" : "variables";
    document.getElementById("status")!.textContent = hits !== null ? `${hits} coincidencias · Enter para abrir`
      : state.mode === "simple" ? `${this.model.sections.length} ${this.model.isProject ? "fuentes" : "secciones"} · ${state.expanded.size} abiertas · ${els} ${what} visibles`
      : `${els} ${what} · ${g.visLinks.length} enlaces · vista ${state.view}${this.model.isProject ? " · proyecto" : ""}`;
  }

  /* ── utilidades para las notas ── */
  wl(n: VNode | AgfNode, label?: string) { return `<span class="wl" data-id="${esc(n.id)}" role="link" tabindex="0">[[${esc(label || n.name)}]]</span>`; }
  dot(v: string) { return `<i style="background:${this.graph.color(v)}"></i>`; }
  chip(n: VNode, withSource = false) {
    const src = withSource && n.source && this.agf.sources.length > 1 ? `<span class="src">${esc(this.sourceName(n.source))}</span>` : "";
    return `<button class="chip" data-id="${esc(n.id)}">${n.kind === "element" ? this.dot(n.value) : ""}${esc(n.name)}${src}</button>`;
  }
  chipAgf(n: AgfNode) {
    const v = this.model.valueMap.get((n.facets?.[state.groupBy] as string) || UNCLASSIFIED) || UNCLASSIFIED;
    const src = this.agf.sources.length > 1 && n.source_id ? `<span class="src">${esc(this.sourceName(n.source_id))}</span>` : "";
    return `<button class="chip" data-id="${esc(n.id)}">${n.kind === "element" ? this.dot(v) : ""}${esc(n.name)}${src}</button>`;
  }
  sourceName(id: string) { const s = this.agf.sources.find((x) => x.id === id); return s?.title || s?.name || id; }
  composition(els: { value: string }[]) {
    const total = els.length || 1;
    return `<div class="comp" role="img" aria-label="Composición por ${esc(this.pv.facetLabel(state.groupBy))}">${this.model.values.map((v) => {
      const k = els.filter((e) => e.value === v).length;
      return k ? `<i style="width:${(100 * k / total).toFixed(1)}%;background:${this.graph.color(v)}" title="${esc(this.model.labelValue(v))}: ${k}"></i>` : "";
    }).join("")}</div>`;
  }
  groupedElements(els: VNode[], withSource = false) {
    return this.model.values.filter((v) => els.some((e) => e.value === v)).map((v) => {
      const list = els.filter((e) => e.value === v);
      return `<div class="gh">${this.dot(v)} ${esc(this.model.labelPlural(v))} · ${list.length}</div><div class="chips">${list.map((e) => this.chip(e, withSource)).join("")}</div>`;
    }).join("");
  }
  findingsFor(id: string) { return this.model.findingsByNode.get(id) || []; }
  findingCard(f: { id: string; priority: string; title: string; detail?: string; action: string; node_ids?: string[] }) {
    const short = (t: string) => t.length > 34 ? t.slice(0, 32) + "…" : t;
    const refs = (f.node_ids || []).map((id) => { const a = this.model.agfNode.get(id); return a ? { id, label: a.kind === "section" && a.number !== undefined ? pad(a.number) + " · " + short(a.name) : short(a.name) } : null; }).filter(Boolean) as { id: string; label: string }[];
    const lbl = this.pv.p.priorities[f.priority]?.label || f.priority;
    return `<div class="obs"><span class="tag ${esc(f.priority)}">${esc(lbl)}</span><b>${esc(f.title)}</b>
      ${f.detail ? `<p>${esc(f.detail)}</p>` : ""}<p class="act"><b>Qué hacer:</b> ${esc(f.action)}</p>
      ${refs.length ? `<div class="chips" style="margin-top:.4rem">${refs.map((r) => `<button class="chip" data-id="${esc(r.id)}">${esc(r.label)}</button>`).join("")}</div>` : `<p style="font-size:.76rem">Afecta a todas las variables.</p>`}</div>`;
  }
  edgesOf(id: string) { return this.agf.edges.filter((e) => (e.source === id || e.target === id) && e.status !== "rejected"); }
}
