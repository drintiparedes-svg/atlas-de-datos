/** Pestaña Inventario: responde «qué tiene la base» (PLAN §9): conteos por faceta, matriz fuente × dominio,
 *  sensibilidad, elementos puente, huérfanos, hallazgos y cobertura de validación. */
import type { App } from "../app";
import { esc, fmtPct } from "../lib/text";
import { facetValue, UNCLASSIFIED } from "../profile";
import { state } from "../state";
import type { AgfNode } from "../types";

function count<T>(items: T[], key: (t: T) => string | null | undefined): [string, number][] {
  const out = new Map<string, number>();
  for (const it of items) { const v = key(it) || UNCLASSIFIED; out.set(v, (out.get(v) || 0) + 1); }
  return [...out.entries()].sort((a, b) => b[1] - a[1]);
}

function bars(app: App, facet: string, rows: [string, number][], total: number, clickable = true) {
  return rows.map(([v, k]) => `<div class="bar-row" ${clickable ? `data-groupby-value="${esc(facet)}|${esc(v)}"` : ""}><span class="lbl">${esc(app.pv.valueLabel(facet, v))}</span><span class="ct">${k} · ${fmtPct(100 * k / (total || 1))}</span><div class="bar"><i style="width:${(100 * k / (total || 1)).toFixed(1)}%;background:${app.pv.color(facet, v === UNCLASSIFIED ? null : v)}"></i></div></div>`).join("");
}

