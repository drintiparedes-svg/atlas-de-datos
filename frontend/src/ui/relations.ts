/** Pestaña Relaciones: camino entre dos datos, equivalencias propuestas (revisión), referencias y parecidos. */
import type { App } from "../app";
import { esc, fmtNum, norm } from "../lib/text";
import { LAYER_LABEL } from "../model";
import { shortestPath } from "../search/search";
import type { AgfEdge } from "../types";
import { apiClient, projectsState } from "./projects";

export const relState = { a: "", b: "", filter: "proposed" as "proposed" | "all" };

const KIND_LABEL: Record<string, string> = { same_as: "equivale a", references: "referencia a", relates: "se parece a", precedes: "antes de", derived_from: "derivado de", coded_with: "codificado con", contains: "contiene", shares: "comparte datos con", mentions: "menciona" };

export function renderRelaciones(app: App): string {
  const agf = app.agf, m = app.model;
  const status = (e: AgfEdge) => app.reviewed.get(e.id || "") || e.status || "validated";
  const same = agf.edges.filter((e) => e.kind === "same_as");
  const refs = agf.edges.filter((e) => e.kind === "references");
  const pending = same.filter((e) => status(e) === "proposed");
  const list = relState.filter === "proposed" ? pending : same;
  const nameOf = (id: string) => m.agfNode.get(id)?.name || id;
  const row = (e: AgfEdge) => {
    const a = m.agfNode.get(e.source), b = m.agfNode.get(e.target); if (!a || !b) return "";
    const st = status(e);
    return `<div class="rel-row"><div class="names">${app.chipAgf(a)}<span class="conf">${esc(KIND_LABEL[e.kind] || e.kind)}</span>${app.chipAgf(b)}</div>
      <div class="acts">${st === "proposed" ? `<button class="btn" data-review="validated" data-edge="${esc(e.id || "")}" title="Aceptar">✓</button><button class="btn" data-review="rejected" data-edge="${esc(e.id || "")}" title="Rechazar">✕</button>` : `<span class="tag ${esc(st)}">${st === "validated" ? "validado" : st === "rejected" ? "rechazado" : "propuesto"}</span>`}</div>
      <div class="meta">${e.confidence !== undefined ? `confianza ${fmtNum(e.confidence, 2)} · ` : ""}${esc(e.rationale || "")}</div></div>`;
  };
  const path = relState.a && relState.b ? shortestPath(agf.edges, relState.a, relState.b) : null;
  const options = agf.nodes.filter((n) => n.kind === "element" || n.kind === "section").map((n) => `<option value="${esc(n.name)}${agf.sources.length > 1 && n.source_id ? " (" + esc(app.sourceName(n.source_id)) + ")" : ""}"></option>`).join("");
  return `
    <div class="eyebrow">Relaciones</div>
    <h2>¿Cómo se relacionan dos datos?</h2>
    <p>Elige dos datos. El Atlas busca el camino más corto que prefiere relaciones con significado (cronología, equivalencias, referencias, parecidos) sobre la simple pertenencia a una sección.</p>
    <datalist id="node-options">${options}</datalist>
    <div class="pick">
      <input id="path-a" list="node-options" placeholder="Primer dato (p. ej. Fecha de nacimiento)" value="${esc(relState.a ? nameOf(relState.a) : "")}" autocomplete="off">
      <input id="path-b" list="node-options" placeholder="Segundo dato (p. ej. Fecha de defunción)" value="${esc(relState.b ? nameOf(relState.b) : "")}" autocomplete="off">
      <div style="display:flex;gap:.35rem"><button class="btn-primary" id="path-go">Buscar el camino</button>${app.selected && app.selected.agf ? `<button class="btn" id="path-use-sel">Usar el nodo seleccionado</button>` : ""}</div>
    </div>
    ${relState.a && relState.b ? (path ? `<div class="path">${path.map((s) => { const e = s.edge; const st = status(e); return `<div class="step"><span>${app.chipAgf(m.agfNode.get(s.from)!)} <span class="rel">${esc(KIND_LABEL[e.kind] || e.kind)}${e.predicate ? " · " + esc(e.predicate) : ""}</span> ${app.chipAgf(m.agfNode.get(s.to)!)}</span><span class="why">${esc(LAYER_LABEL[({ coded_with: "std", precedes: "time", same_as: "link", references: "ref", relates: "sim", derived_from: "derived" } as Record<string, string>)[e.kind]] || (e.kind === "contains" ? "pertenencia (estructura del documento)" : e.kind))} · ${st === "validated" ? "validado" : st === "proposed" ? "propuesto" : st}${e.confidence !== undefined ? " · " + fmtNum(e.confidence, 2) : ""}${e.rationale ? " · " + esc(e.rationale) : ""}</span></div>`; }).join("")}</div><p style="font-size:.76rem">${path.length} pasos. Los pasos «propuestos» aún no fueron validados por una persona.</p>` : `<div class="alert"><b>Sin camino.</b> No hay una cadena de relaciones registradas entre estos dos datos en el grafo actual.</div>`) : ""}
    <h3>Equivalencias entre fuentes · ${same.length} <span class="conf">(${pending.length} por revisar)</span></h3>
    <p>Propuestas por nombre normalizado, similitud léxica y vectores. Nunca se fusionan nodos: aceptar crea una equivalencia validada; rechazar la conserva en auditoría.</p>
    <div class="chips" style="margin-bottom:.5rem"><button class="chip" data-relfilter="proposed" ${relState.filter === "proposed" ? 'style="border-color:var(--accent);color:var(--ink)"' : ""}>Por revisar</button><button class="chip" data-relfilter="all" ${relState.filter === "all" ? 'style="border-color:var(--accent);color:var(--ink)"' : ""}>Todas</button>${pending.length ? `<button class="chip" id="accept-exact" title="Acepta solo las propuestas con nombre normalizado idéntico">Aceptar las de nombre idéntico (${pending.filter((e) => e.rationale?.startsWith("nombre normalizado")).length})</button>` : ""}${app.reviewed.size ? `<button class="chip" id="download-reviewed">Descargar AGF con la revisión (${app.reviewed.size})</button>` : ""}</div>
    ${list.length ? list.map(row).join("") : `<p>${same.length ? "Todo revisado." : agf.sources.length > 1 ? "Sin equivalencias propuestas." : "Con una sola fuente no hay equivalencias entre fuentes. Carga otra fuente en la pestaña Fuentes."}</p>`}
    ${refs.length ? `<h3>Referencias y llaves foráneas · ${refs.length}</h3>${refs.map(row).join("")}` : ""}
    <h3>Otras capas</h3>
    <dl class="kv">${Object.entries(m.layerCount).map(([l, k]) => `<dt>${esc(LAYER_LABEL[l] || l)}</dt><dd>${k}</dd>`).join("") || "<dd>Sin capas en este ámbito.</dd>"}</dl>`;
}

