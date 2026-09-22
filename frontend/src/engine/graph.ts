/** Motor del grafo: simulación de fuerzas, dibujo en canvas, etiquetas sin solapamiento e interacción.
 *  Portado del prototipo de referencia (reference/prototype.html) sin cambiar parámetros visuales:
 *  los valores provienen de profiles/default.json (layout, labels) y del modelo (facetas). */
import type { Model, VNode, VLink } from "../model";
import { currentTheme, ProfileView, UNCLASSIFIED } from "../profile";
import { state } from "../state";
import { pad, slug } from "../lib/text";

export interface GraphCallbacks {
  onSelect(n: VNode): void;
  onEmptyClick(): void;
  onSimpleOpen(n: VNode): void;   // clic en sección cerrada en modo simplificado
  onStatus(): void;
}

export class Graph {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  W = 0; H = 0; DPR = 1;
  view = { x: 0, y: 0, k: 1 };
  visNodes: VNode[] = [];
  visLinks: VLink[] = [];
  alpha = 1;
  selected: VNode | null = null;
  hovered: VNode | null = null;
  dragNode: VNode | null = null;
  P: Record<string, string> = {};
  private panning = false; private last: { x: number; y: number } | null = null; private downAt: { x: number; y: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>(); private pinch: { d: number; k: number; cx: number; cy: number } | null = null;
  private measureCache = new Map<string, number>();
  private model!: Model;
  pv!: ProfileView;
  private lay!: ProfileView["p"]["layout"];
  private lab!: ProfileView["p"]["labels"];
  private raf = 0;
  private edgeFilter: ((l: VLink) => boolean) | null = null;
  graphArea: () => { x0: number; x1: number; y0: number; y1: number } = () => ({ x0: 0, x1: this.W, y0: 60, y1: this.H - 20 });

  constructor(canvas: HTMLCanvasElement, private cb: GraphCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.bindPointer();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", () => this.readPalette());
    new MutationObserver(() => this.readPalette()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  setModel(m: Model, pv: ProfileView) {
    this.model = m; this.pv = pv; this.lay = pv.p.layout; this.lab = pv.p.labels;
    this.readPalette();
    for (const n of Object.values(m.N)) { n.r = this.radius(n); n.vx = 0; n.vy = 0; }
    this.seed();
    this.selected = null; this.hovered = null;
  }

  resize() {
    this.DPR = window.devicePixelRatio || 1; this.W = window.innerWidth; this.H = window.innerHeight;
    this.canvas.width = this.W * this.DPR; this.canvas.height = this.H * this.DPR;
    this.canvas.style.width = this.W + "px"; this.canvas.style.height = this.H + "px";
  }

  readPalette() {
    const t = currentTheme(); const tok = (k: string) => this.pv?.token(k, t) || "";
    this.P = { edge: tok("edge"), ink: tok("ink"), dim: tok("inkDim"), faint: tok("inkFaint"), bg: tok("bg"), accent: tok("accent"),
      glow: tok("accent") + "33", hub: tok("hub"), warn: tok("warn"), fecha: this.pv?.color("data_type", "fecha", t) || tok("accent") };
    if (this.model) for (const v of this.model.values) this.P["v:" + v] = v === "otros" ? tok("inkFaint") : this.pv.color(this.model.opt.groupBy, v === UNCLASSIFIED ? null : v, t);
  }
  color(v: string) { return this.P["v:" + v] || this.P.faint; }

  radius(n: VNode): number {
    const cnt = n.elements.length;
    switch (n.kind) {
      case "root": return 15;
      case "section": case "source": return state.mode === "simple" ? 11 + Math.sqrt(cnt) * 2.8 : 7 + Math.sqrt(cnt) * 1.9;
      case "sub": return 6 + Math.sqrt(cnt) * 1.2;
      case "group": return 4.5 + Math.sqrt(cnt) * 1.3;
      case "facet": return 11 + Math.sqrt(this.model.countValue(n.value)) * 1.4;
      case "vocab": return 7;
      default: return 4.6;
    }
  }

  /** Posiciones iniciales: secciones en orden horario (01 → N), elementos cerca de su sección. */
  seed() {
    const m = this.model, R = this.lay.section_anchor_radius, secs = m.sections;
    secs.forEach((s, i) => {
      const a = -Math.PI / 2 + (i / secs.length) * Math.PI * 2;
      s.ax = Math.cos(a) * R; s.ay = Math.sin(a) * R; s.angle = a; s.x = s.ax; s.y = s.ay;
    });
    const hubs = m.hubs, FR = this.lay.facet_ring_radius;
    for (const n of Object.values(m.N)) {
      if (n.kind === "root") { n.x = 0; n.y = 0; }
      else if (n.kind === "facet") {
        const i = hubs.indexOf(n), a = -Math.PI / 2 + (i / hubs.length) * Math.PI * 2;
        n.tax = Math.cos(a) * FR; n.tay = Math.sin(a) * FR; n.x = n.tax * 0.4; n.y = n.tay * 0.4;
      } else if (n.kind === "vocab") {
        const i = m.vocabs.indexOf(n), a = (i / m.vocabs.length) * Math.PI * 2;
        n.x = Math.cos(a) * 520; n.y = Math.sin(a) * 520;
      } else if (n.section && m.N[n.section]) {
        const c = m.N[n.section]; n.x = c.x + (Math.random() - 0.5) * 90; n.y = c.y + (Math.random() - 0.5) * 90;
      } else if (n.parent && m.N[n.parent]) {
        const c = m.N[n.parent]; n.x = c.x + (Math.random() - 0.5) * 60; n.y = c.y + (Math.random() - 0.5) * 60;
      }
    }
  }

  nodeVisible(n: VNode): boolean {
    const m = this.model;
    const val = (x: VNode) => state.values.has(x.value);
    if (state.mode === "simple") {
      if (n.kind === "root" || n.kind === "section" || n.kind === "source") return true;
      if (n.kind === "facet") return false;
      if (n.kind === "vocab") return state.layers.has("std") && n.elements.some((v) => state.expanded.has(v.section || "") && val(v));
      const sec = n.section || "";
      if (!state.expanded.has(sec)) return false;
      return n.kind === "sub" ? true : val(n);
    }
    if (n.kind === "element" || n.kind === "group") return val(n);
    if (n.kind === "facet") return state.view !== "estructura" && state.values.has(n.value);
    if (n.kind === "vocab") return state.layers.has("std") && n.elements.some((v) => val(v));
    if (n.kind === "section" || n.kind === "sub" || n.kind === "source") return state.view !== "tipo" || m.isProject;
    return true;
  }

  rebuild() {
    const m = this.model, vis = new Set<string>();
    this.visNodes = Object.values(m.N).filter((n) => { const ok = this.nodeVisible(n); if (ok) vis.add(n.id); return ok; });
    const lv = state.mode === "simple" ? "combinada" : state.view;
    this.visLinks = m.links.filter((l) => {
      if (!l.views.includes(lv)) return false;
      if (l.layer && !state.layers.has(l.layer)) return false;
      if (this.edgeFilter && !this.edgeFilter(l)) return false;
      return vis.has(l.a) && vis.has(l.b);
    });
    for (const n of this.visNodes) n.r = this.radius(n);
    this.alpha = Math.max(this.alpha, 0.9);
    this.cb.onStatus();
  }

  spring(l: VLink): [number, number] {
    const L = state.len, S = this.lay.springs;
    switch (l.kind) {
      case "struct":
        if (l.A.kind === "root") return state.view === "tipo" && !this.model.isProject ? [S["root-facet(tipo)"][0] * L, S["root-facet(tipo)"][1]] : [S["root-section"][0] * L, S["root-section"][1]];
        if (l.short) return [S["group-element"][0] * L, S["group-element"][1]];
        if (l.B.kind === "group" || l.B.kind === "sub") return [S["parent-group/subsection"][0] * L, S["parent-group/subsection"][1]];
        return [S["parent-element"][0] * L, S["parent-element"][1]];
      case "type": return [S.typed_as[0] * L, S.typed_as[1]];
      case "typefaint": return [S.type_link[0] * L, S.type_link[1]];
      case "std": return [S.coded_with[0] * L, S.coded_with[1]];
      case "time": return [S.precedes[0] * L, S.precedes[1]];
      case "link": return [110 * L, 0.02];
      case "shares": return [420 * L, 0.004];
      default: return [120 * L, 0.006];
    }
  }

  tick() {
    if (this.alpha < this.lay.alpha_min) return;
    const rep = state.rep, cut2 = Math.max(160000, rep * 95), vn = this.visNodes, alpha = this.alpha;
    for (let i = 0; i < vn.length; i++) {
      const a = vn[i];
      for (let j = i + 1; j < vn.length; j++) {
        const b = vn[j];
        let dx = b.x - a.x, dy = b.y - a.y; const d2 = dx * dx + dy * dy || 1;
        if (d2 > cut2) continue;
        const hub = (a.kind !== "element" ? 1.6 : 1) * (b.kind !== "element" ? 1.6 : 1);
        const f = rep * hub / d2 * alpha, d = Math.sqrt(d2);
        dx /= d; dy /= d;
        a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
      }
    }
    for (const l of this.visLinks) {
      const [dist, k] = this.spring(l);
      let dx = l.B.x - l.A.x, dy = l.B.y - l.A.y; const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - dist) * k * alpha; dx /= d; dy /= d;
      l.A.vx += dx * f; l.A.vy += dy * f; l.B.vx -= dx * f; l.B.vy -= dy * f;
    }
    const anchorK = this.lay.section_anchor_strength, damp = this.lay.damping;
    for (const n of vn) {
      if ((n.kind === "section" || n.kind === "source") && (state.view !== "tipo" || this.model.isProject) && n.ax !== undefined) { n.vx += (n.ax - n.x) * anchorK; n.vy += (n.ay! - n.y) * anchorK; }
      if (n.kind === "facet" && n.tax !== undefined) { const s = state.view === "tipo" ? 1.1 : 0.6; n.vx += (n.tax * s - n.x) * 0.03; n.vy += (n.tay! * s - n.y) * 0.03; }
      if (n.kind === "root") { n.vx += -n.x * 0.05; n.vy += -n.y * 0.05; }
      n.vx += -n.x * 0.0015 * alpha; n.vy += -n.y * 0.0015 * alpha;
      if (n !== this.dragNode) { n.x += n.vx; n.y += n.vy; }
      n.vx *= damp; n.vy *= damp;
    }
    this.alpha *= this.lay.cooling;
  }

  matches(n: VNode): boolean {
    if (!state.query) return false;
    const q = slug(state.query);
    return slug(n.name).includes(q) || (n.kind === "element" && slug(this.model.labelValue(n.value)).includes(q));
  }
  neighborhoodOf(focus: VNode) {
    const s = new Set([focus.id]);
    for (const l of this.visLinks) { if (l.a === focus.id) s.add(l.b); if (l.b === focus.id) s.add(l.a); }
    return s;
  }

  start() { cancelAnimationFrame(this.raf); const loop = () => { this.draw(); this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop); }
  prewarm() { for (let i = 0; i < this.lay.prewarm_ticks; i++) this.tick(); }

  draw() {
    this.tick();
    const ctx = this.ctx, P = this.P, view = this.view;
    ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.translate(view.x, view.y); ctx.scale(view.k, view.k);
    const focus = this.hovered || this.selected;
    const hood = focus ? this.neighborhoodOf(focus) : null;
    const hits = state.query ? new Set(this.visNodes.filter((n) => this.matches(n)).map((n) => n.id)) : null;
    const lit = (id: string) => hood ? hood.has(id) : hits ? hits.has(id) : true;

    for (const l of this.visLinks) {
      const on = focus && (l.a === focus.id || l.b === focus.id);
      let color = P.edge, width = 1, a = 0.6, dash: number[] | null = null;
      if (l.kind === "typefaint") { color = this.color(l.B.value) || P.edge; a = 0.1; }
      if (l.kind === "type") { color = this.color(l.A.value); a = 0.35; }
      if (l.kind === "std") { color = P.accent; a = 0.3; dash = [2, 3]; }
      if (l.kind === "time") { color = P.fecha; a = 0.75; width = 1.4; dash = [5, 4]; }
      if (l.kind === "link") { color = P.accent; a = 0.8; width = 1.6; dash = [1, 3]; }
      if (l.kind === "ref") { color = P.ink; a = 0.6; width = 1.2; dash = [6, 3]; }
      if (l.kind === "sim") { color = P.dim; a = 0.35; dash = [2, 4]; }
      if (l.kind === "derived") { color = P.warn; a = 0.6; dash = [4, 2]; }
      if (l.kind === "shares") { color = P.accent; a = 0.5; width = 1 + Math.min(6, (l.weight || 1) * 0.6); }
      if (focus) { a = on ? 0.95 : 0.05; if (on) width += 0.5; } else if (hits) a *= hits.has(l.a) || hits.has(l.b) ? 1 : 0.25;
      ctx.globalAlpha = a; ctx.strokeStyle = on && l.kind === "struct" ? P.accent : color; ctx.lineWidth = width;
      ctx.setLineDash(dash || []);
      ctx.beginPath(); ctx.moveTo(l.A.x, l.A.y); ctx.lineTo(l.B.x, l.B.y); ctx.stroke();
      if (l.kind === "time" || l.kind === "ref" || l.kind === "derived") {
        const ang = Math.atan2(l.B.y - l.A.y, l.B.x - l.A.x), tx = l.B.x - Math.cos(ang) * (l.B.r + 3), ty = l.B.y - Math.sin(ang) * (l.B.r + 3);
        ctx.setLineDash([]); ctx.fillStyle = color; ctx.beginPath();
        ctx.moveTo(tx, ty); ctx.lineTo(tx - Math.cos(ang - 0.45) * 7, ty - Math.sin(ang - 0.45) * 7);
        ctx.lineTo(tx - Math.cos(ang + 0.45) * 7, ty - Math.sin(ang + 0.45) * 7); ctx.closePath(); ctx.fill();
      }
    }
    ctx.setLineDash([]);

    for (const n of this.visNodes) {
      const on = lit(n.id);
      const isHub = n.kind === "section" || n.kind === "source";
      ctx.globalAlpha = on ? 1 : state.mode === "simple" && isHub ? 0.55 : 0.14;
      if (focus && n.id === focus.id) { ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 9, 0, Math.PI * 2); ctx.fillStyle = P.glow; ctx.fill(); }
      ctx.beginPath();
      if (n.kind === "vocab") {
        const r = n.r; ctx.moveTo(n.x, n.y - r); ctx.lineTo(n.x + r, n.y); ctx.lineTo(n.x, n.y + r); ctx.lineTo(n.x - r, n.y); ctx.closePath();
        ctx.fillStyle = P.accent; ctx.fill();
      } else if (n.kind === "group" || n.kind === "facet") {
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fillStyle = P.bg; ctx.fill();
        ctx.lineWidth = n.kind === "facet" ? 3 : 2; ctx.strokeStyle = this.color(n.value); ctx.stroke();
        if (n.kind === "facet") { ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 0.45, 0, Math.PI * 2); ctx.fillStyle = this.color(n.value); ctx.fill(); }
      } else if (n.kind === "source") {
        const r = n.r, rr = Math.min(6, r * 0.35);
        ctx.roundRect(n.x - r, n.y - r, r * 2, r * 2, rr); ctx.fillStyle = P.hub; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = P.bg; ctx.stroke();
      } else {
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.kind === "element" ? this.color(n.value) : n.kind === "root" ? P.accent : P.hub;
        ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = P.bg; ctx.stroke();
        if (n.kind === "element" && n.agf?.status === "validated") { ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 0.4, 0, Math.PI * 2); ctx.fillStyle = P.bg; ctx.fill(); }
      }
      const ws = n.obsSev;
      if (ws) {
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 3.5, 0, Math.PI * 2); ctx.lineWidth = ws === "bloqueante" ? 2 : 1.3;
        ctx.strokeStyle = ws === "bloqueante" ? P.warn : ws === "importante" ? P.accent : P.dim;
        ctx.setLineDash(ws === "menor" ? [2, 2] : []); ctx.stroke(); ctx.setLineDash([]);
      }
      if (isHub && (state.mode === "simple" || (n.kind === "source" && this.model.isProject))) {
        let a0 = -Math.PI / 2; const tot = n.elements.length || 1;
        for (const v of this.model.values) {
          const k = n.elements.filter((e) => e.value === v).length; if (!k) continue;
          const a1 = a0 + (k / tot) * Math.PI * 2;
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 5, a0 + 0.03, a1 - 0.03); ctx.lineWidth = 4; ctx.strokeStyle = this.color(v); ctx.stroke();
          a0 = a1;
        }
      }
      if (isHub && n.n !== undefined) {
        ctx.fillStyle = P.bg; ctx.font = `600 ${state.mode === "simple" ? 11 : 9.5}px 'JetBrains Mono', monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(n.n), n.x, n.y + 0.5); ctx.textBaseline = "alphabetic";
      }
    }
    this.drawLabels(focus, hood, hits, lit);
    ctx.globalAlpha = 1;
  }

  private measure(text: string, font: string) {
    const key = font + "|" + text; let w = this.measureCache.get(key);
    if (w === undefined) { this.ctx.font = font; w = this.ctx.measureText(text).width; this.measureCache.set(key, w); if (this.measureCache.size > 4000) this.measureCache.clear(); }
    return w;
  }
  private wrapLabel(text: string, max: number) {
    if (text.length <= max) return [text];
    const words = text.split(" "), lines = [""];
    for (const w of words) { const cur = lines[lines.length - 1]; if ((cur + " " + w).trim().length > max && cur) lines.push(w); else lines[lines.length - 1] = (cur + " " + w).trim(); }
    if (lines.length > 2) { lines.length = 2; lines[1] = lines[1].slice(0, max - 1) + "…"; }
    return lines;
  }

  /** Etiquetas sin solapamiento: colocación voraz por prioridad, 4 posiciones, recalculada por cuadro (PLAN §5.4). */
  private drawLabels(focus: VNode | null, hood: Set<string> | null, hits: Set<string> | null, lit: (id: string) => boolean) {
    const ctx = this.ctx, P = this.P, k = this.view.k, [lo, hi] = this.lab.screen_scale_clamp;
    const scr = (base: number) => base * Math.min(hi, Math.max(lo, k));
    const PRI: Record<string, number> = { root: 1, section: 2, source: 2, facet: 3, sub: 4, group: 5, vocab: 5, element: 7 };
    const cands: { n: VNode; pri: number; isFocus: boolean; on: boolean; was: number }[] = [];
    for (const n of this.visNodes) {
      const inHood = !!(hood && hood.has(n.id)), hit = !!(hits && hits.has(n.id)), isFocus = !!(focus && focus.id === n.id);
      const show = state.labelsAll || n.kind !== "element" || k > 1.25 || inHood || hit;
      if (!show) continue;
      let pri = PRI[n.kind] || 6; if (inHood || hit) pri -= 10; if (isFocus) pri = -99;
      cands.push({ n, pri, isFocus, on: lit(n.id), was: n.lblShown ? 0 : 1 });
    }
    cands.sort((x, y) => x.pri - y.pri || x.was - y.was);
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const hubs = this.visNodes.filter((n) => n.kind !== "element");
    const overlaps = (b: { x0: number; y0: number; x1: number; y1: number }, list: typeof placed) => list.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    const nodeHit = (b: { x0: number; y0: number; x1: number; y1: number }, n: VNode, list: VNode[]) => list.some((m) => m !== n && b.x0 < m.x + m.r && b.x1 > m.x - m.r && b.y0 < m.y + m.r && b.y1 > m.y - m.r);
    for (const n of this.visNodes) n.lblShown = false;
    for (const c of cands) {
      const n = c.n, isHub = n.kind === "section" || n.kind === "source";
      const baseSize = n.kind === "root" ? 13 : isHub || n.kind === "facet" ? 11.5 : n.kind === "element" ? 10.5 : 10;
      const size = scr(baseSize) / k;
      const weight = isHub || n.kind === "facet" || n.kind === "root" || c.isFocus ? "600 " : "";
      const font = `${weight}${size}px 'Albert Sans', sans-serif`;
      let text = n.kind === "section" && n.n !== undefined ? `${pad(n.n)} · ${n.name}` : n.name;
      const trunc = this.lab.element_truncate_chars;
      if (n.kind === "element" && !c.isFocus && text.length > trunc) text = text.slice(0, trunc - 2) + "…";
      const lines = isHub || n.kind === "sub" ? this.wrapLabel(text, c.isFocus ? 34 : this.lab.section_wrap_chars) : [text];
      const cnt = n.elements.length;
      const sub2 = isHub && (state.mode === "simple" || (n.kind === "source" && this.model.isProject)) ? `${cnt} ${this.model.isProject ? "elementos" : "variables"} · ${state.mode === "simple" ? (state.expanded.has(n.id) ? "abierta" : "clic para abrir") : "clic para abrir la fuente"}` : null;
      const subSize = scr(9.5) / k, subFont = `${subSize}px 'JetBrains Mono', monospace`;
      const lh = size * 1.22;
      const tryPlace = (lns: string[], withSub: boolean) => {
        const w = Math.max(...lns.map((l) => this.measure(l, font)), withSub ? this.measure(sub2!, subFont) : 0) + 4 / k;
        const h = lns.length * lh + (withSub ? subSize * 1.3 : 0);
        const gap = (isHub && state.mode === "simple" ? 9 : 4) / k;
        const ring = n.r + gap;
        const opts: Record<string, { x0: number; y0: number; x1: number; y1: number }> = {
          below: { x0: n.x - w / 2, y0: n.y + ring, x1: n.x + w / 2, y1: n.y + ring + h },
          above: { x0: n.x - w / 2, y0: n.y - ring - h, x1: n.x + w / 2, y1: n.y - ring },
          right: { x0: n.x + ring, y0: n.y - h / 2, x1: n.x + ring + w, y1: n.y + h / 2 },
          left: { x0: n.x - ring - w, y0: n.y - h / 2, x1: n.x - ring, y1: n.y + h / 2 },
        };
        const order = [n.lblPos, "below", "above", "right", "left"].filter((v, i, arr) => v && arr.indexOf(v) === i) as string[];
        for (const pos of order) { const b = opts[pos]; if (!overlaps(b, placed) && !nodeHit(b, n, n.kind === "element" ? this.visNodes : hubs)) return { b, pos, lns, withSub }; }
        return c.isFocus ? { b: opts[order[0]], pos: order[0], lns, withSub } : null;
      };
      let fit = tryPlace(lines, !!sub2);
      if (!fit && sub2) fit = tryPlace(lines, false);
      if (!fit && n.kind === "section" && n.n !== undefined) fit = tryPlace([pad(n.n)], false);
      if (!fit) continue;
      placed.push(fit.b); n.lblPos = fit.pos; n.lblShown = true;
      ctx.globalAlpha = c.on ? 1 : state.mode === "simple" && isHub ? 0.55 : 0.35;
      ctx.font = font; ctx.lineWidth = 3 / k; ctx.strokeStyle = P.bg; ctx.lineJoin = "round";
      ctx.fillStyle = n.kind === "group" ? this.color(n.value) : c.on ? P.ink : P.dim;
      const cx = (fit.b.x0 + fit.b.x1) / 2;
      ctx.textAlign = fit.pos === "right" ? "left" : fit.pos === "left" ? "right" : "center";
      const tx = fit.pos === "right" ? fit.b.x0 + 2 / k : fit.pos === "left" ? fit.b.x1 - 2 / k : cx;
      ctx.textBaseline = "top";
      fit.lns.forEach((l, i) => { const y = fit!.b.y0 + i * lh; ctx.strokeText(l, tx, y); ctx.fillText(l, tx, y); });
      if (fit.withSub) { ctx.font = subFont; ctx.fillStyle = P.faint; const y = fit.b.y0 + fit.lns.length * lh + subSize * 0.15; ctx.strokeText(sub2!, tx, y); ctx.fillText(sub2!, tx, y); }
      ctx.textBaseline = "alphabetic";
    }
    ctx.globalAlpha = 1;
  }

  /* ── interacción ─────────────────────────────────────────────── */
  toWorld(px: number, py: number) { return { x: (px - this.view.x) / this.view.k, y: (py - this.view.y) / this.view.k }; }
  nodeAt(px: number, py: number): VNode | null {
    const p = this.toWorld(px, py);
    for (let i = this.visNodes.length - 1; i >= 0; i--) { const n = this.visNodes[i], dx = p.x - n.x, dy = p.y - n.y, r = n.r + 5; if (dx * dx + dy * dy < r * r) return n; }
    return null;
  }
  private bindPointer() {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); c.setPointerCapture(e.pointerId);
      if (this.pointers.size === 2) { const [p1, p2] = [...this.pointers.values()]; this.pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), k: this.view.k, cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2 }; this.dragNode = null; this.panning = false; return; }
      const n = this.nodeAt(e.clientX, e.clientY);
      if (n) { this.dragNode = n; this.alpha = Math.max(this.alpha, 0.25); } else { this.panning = true; c.classList.add("dragging"); }
      this.last = this.downAt = { x: e.clientX, y: e.clientY };
    });
    c.addEventListener("pointermove", (e) => {
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.pointers.size === 2) { const [p1, p2] = [...this.pointers.values()]; this.zoomAt(this.pinch.cx, this.pinch.cy, this.pinch.k * Math.hypot(p1.x - p2.x, p1.y - p2.y) / this.pinch.d); return; }
      if (this.dragNode) { const p = this.toWorld(e.clientX, e.clientY); this.dragNode.x = p.x; this.dragNode.y = p.y; this.dragNode.vx = this.dragNode.vy = 0; this.alpha = Math.max(this.alpha, 0.2); }
      else if (this.panning && this.last) { this.view.x += e.clientX - this.last.x; this.view.y += e.clientY - this.last.y; this.last = { x: e.clientX, y: e.clientY }; }
      else if (e.pointerType === "mouse") { this.hovered = this.nodeAt(e.clientX, e.clientY); c.style.cursor = this.hovered ? "pointer" : "grab"; }
    });
    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId); if (this.pointers.size < 2) this.pinch = null;
      const moved = this.downAt ? Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) : 99;
      if (moved < 5) {
        const n = this.nodeAt(e.clientX, e.clientY);
        if (n) {
          if (state.mode === "simple" && (n.kind === "section" || n.kind === "source") && !state.expanded.has(n.id)) this.cb.onSimpleOpen(n);
          else this.cb.onSelect(n);
        } else if (!this.dragNode && this.selected) this.cb.onEmptyClick();
      }
      this.dragNode = null; this.panning = false; this.last = null; this.downAt = null; c.classList.remove("dragging");
    };
    c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
    c.addEventListener("pointerleave", () => { this.hovered = null; });
    c.addEventListener("wheel", (e) => { e.preventDefault(); this.zoomAt(e.clientX, e.clientY, this.view.k * (e.deltaY < 0 ? 1.1 : 0.9)); }, { passive: false });
  }
  zoomAt(px: number, py: number, k: number) { k = Math.min(3.5, Math.max(0.25, k)); const p = this.toWorld(px, py); this.view.x = px - p.x * k; this.view.y = py - p.y * k; this.view.k = k; }
  fit() {
    if (!this.visNodes.length) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of this.visNodes) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); }
    const A = this.graphArea(), padY = 70, padX = 150;
    const k = Math.min(1.4, Math.max(0.25, Math.min((A.x1 - A.x0 - padX * 2) / (maxX - minX || 1), (A.y1 - A.y0 - padY * 2) / (maxY - minY || 1))));
    this.view.k = k; this.view.x = (A.x0 + A.x1) / 2 - ((minX + maxX) / 2) * k; this.view.y = (A.y0 + A.y1) / 2 - ((minY + maxY) / 2) * k;
  }
  centerOn(n: VNode) { const A = this.graphArea(); this.view.x = (A.x0 + A.x1) / 2 - n.x * this.view.k; this.view.y = (A.y0 + A.y1) / 2 - n.y * this.view.k; }
  get modelRef() { return this.model; }
}