export function renderInventario(app: App): string {
  const agf = app.agf, m = app.model;
  const els = m.allElements();
  const secs = agf.nodes.filter((n) => n.kind === "section");
  const same = agf.edges.filter((e) => e.kind === "same_as" && e.status !== "rejected");
  const srcOf = (id: string) => m.agfNode.get(id)?.source_id;
  const bridge = new Map<string, Set<string>>();
  for (const e of same) for (const [a, b] of [[e.source, e.target], [e.target, e.source]]) (bridge.get(a) || bridge.set(a, new Set([srcOf(a)!])).get(a)!).add(srcOf(b)!);
  const bridges = [...bridge.entries()].filter(([, s]) => s.size >= 2).sort((a, b) => b[1].size - a[1].size);
  const orphans = els.filter((e) => !e.parent_id || !e.facets?.data_type);
  const validated = agf.nodes.filter((n) => n.status === "validated").length;
  const findings = agf.findings || [];
  const uncl = (f: string) => els.filter((e) => !e.facets?.[f]).length;
  const multi = agf.sources.length > 1;
  const domains = app.pv.orderedValues("info_domain", els.map((e) => facetValue(e, "info_domain")));
  const matrix = agf.sources.map((s) => ({ s, row: domains.map((d) => els.filter((e) => e.source_id === s.id && facetValue(e, "info_domain") === d).length) }));
  const sens = count(els, (e) => e.facets?.sensitivity);
  const sensSources = agf.sources.filter((s) => els.some((e) => e.source_id === s.id && (e.facets?.sensitivity === "dato_sensible_salud" || e.facets?.sensitivity === "dato_personal")));
  return `
    <div class="eyebrow">Inventario · ${esc(agf.project.name)}</div>
    <h2>Qué información existe</h2>
    <div class="stat-grid">
      <div class="stat"><b>${agf.sources.length}</b><span>fuente${agf.sources.length === 1 ? "" : "s"}</span></div>
      <div class="stat"><b>${secs.filter((s) => !s.parent_id).length}</b><span>secciones</span></div>
      <div class="stat"><b>${els.length}</b><span>datos</span></div>
      <div class="stat"><b>${same.length}</b><span>equivalencias</span></div>
      <div class="stat"><b>${findings.length}</b><span>hallazgos</span></div>
      <div class="stat"><b>${fmtPct(100 * validated / (agf.nodes.length || 1))}</b><span>validado</span></div>
    </div>
    ${multi ? `<h3>Fuentes por tipo</h3>${bars(app, "source_type", count(agf.sources, (s) => s.facets?.source_type), agf.sources.length, false)}` : ""}
    <h3>Datos por tipo de dato</h3>${bars(app, "data_type", count(els, (e) => e.facets?.data_type), els.length)}
    <h3>Datos por dominio de información</h3>${bars(app, "info_domain", count(els, (e) => e.facets?.info_domain), els.length)}
    <p style="font-size:.74rem">Dominio inferido por léxico; los valores sin clasificar requieren revisión.</p>
    ${multi ? `<h3>Matriz fuente × dominio</h3><div class="mwrap"><table class="matrix"><thead><tr><th></th>${domains.map((d) => `<th title="${esc(app.pv.valueLabel("info_domain", d))}">${esc(app.pv.valueLabel("info_domain", d).slice(0, 6))}</th>`).join("")}<th>total</th></tr></thead><tbody>${matrix.map(({ s, row }) => `<tr><th class="rowh" title="${esc(s.name)}">${esc(s.title || s.name)}</th>${row.map((k, i) => `<td class="cell" style="${k ? `background:${app.pv.color("info_domain", domains[i] === UNCLASSIFIED ? null : domains[i])}${Math.round(40 + 160 * Math.min(1, k / 15)).toString(16).padStart(2, "0")}` : ""}" data-matrix="${esc(s.id)}|${esc(domains[i])}">${k || ""}</td>`).join("")}<td>${row.reduce((a, b) => a + b, 0)}</td></tr>`).join("")}</tbody></table></div>` : ""}
    <h3>Mapa de sensibilidad</h3>${bars(app, "sensitivity", sens, els.length)}
    <div class="note-box">${esc(app.pv.facet("sensitivity")?.note || "")}${sensSources.length ? ` Fuentes con datos personales o de salud: ${sensSources.map((s) => esc(s.title || s.name)).join(", ")}.` : ""}</div>
    ${multi ? `<h3>Datos puente (en 2 o más fuentes) · ${bridges.length}</h3><div class="chips">${bridges.slice(0, 40).map(([id, s]) => `${app.chipAgf(m.agfNode.get(id)!)}<span class="conf">${s.size} fuentes</span>`).join("")}${bridges.length > 40 ? `<span class="chip">+${bridges.length - 40} más</span>` : ""}</div>` : ""}
    <h3>Sin clasificar</h3>
    <dl class="kv"><dt>Tipo de dato</dt><dd>${fmtPct(100 * uncl("data_type") / (els.length || 1))}</dd><dt>Dominio</dt><dd>${fmtPct(100 * uncl("info_domain") / (els.length || 1))}</dd><dt>Sensibilidad</dt><dd>${fmtPct(100 * uncl("sensitivity") / (els.length || 1))}</dd></dl>
    ${orphans.length ? `<h3>Huérfanos · ${orphans.length}</h3><div class="chips">${orphans.slice(0, 30).map((e) => app.chipAgf(e)).join("")}</div>` : ""}
    <h3>Hallazgos abiertos por prioridad</h3>
    <dl class="kv">${["bloqueante", "importante", "menor"].map((p) => `<dt><span class="tag ${p}">${esc(app.pv.p.priorities[p].label)}</span></dt><dd>${findings.filter((f) => f.priority === p && f.status === "open").length}</dd>`).join("")}</dl>
    <h3>Cobertura de validación</h3>
    <dl class="kv">${agf.sources.map((s) => { const ns = agf.nodes.filter((n) => n.source_id === s.id); return `<dt>${esc(s.title || s.name)}</dt><dd>${fmtPct(100 * ns.filter((n) => n.status === "validated").length / (ns.length || 1))}</dd>`; }).join("")}<dt>Total</dt><dd>${fmtPct(100 * validated / (agf.nodes.length || 1))}</dd></dl>
    <p style="font-size:.74rem">Solo lo validado entra a la memoria confiable de los agentes (PLAN §8.1).</p>`;
}

/** Lista de elementos para un valor de faceta o celda de matriz (navegación desde el inventario). */
export function listElements(app: App, title: string, els: AgfNode[]): string {
  return `<div class="eyebrow">Inventario</div><h2>${esc(title)} · ${els.length}</h2><button class="btn" data-go="proyectos">← Volver al inventario</button>
    <div class="chips" style="margin-top:.8rem">${els.map((e) => app.chipAgf(e)).join("") || "<p>Sin elementos.</p>"}</div>`;
}
