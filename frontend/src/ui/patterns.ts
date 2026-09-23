/** Pestaña Patrones: relaciones que no se ven a simple vista, propuestas por el modelo de atención entrenado en el
 *  navegador. Cada hallazgo se puede agregar al grafo como propuesta (nunca como hecho) o descartar. */
import type { App } from "../app";
import { esc, fmtNum } from "../lib/text";
import { trainLatent, type LatentResult } from "../analysis/latent";
import { local, recordReview } from "../project_local";
import type { AgfEdge } from "../types";

export const patternsState = { result: null as LatentResult | null, running: false, error: "", added: new Set<string>(), dismissed: new Set<string>(), seed: 7 };

const key = (a: string, b: string) => [a, b].sort().join("|");

export function renderPatrones(app: App): string {
  const r = patternsState.result, m = app.model;
  const name = (id: string) => m.agfNode.get(id)?.name || id;
  const chip = (id: string) => { const n = m.agfNode.get(id); return n ? app.chipAgf(n) : esc(id); };
  const intro = `
    <div class="eyebrow">Patrones · relaciones no evidentes</div>
    <h2>¿Qué relaciones no se ven a simple vista?</h2>
    <p>El Atlas entrena aquí mismo, en tu navegador, un pequeño modelo de atención (la misma idea que usan los transformers) que aprende a predecir qué datos suelen estar conectados. Con eso propone relaciones que no están escritas en los documentos, agrupa los datos en comunidades, ordena flujos de fechas y detecta datos que parecen estar en la sección equivocada.</p>
    <div class="note-box">Trabaja solo con la metadata (nombres, tipos, secciones y relaciones), nunca con datos de pacientes. Todo lo que muestra es una <b>hipótesis con puntaje</b>: revísala antes de usarla.</div>
    <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin:.6rem 0"><button class="btn-primary" id="pt-run" ${patternsState.running ? "disabled" : ""}>${r ? "Volver a buscar" : "Buscar patrones ocultos"}</button>${r ? `<button class="btn" id="pt-add-all">Agregar al grafo las ${r.pairs.filter((p) => !patternsState.added.has(key(p.a, p.b)) && !patternsState.dismissed.has(key(p.a, p.b))).length} relaciones pendientes</button>` : ""}</div>
    ${patternsState.running ? `<p><em>Entrenando el modelo… (unos segundos)</em></p>` : ""}
    ${patternsState.error ? `<div class="alert"><b>Error.</b> ${esc(patternsState.error)}</div>` : ""}`;
  if (!r) return intro + `<p style="font-size:.76rem">Funciona mejor con un proyecto de varias fuentes o un documento con muchas variables.</p>`;
  const t = r.training;
  const pending = r.pairs.filter((p) => !patternsState.dismissed.has(key(p.a, p.b)));
  return intro + `
    <dl class="kv"><dt>Nodos</dt><dd>${t.nodes}</dd><dt>Relaciones usadas</dt><dd>${t.edges}</dd><dt>Entrenamiento</dt><dd>${t.epochs} épocas · pérdida ${fmtNum(t.lossStart, 3)} → ${fmtNum(t.lossEnd, 3)} · ${t.ms} ms</dd><dt>Prueba ciega</dt><dd>${t.holdoutAuc === null ? "sin pares retenidos (pocas relaciones)" : `acierta el ${Math.round(t.holdoutAuc * 100)} % de las veces al distinguir un enlace real oculto de uno al azar`}</dd></dl>
    <h3>Relaciones latentes · ${pending.length}</h3>
    <p style="font-size:.76rem">Pares de datos sin relación registrada que el modelo considera conectados. Al agregarlas quedan como propuestas «latentes» en la capa Relaciones latentes.</p>
    ${pending.map((p) => { const k = key(p.a, p.b), added = patternsState.added.has(k); return `<div class="rel-row"><div class="names">${chip(p.a)}<span class="conf">↔</span>${chip(p.b)}</div>
      <div class="acts">${added ? `<span class="tag validated">agregada</span>` : `<button class="btn" data-pt-add="${esc(k)}" title="Agregar como propuesta">＋</button><button class="btn" data-pt-dismiss="${esc(k)}" title="Descartar">✕</button>`}</div>
      <div class="meta">puntaje ${fmtNum(p.score, 2)} · ${esc(p.why)}${p.sameSource ? "" : " · entre fuentes distintas"}</div></div>`; }).join("") || "<p>Sin pares por encima del umbral.</p>"}
    <h3>Comunidades · ${r.communities.length}</h3>
    <p style="font-size:.76rem">Grupos de datos que el modelo ve juntos, más allá de la sección en que están escritos. El nombre son sus palabras más frecuentes.</p>
    ${r.communities.map((c) => `<div class="type-card"><div class="hd"><b>${esc(c.label)}</b><span class="ct">${c.members.length} datos · cohesión ${fmtNum(c.cohesion, 2)}</span></div><div class="chips" style="margin-top:.4rem">${c.members.slice(0, 30).map(chip).join("")}${c.members.length > 30 ? `<span class="chip">+${c.members.length - 30}</span>` : ""}</div></div>`).join("")}
    ${r.flows.length ? `<h3>Flujos de fechas · ${r.flows.length}</h3><p style="font-size:.76rem">Secuencias en el orden del documento. Los pasos marcados como predichos no tienen una relación de cronología registrada; el puntaje indica cuánto los une el modelo.</p>${r.flows.map((f) => `<div class="path"><div class="step"><span class="rel">${esc(f.label)}</span>${f.steps.map((s, i) => `<span>${i ? `<span class="conf"> → ${s.predicted ? "predicho " + fmtNum(s.score, 2) : "registrado"} → </span>` : ""}${chip(s.id)}</span>`).join("")}</div></div>`).join("")}` : ""}
    ${r.relocations.length ? `<h3>Posibles reubicaciones · ${r.relocations.length}</h3><p style="font-size:.76rem">Datos que el modelo sitúa más cerca de otra sección que de la suya. Puede indicar una variable mal ubicada o una sección con alcance difuso.</p>${r.relocations.map((x) => `<div class="rel-row"><div class="names">${chip(x.id)}<span class="conf">de ${esc(name(x.from))} hacia</span>${chip(x.to)}</div><div class="meta">margen ${fmtNum(x.margin, 2)}</div></div>`).join("")}` : ""}
    <p style="font-size:.74rem">Semilla ${t.seed}, dimensión ${t.dim}. Con la misma semilla el resultado se repite; cambia la semilla al volver a buscar para contrastar.</p>`;
}

