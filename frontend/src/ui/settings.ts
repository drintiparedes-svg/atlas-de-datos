/** Panel Ajustes: ámbito, vista, agrupar por, filtros de valores, capas, fuerzas, leyenda de formas. */
import type { App } from "../app";
import { esc } from "../lib/text";
import { LAYER_LABEL, type View } from "../model";
import { on, state } from "../state";

const VIEW_HINT: Record<View, string> = {
  estructura: "Fiel al documento: raíz → secciones → subsecciones → elementos. El color de cada elemento indica el valor de la faceta activa.",
  combinada: "Mantiene las secciones y agrupa dentro de cada una la metadata por la faceta activa. Los nodos de faceta globales enlazan todos los grupos.",
  tipo: "Catálogo de metadata: cada elemento cuelga del valor de su faceta. Útil para definir reglas de validación por tipo.",
};

export function initSettings(app: App) {
  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  const settings = $("settings");
  $("btn-settings").addEventListener("click", (e) => { settings.hidden = !settings.hidden; (e.currentTarget as HTMLElement).setAttribute("aria-expanded", String(!settings.hidden)); });
  document.querySelectorAll<HTMLButtonElement>(".seg button[data-view]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.view === state.view) return;
    app.remember(); app.setView(b.dataset.view as View); app.rebuild(); setTimeout(() => app.graph.fit(), 900);
  }));
  document.querySelectorAll<HTMLButtonElement>(".modeseg button[data-mode]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.mode === state.mode) return;
    app.remember(); app.setMode(b.dataset.mode as "simple" | "detalle");
  }));
  document.querySelectorAll<HTMLButtonElement>(".modeseg button[data-aud]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.aud === state.audience) return;
    app.remember(); app.setAudience(b.dataset.aud as "explorar" | "experto");
  }));
  $("btn-expand-all").addEventListener("click", () => { app.remember(); for (const s of app.model.sections) state.expanded.add(s.id); app.rebuild(); setTimeout(() => app.graph.fit(), 900); });
  $("btn-collapse-all").addEventListener("click", () => { app.remember(); state.expanded.clear(); app.rebuild(); setTimeout(() => app.graph.fit(), 600); });
  const gb = $("group-by") as HTMLSelectElement;
  gb.addEventListener("change", () => app.setGroupBy(gb.value));
  $("type-filters").addEventListener("change", (e) => {
    const t = (e.target as HTMLInputElement).dataset.value; if (!t) return;
    (e.target as HTMLInputElement).checked ? state.values.add(t) : state.values.delete(t); app.rebuild();
  });
  $("layer-filters").addEventListener("change", (e) => {
    const l = (e.target as HTMLInputElement).dataset.layer; if (!l) return;
    (e.target as HTMLInputElement).checked ? state.layers.add(l) : state.layers.delete(l); app.rebuild();
  });
  ($("labels-all") as HTMLInputElement).addEventListener("change", (e) => { state.labelsAll = (e.target as HTMLInputElement).checked; });
  const rep = $("f-rep") as HTMLInputElement, len = $("f-len") as HTMLInputElement;
  rep.addEventListener("input", () => { state.rep = +rep.value; $("o-rep").textContent = rep.value; app.graph.alpha = Math.max(app.graph.alpha, 0.5); });
  rep.addEventListener("change", () => setTimeout(() => app.graph.fit(), 700));
  len.addEventListener("input", () => { state.len = +len.value; $("o-len").textContent = state.len.toFixed(2).replace(".", ",") + "×"; app.graph.alpha = Math.max(app.graph.alpha, 0.5); });
  len.addEventListener("change", () => setTimeout(() => app.graph.fit(), 700));
  $("btn-fit").addEventListener("click", () => app.graph.fit());
  $("btn-theme").addEventListener("click", () => app.toggleTheme());
  $("scope-box").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-scope]"); if (!b) return;
    const s = b.dataset.scope!;
    app.setScope(s === "project" ? { level: "project" } : { level: "source", sourceId: s });
    app.tab = "nota"; app.renderTab();
  });
  on("loaded", () => sync(app));
  on("model", () => sync(app));
  on("settings", () => sync(app));
}