export function afterRelaciones(app: App) {
  const body = app.body, m = app.model;
  const resolve = (text: string) => {
    const t = norm(text.replace(/\s*\([^)]*\)\s*$/, ""));
    if (!t) return "";
    const exact = app.agf.nodes.filter((n) => (n.kind === "element" || n.kind === "section") && norm(n.name) === t);
    if (exact.length === 1) return exact[0].id;
    if (exact.length > 1) {
      const src = norm(text.match(/\(([^)]*)\)\s*$/)?.[1] || "");
      return (exact.find((n) => norm(app.sourceName(n.source_id || "")) === src) || exact[0]).id;
    }
    const partial = app.agf.nodes.find((n) => (n.kind === "element" || n.kind === "section") && norm(n.name).includes(t));
    return partial?.id || "";
  };
  const go = () => {
    relState.a = resolve((body.querySelector("#path-a") as HTMLInputElement).value);
    relState.b = resolve((body.querySelector("#path-b") as HTMLInputElement).value);
    if (!relState.a || !relState.b) { app.toast("No encuentro uno de los dos datos; elige un nombre de la lista."); return; }
    app.renderTab();
  };
  body.querySelector("#path-go")?.addEventListener("click", go);
  body.querySelectorAll<HTMLInputElement>("#path-a, #path-b").forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); }));
  body.querySelector("#path-use-sel")?.addEventListener("click", () => {
    const id = app.selected?.agf?.id; if (!id) return;
    if (!relState.a) relState.a = id; else relState.b = id;
    app.renderTab();
  });
  body.querySelector("#accept-exact")?.addEventListener("click", () => {
    let k = 0;
    for (const e of app.agf.edges) if (e.kind === "same_as" && e.status === "proposed" && e.rationale?.startsWith("nombre normalizado") && !app.reviewed.has(e.id || "")) { app.reviewed.set(e.id!, "validated"); e.status = "validated"; k++; }
    app.toast(`${k} equivalencias aceptadas en esta sesión. Descarga el AGF para conservarlas.`);
    app.rebuildModel(false); app.renderTab();
  });
  body.querySelector("#download-reviewed")?.addEventListener("click", () => downloadAgf(app));
  void m;
}

export function applyReview(app: App, edgeId: string, decision: "validated" | "rejected") {
  const e = app.agf.edges.find((x) => x.id === edgeId); if (!e) return;
  app.reviewed.set(edgeId, decision); e.status = decision;
  (e as AgfEdge & { reviewed_at?: string }).reviewed_at = new Date().toISOString();
  app.rebuildModel(false); app.renderTab();
  const api = apiClient(), cur = projectsState.current;
  if (api && cur && cur.id === app.agf.project.id) {
    api.reviewEdge(cur.id, edgeId, decision).then(() => app.toast(decision === "validated" ? "Equivalencia aceptada y guardada en el backend (auditoría)." : "Propuesta rechazada y registrada en el backend."))
      .catch((err) => app.toast("No se pudo guardar en el backend: " + (err as Error).message));
    return;
  }
  app.toast(decision === "validated" ? "Equivalencia aceptada (solo en esta sesión hasta descargar el AGF)." : "Propuesta rechazada; se conserva en auditoría.");
}

export function downloadAgf(app: App, name?: string) {
  const blob = new Blob([JSON.stringify(app.agf, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name || `${app.agf.project.id}.agf.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
