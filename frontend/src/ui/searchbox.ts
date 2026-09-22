/** Búsqueda híbrida en la barra superior: resultados agrupados con explicación y navegación por teclado. */
import type { App } from "../app";
import { esc } from "../lib/text";
import { facetValue, UNCLASSIFIED } from "../profile";
import { state } from "../state";
import type { Hit } from "../search/search";

export function initSearch(app: App) {
  const input = document.getElementById("search") as HTMLInputElement;
  const box = document.getElementById("search-results") as HTMLElement;
  let hits: Hit[] = [], active = -1, timer = 0;
  const hide = () => { box.hidden = true; input.setAttribute("aria-expanded", "false"); active = -1; };
  const kindLabel: Record<string, string> = { element: "dato", section: "sección", vocabulary: "terminología", source: "fuente" };
  const render = () => {
    if (!hits.length) { box.innerHTML = `<div class="sr-head">Sin resultados</div>`; box.hidden = false; return; }
    const groups: Record<string, Hit[]> = {};
    for (const h of hits) (groups[h.node.kind] = groups[h.node.kind] || []).push(h);
    box.innerHTML = Object.entries(groups).map(([k, list]) => `<div class="sr-head">${esc(kindLabel[k] || k)}${k === "element" ? "s" : ""}</div>` + list.map((h) => {
      const i = hits.indexOf(h), n = h.node;
      const v = app.model.valueMap.get(facetValue(n, state.groupBy)) || UNCLASSIFIED;
      const where = n.kind === "element" ? [app.model.agfNode.get(n.section_id || "")?.name, app.agf.sources.length > 1 ? app.sourceName(n.source_id || "") : null].filter(Boolean).join(" · ") : "";
      return `<div class="sr ${i === active ? "active" : ""}" data-i="${i}" role="option"><i style="background:${n.kind === "element" ? app.graph.color(v) : "var(--hub)"}"></i><span>${esc(n.name)}${where ? `<span class="sub">${esc(where)}</span>` : ""}</span><span class="k">${esc(h.why)}</span></div>`;
    }).join("")).join("");
    box.hidden = false; input.setAttribute("aria-expanded", "true");
  };
  const run = async () => {
    const q = input.value.trim();
    state.query = q; app.updateStatus();
    if (!q) { hide(); return; }
    hits = await app.index!.search(q, 14);
    active = hits.length ? 0 : -1;
    render();
  };
  input.addEventListener("input", () => { window.clearTimeout(timer); timer = window.setTimeout(run, 120); });
  input.addEventListener("focus", () => { if (input.value.trim()) run(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(hits.length - 1, active + 1); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); render(); }
    else if (e.key === "Enter") { const h = hits[active] || hits[0]; if (h) { app.selectById(h.node.id); hide(); } }
    else if (e.key === "Escape") { input.value = ""; state.query = ""; app.updateStatus(); hide(); }
  });
  box.addEventListener("mousedown", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(".sr[data-i]"); if (!el) return;
    e.preventDefault(); const h = hits[+el.dataset.i!]; if (h) { app.selectById(h.node.id); hide(); }
  });
  document.addEventListener("click", (e) => { if (!(e.target as HTMLElement).closest(".searchbox")) hide(); });
}
