/** Enlaces y acciones comunes del panel (wikilinks, chips, filas, revisión, navegación guiada). */
import type { App, Tab } from "../app";
import { facetValue } from "../profile";
import { state } from "../state";
import { listElements } from "./inventory";
import { applyReview, relState } from "./relations";

export function initPanelActions(app: App) {
  const body = app.body;
  body.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const tg = t.closest<HTMLElement>("#toggle-cat");
    if (tg) { const c = app.model.N[tg.dataset.cat!]; if (c) { app.remember(); state.expanded.has(c.id) ? state.expanded.delete(c.id) : state.expanded.add(c.id); app.rebuild(); app.renderTab(); setTimeout(() => app.graph.fit(), 700); } return; }
    const sc = t.closest<HTMLElement>("[data-scope]");
    if (sc) { const s = sc.dataset.scope!; app.setScope(s === "project" ? { level: "project" } : { level: "source", sourceId: s }); app.tab = "nota"; app.renderTab(); return; }
    const go = t.closest<HTMLElement>("[data-go]");
    if (go) { const target = go.dataset.go!; if (target === "search") { (document.getElementById("search") as HTMLInputElement).focus(); return; } app.setTab(target as Tab); return; }
    const gb = t.closest<HTMLElement>("[data-groupby]");
    if (gb) { app.setGroupBy(gb.dataset.groupby!); return; }
    const gv = t.closest<HTMLElement>("[data-groupby-value]");
    if (gv) {
      const [facet, value] = gv.dataset.groupbyValue!.split("|");
      const els = app.model.allElements().filter((n) => facetValue(n, facet) === value);
      app.remember(); app.body.innerHTML = listElements(app, `${app.pv.facetLabel(facet)}: ${app.pv.valueLabel(facet, value)}`, els); return;
    }
    const mx = t.closest<HTMLElement>("[data-matrix]");
    if (mx) {
      const [src, dom] = mx.dataset.matrix!.split("|");
      const els = app.model.allElements().filter((n) => n.source_id === src && facetValue(n, "info_domain") === dom);
      app.remember(); app.body.innerHTML = listElements(app, `${app.sourceName(src)} × ${app.pv.valueLabel("info_domain", dom)}`, els); return;
    }
    const rf = t.closest<HTMLElement>("[data-relfilter]");
    if (rf) { relState.filter = rf.dataset.relfilter as "proposed" | "all"; app.renderTab(); return; }
    const rv = t.closest<HTMLElement>("[data-review]");
    if (rv) { applyReview(app, rv.dataset.edge!, rv.dataset.review as "validated" | "rejected"); return; }
    const el = t.closest<HTMLElement>("[data-id]");
    if (el) app.selectById(el.dataset.id!);
  });
  body.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const el = (e.target as HTMLElement).closest<HTMLElement>("[data-id]"); if (el) app.selectById(el.dataset.id!); }
  });
}