export function afterPatrones(app: App) {
  const body = app.body;
  body.querySelector("#pt-run")?.addEventListener("click", () => {
    patternsState.running = true; patternsState.error = ""; app.renderTab();
    setTimeout(() => {
      try { patternsState.result = trainLatent(app.agf, { seed: patternsState.seed++ }); }
      catch (e) { patternsState.error = String((e as Error).message || e); }
      patternsState.running = false; app.renderTab();
    }, 30);
  });
  const add = (k: string) => {
    const p = patternsState.result?.pairs.find((x) => key(x.a, x.b) === k); if (!p || patternsState.added.has(k)) return;
    const id = "lt" + (app.agf.edges.filter((e) => e.id?.startsWith("lt")).length + 1);
    const e: AgfEdge = { id, kind: "relates", source: p.a, target: p.b, predicate: "latent", layer: "latent", origin: "inferred", status: "proposed", confidence: p.score, rationale: `modelo de atención: ${p.why}` };
    app.agf.edges.push(e); patternsState.added.add(k);
    if (local.project) void recordReview("edge", `relates|${p.a}|${p.b}`, "validated").then(() => undefined);
  };
  body.querySelectorAll<HTMLElement>("[data-pt-add]").forEach((b) => b.addEventListener("click", () => { add(b.dataset.ptAdd!); app.rebuildModel(false); app.renderTab(); app.toast("Relación agregada como propuesta (capa Relaciones latentes)."); }));
  body.querySelectorAll<HTMLElement>("[data-pt-dismiss]").forEach((b) => b.addEventListener("click", () => { patternsState.dismissed.add(b.dataset.ptDismiss!); app.renderTab(); }));
  body.querySelector("#pt-add-all")?.addEventListener("click", () => {
    let n = 0; for (const p of patternsState.result?.pairs || []) { const k = key(p.a, p.b); if (!patternsState.added.has(k) && !patternsState.dismissed.has(k)) { add(k); n++; } }
    app.rebuildModel(false); app.renderTab(); app.toast(`${n} relaciones latentes agregadas como propuestas.`);
  });
}