export function sync(app: App) {
  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  const m = app.model, p = app.pv.p;
  // ámbito
  const multi = app.agf.sources.length > 1;
  $("scope-title").hidden = !multi; $("scope-box").hidden = !multi;
  if (multi) $("scope-box").innerHTML = `<button data-scope="project" class="${state.scope.level === "project" ? "on" : ""}">Proyecto</button>` +
    app.agf.sources.map((s) => `<button data-scope="${esc(s.id)}" class="${state.scope.level === "source" && state.scope.sourceId === s.id ? "on" : ""}" title="${esc(s.name)}">${esc(s.title || s.name)}</button>`).join("");
  // vista
  document.querySelectorAll<HTMLButtonElement>(".seg button[data-view]").forEach((b) => { b.classList.toggle("on", b.dataset.view === state.view); b.disabled = state.mode === "simple" || m.isProject; });
  $("view-lock").textContent = state.mode === "simple" ? "· fija en simplificada" : m.isProject ? "· interconexión" : "";
  $("simple-tools").hidden = state.mode !== "simple";
  $("view-hint").textContent = state.mode === "simple"
    ? (m.isProject ? "Mapa del proyecto: cada fuente muestra un anillo con su composición. Haz clic en una fuente para ver sus elementos puente, o ábrela desde su nota para ver su grafo completo."
      : "Versión simplificada: solo las secciones, con un anillo que muestra su composición por la faceta activa. Haz clic en una sección para abrirla y ver su metadata agrupada.")
    : m.isProject ? "Interconexión: fuentes en el anillo exterior y, al centro, los elementos que dos o más fuentes comparten (equivalencias propuestas)." : VIEW_HINT[state.view];
  // agrupar por
  const gb = $("group-by") as HTMLSelectElement;
  gb.innerHTML = app.pv.groupableFacets().map((f) => `<option value="${esc(f)}" ${f === state.groupBy ? "selected" : ""}>${esc(app.pv.facetLabel(f))}</option>`).join("");
  $("facet-note").textContent = app.pv.facet(state.groupBy)?.note || "";
  $("type-filters").innerHTML = m.values.map((v) => `
    <label class="row"><input type="checkbox" data-value="${esc(v)}" ${state.values.has(v) ? "checked" : ""}><span class="dot" style="background:${app.graph.color(v)}"></span>${esc(m.labelValue(v))}<span class="n">${m.isProject ? m.allElements().filter((e) => (m.valueMap.get((e.facets?.[state.groupBy] as string) || "sin_clasificar") || "sin_clasificar") === v).length : m.countValue(v)}</span></label>`).join("");
  // capas
  $("layer-filters").innerHTML = m.layers.map((l) => `<label class="row"><input type="checkbox" data-layer="${esc(l)}" ${state.layers.has(l) ? "checked" : ""}> ${esc(LAYER_LABEL[l])} <span class="n">${m.layerCount[l] || 0}</span></label>`).join("") || `<p class="view-hint">Sin capas transversales en este ámbito.</p>`;
  // fuerzas
  const rep = $("f-rep") as HTMLInputElement, len = $("f-len") as HTMLInputElement;
  rep.min = String(p.layout.separar.min); rep.max = String(p.layout.separar.max); rep.value = String(state.rep); $("o-rep").textContent = String(state.rep);
  len.min = String(p.layout.distancia.min); len.max = String(p.layout.distancia.max); len.value = String(state.len); $("o-len").textContent = state.len.toFixed(2).replace(".", ",") + "×";
  // leyenda
  const c0 = app.graph.color(m.values[0] || ""), c1 = app.graph.color(m.values[1] || m.values[0] || "");
  $("shape-key").innerHTML = `
    ${multi ? `<span><svg width="14" height="14" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" rx="3" fill="var(--hub)"/></svg>Fuente (documento)</span>` : ""}
    <span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="var(--hub)"/></svg>Sección / subsección</span>
    <span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="${c1}" stroke-width="2"/></svg>Grupo de metadata (valor × sección)</span>
    <span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="4" fill="${c0}"/></svg>Elemento (color = ${esc(app.pv.facetLabel(state.groupBy).toLowerCase())})</span>
    <span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="4" fill="${c0}"/><circle cx="7" cy="7" r="1.6" fill="var(--bg)"/></svg>Elemento validado</span>
    <span><svg width="14" height="14" aria-hidden="true"><rect x="3" y="3" width="8" height="8" transform="rotate(45 7 7)" fill="var(--accent)"/></svg>Terminología / estándar</span>`;
}
