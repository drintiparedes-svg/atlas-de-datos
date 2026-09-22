/** Pestaña Nota: portada (Explorar / Experto) y notas tipo Obsidian por nodo. */
import type { App } from "../app";
import { esc, fmtNum, pad } from "../lib/text";
import { LAYER_LABEL, type VNode } from "../model";
import { facetOrigin, facetValue, UNCLASSIFIED } from "../profile";
import { state } from "../state";
import type { AgfEdge, AgfNode } from "../types";
import { PUBLIC_DEPLOY } from "./sources";

const EDGE_VERB: Record<string, [string, string]> = {
  precedes: ["Anterior a", "Posterior a"], same_as: ["Equivale a", "Equivale a"], references: ["Referencia a", "Referenciado por"],
  relates: ["Se parece a", "Se parece a"], derived_from: ["Derivado de", "Origen de"], coded_with: ["Codificado con", "Codifica"],
  mentions: ["Menciona", "Mencionado en"], supports: ["Respalda", "Respaldado por"], contradicts: ["Contradice", "Contradicho por"],
};

export function renderNota(app: App): string {
  const n = app.selected;
  if (!n) return state.audience === "explorar" ? intro(app) : introExpert(app);
  switch (n.kind) {
    case "element": return noteElement(app, n);
    case "section": case "source": return n.kind === "source" ? noteSource(app, n) : noteSection(app, n);
    case "sub": return noteSub(app, n);
    case "group": return noteGroup(app, n);
    case "facet": return noteFacet(app, n);
    case "vocab": return noteVocab(app, n);
    default: return noteRoot(app);
  }
}

function stats(app: App) {
  const m = app.model, all = m.allElements();
  const secs = app.agf.nodes.filter((x) => x.kind === "section" && !x.parent_id).length;
  const subs = app.agf.nodes.filter((x) => x.kind === "section" && x.parent_id).length;
  return { all, secs, subs, sources: app.agf.sources.length, findings: (app.agf.findings || []).length, proposed: app.agf.edges.filter((e) => e.kind === "same_as" && e.status === "proposed").length };
}

function intro(app: App): string {
  const s = stats(app), m = app.model;
  const what = m.isProject ? "fuentes" : "secciones";
  return `
    <div class="eyebrow">Explorar · ${esc(app.agf.project.name)}</div>
    <h2>¿Qué información existe y cómo se relaciona?</h2>
    <p>Cada punto del grafo es un dato descrito en los documentos del proyecto. El color indica ${esc(app.pv.facetLabel(state.groupBy).toLowerCase())}; los círculos grandes son ${what}. Empieza por una de estas preguntas:</p>
    <button class="qbtn" data-go="search"><b>Buscar un dato</b><span>Escribe un nombre o una idea («fecha de diagnóstico», «biomarcadores», «comuna»). También encuentra parecidos.</span></button>
    <button class="qbtn" data-go="inventario"><b>¿Qué tipos de información hay?</b><span>Inventario: cuántos datos existen por tipo, dominio y sensibilidad, y qué falta por clasificar.</span></button>
    <button class="qbtn" data-go="relaciones"><b>¿Cómo se relacionan dos datos?</b><span>Elige dos datos y el Atlas muestra el camino que los une y explica cada paso.</span></button>
    <button class="qbtn" data-go="secciones"><b>¿Cómo se organiza el documento?</b><span>Lista de ${what} con su composición.</span></button>
    <button class="qbtn" data-go="traza"><b>¿Qué falta o hay que corregir?</b><span>${s.findings} hallazgos de calidad con prioridad y «qué hacer».</span></button>
    <p style="font-size:.78rem">Muestras: <a class="wl" href="?agf=./data/oncologia.agf.json&aud=explorar">diccionario oncológico</a> · <a class="wl" href="?agf=./data/proyecto_registro.agf.json&aud=explorar">proyecto de 4 fuentes</a>.</p>
    <dl class="kv" style="margin-top:1rem">
      <dt>Fuentes</dt><dd>${s.sources}</dd>
      <dt>Secciones</dt><dd>${s.secs}${s.subs ? ` (+ ${s.subs} subsecciones)` : ""}</dd>
      <dt>Datos</dt><dd>${s.all.length}</dd>
      ${s.proposed ? `<dt>Equivalencias</dt><dd>${s.proposed} propuestas por revisar</dd>` : ""}
    </dl>
    ${app.composition(m.elements.length ? m.elements : s.all.map((e) => ({ value: m.valueMap.get(facetValue(e, state.groupBy)) || UNCLASSIFIED })))}
    <h3>Cómo leerlo</h3>
    <ul class="rules">
      <li>Pasa el cursor por un punto para ver con qué se conecta; haz clic para abrir su nota.</li>
      <li>En el grafo, un clic sobre una ${m.isProject ? "fuente" : "sección"} la abre y muestra sus datos agrupados.</li>
      <li><b>← Atrás</b> vuelve al paso anterior; <b>Inicio</b> regresa a esta portada.</li>
      <li>Los anillos alrededor de un punto marcan hallazgos: rojo = bloqueante, dorado = importante, punteado = menor.</li>
      <li>Lo marcado como <span class="inf" style="color:var(--warn)">inferido</span> fue propuesto por reglas o modelos y aún no está validado.</li>
    </ul>`;
}

function introExpert(app: App): string {
  const s = stats(app), m = app.model;
  return `
    <div class="eyebrow">Propuesta · grafo de conocimiento</div>
    <h2>${esc(app.agf.project.name)}, como red navegable</h2>
    <p>Cada elemento es una nota; cada ${m.isProject ? "fuente" : "sección"}, un nodo central. El color identifica ${esc(app.pv.facetLabel(state.groupBy).toLowerCase())} y los grupos anillados reúnen, dentro de cada ${m.isProject ? "fuente" : "sección"}, la metadata del mismo valor. Cambia la faceta en «Agrupar por»: los grupos se recalculan sin reprocesar.</p>
    <dl class="kv">
      <dt>Fuentes</dt><dd>${s.sources}</dd>
      <dt>Secciones</dt><dd>${s.secs}</dd>
      <dt>Subsecciones</dt><dd>${s.subs}</dd>
      <dt>Elementos</dt><dd>${s.all.length}</dd>
      <dt>Facetas</dt><dd>${app.pv.groupableFacets().length} (${esc(app.pv.facetLabel(state.groupBy))} activa)</dd>
      <dt>Vocabularios</dt><dd>${app.agf.nodes.filter((x) => x.kind === "vocabulary").length} (inferidos)</dd>
      <dt>Hallazgos</dt><dd>${s.findings}</dd>
      ${app.index?.semanticAvailable ? `<dt>Búsqueda</dt><dd>léxica + vectores (${esc(app.index.provider!)} · ${esc(app.index.model)})</dd>` : `<dt>Búsqueda</dt><dd>léxica (sin índice de vectores)</dd>`}
    </dl>
    ${app.composition(m.elements.length ? m.elements : s.all.map((e) => ({ value: m.valueMap.get(facetValue(e, state.groupBy)) || UNCLASSIFIED })))}
    <h3>Cómo leerlo</h3>
    <ul class="rules">
      <li>Pasa el cursor por un nodo para aislar su vecindario; haz clic para abrir su nota.</li>
      <li>Arriba eliges el nivel de detalle: <b>Simplificada</b> (${m.isProject ? "fuentes" : "secciones"}, se abren con un clic) o <b>Detallada</b> (red completa).</li>
      <li>En la versión detallada, cambia de vista en Ajustes: Estructura (fiel al documento), Combinada o Por faceta.</li>
      <li><b>← Atrás</b> (o Alt + ←) vuelve al paso anterior; <b>Inicio</b> regresa a esta portada.</li>
      <li>Activa las capas (terminologías, cronología, equivalencias, referencias, parecidos) para ver relaciones transversales.</li>
      <li>Los anillos alrededor de un nodo indican hallazgos de calidad: rojo = bloqueante, dorado = importante, punteado = menor. El detalle está en Trazabilidad.</li>
      <li>Pestaña <b>Fuentes</b>: carga documentos (docx, csv, xlsx, md, json, sql) sin que salgan de este equipo${PUBLIC_DEPLOY ? " (desactivada en esta versión pública; ver la pestaña)" : ""}.</li>
      <li>Muestras: <a class="wl" href="?agf=./data/oncologia.agf.json">diccionario oncológico</a> · <a class="wl" href="?agf=./data/proyecto_registro.agf.json">proyecto de 4 fuentes</a>.</li>
    </ul>`;
}

function facetLine(app: App, a: AgfNode, facet: string): string {
  const v = facetValue(a, facet);
  if (v === UNCLASSIFIED) return `<span class="v">—</span> <span class="inf"># sin clasificar</span>`;
  const o = facetOrigin(a, facet), c = a.facet_confidence?.[facet], why = a.facet_rationale?.[facet];
  const label = app.pv.valueLabel(facet, v);
  const link = facet === state.groupBy && app.model.N["fv:" + (app.model.valueMap.get(v) || v)] ? app.wl(app.model.N["fv:" + (app.model.valueMap.get(v) || v)], label) : `<span class="v">${esc(label)}</span>`;
  const mark = o === "inferred" ? `<span class="inf"># inferido${c !== undefined ? " · " + fmtNum(c, 2) : ""}${why ? " · " + esc(why) : ""}</span>` : o === "extracted" ? `<span class="ok"># declarado</span>` : o === "manual" ? `<span class="ok"># manual</span>` : "";
  return `${link} ${mark}`;
}

function relationsBlock(app: App, id: string): string {
  const rows: string[] = [];
  for (const e of app.edgesOf(id)) {
    if (e.kind === "contains") continue;
    const outgoing = e.source === id, other = app.model.agfNode.get(outgoing ? e.target : e.source);
    if (!other) continue;
    const verb = (EDGE_VERB[e.kind] || [e.kind, e.kind])[outgoing ? 0 : 1];
    const st = e.status || "validated";
    const conf = e.confidence !== undefined ? ` <span class="conf">${fmtNum(e.confidence, 2)}</span>` : "";
    const rev = app.reviewed.get(e.id || "");
    const status = rev ? rev : st;
    rows.push(`<div class="rel-row"><div class="names"><span>${esc(verb)}${e.predicate ? ` <span class="conf">${esc(e.predicate)}</span>` : ""}</span> ${app.chipAgf(other)}${conf}</div>
      <div class="acts">${status === "proposed" && e.kind !== "precedes" ? `<button class="btn" data-review="validated" data-edge="${esc(e.id || "")}" title="Aceptar la propuesta">✓</button><button class="btn" data-review="rejected" data-edge="${esc(e.id || "")}" title="Rechazar la propuesta">✕</button>` : `<span class="tag ${esc(status)}">${status === "validated" ? "validado" : status === "rejected" ? "rechazado" : "propuesto"}</span>`}</div>
      <div class="meta">${esc(LAYER_LABEL[edgeLayer(e)] || e.kind)}${e.rationale ? " · " + esc(e.rationale) : ""}${other.source_id && other.source_id !== app.model.agfNode.get(id)?.source_id ? " · " + esc(app.sourceName(other.source_id)) : ""}</div></div>`);
  }
  return rows.length ? `<h3>Relaciones · ${rows.length}</h3>${rows.join("")}` : "";
}
function edgeLayer(e: AgfEdge) { return ({ coded_with: "std", precedes: "time", same_as: "link", references: "ref", relates: "sim", derived_from: "derived" } as Record<string, string>)[e.kind] || e.kind; }

function semanticBlock(app: App, id: string): string {
  if (!app.index) return "";
  const linked = new Set(app.edgesOf(id).map((e) => (e.source === id ? e.target : e.source)));
  const nn = app.index.neighbors(id, 6, linked).filter((x) => x.score > 0.35).map((x) => ({ n: app.model.agfNode.get(x.id), s: x.score })).filter((x) => x.n && x.n.kind === "element");
  if (!nn.length) return "";
  return `<h3>Parecidos por nombre y descripción · ${nn.length}</h3><p style="font-size:.76rem">Calculado con vectores ${esc(app.index.provider || "")} (${esc(app.index.model)}); no implica equivalencia.</p><div class="chips">${nn.map((x) => `${app.chipAgf(x.n!)}`).join("")}</div>`;
}

function provenanceBlock(app: App, a: AgfNode): string {
  const p = a.provenance; if (!p) return "";
  const loc = Object.entries(p.locator || {}).map(([k, v]) => `${k} ${v}`).join(", ");
  return `<h3>Procedencia</h3><dl class="kv"><dt>Fuente</dt><dd>${esc(app.sourceName(a.source_id || ""))}</dd>${loc ? `<dt>Ubicación</dt><dd>${esc(loc)}</dd>` : ""}${p.excerpt && p.excerpt !== a.name ? `<dt>Extracto</dt><dd>${esc(p.excerpt)}</dd>` : ""}<dt>Estado</dt><dd><span class="tag ${esc(a.status || "proposed")}">${a.status === "validated" ? "validado" : a.status === "rejected" ? "rechazado" : "propuesto"}</span> origen ${esc(a.origin || "extracted")}</dd></dl>`;
}

function noteElement(app: App, v: VNode): string {
  const a = v.agf!, m = app.model;
  const sec = v.section ? m.N[v.section] : undefined, parent = v.parent ? m.N[v.parent] : undefined;
  const facets = ["element_kind", "data_type", "info_domain", "sensitivity"].filter((f) => app.pv.facet(f));
  const yaml = [
    [m.isProject ? "elemento" : "variable", `<span class="v">${esc(a.name)}</span>`],
    sec ? [sec.kind === "source" ? "fuente" : "seccion", app.wl(sec, m.sectionLabel(sec))] : null,
    parent && parent !== sec ? ["subseccion", app.wl(parent)] : null,
    ...facets.map((f) => [f === "data_type" ? "tipo_dato" : f === "info_domain" ? "dominio" : f === "sensitivity" ? "sensibilidad" : "tipo_elemento", facetLine(app, a, f)]),
    a.facets?.vocabulary ? ["estandar", m.N[`voc:${a.facets.vocabulary}`] ? `${app.wl(m.N[`voc:${a.facets.vocabulary}`])} ${a.facet_origin?.vocabulary === "inferred" ? '<span class="inf"># inferido</span>' : ""}` : `<span class="v">${esc(a.facets.vocabulary)}</span>`] : ["estandar", `<span class="v">—</span>`],
    a.native_type ? ["tipo_nativo", `<span class="v">${esc(a.native_type)}${a.nullable === false ? " NOT NULL" : ""}${a.key ? " · " + esc(a.key) + " key" : ""}</span>`] : null,
    ["fuente", `<span class="v">${esc(app.sourceName(a.source_id || ""))}</span>`],
    ["validacion", a.status === "validated" ? `<span class="ok">validado</span>` : `<span class="inf">pendiente</span>`],
  ].filter(Boolean).map((kv) => `<span class="k">${(kv as string[])[0]}:</span> ${(kv as string[])[1]}`).join("\n");
  const siblings = m.elements.filter((x) => x.parent === v.parent && x !== v);
  const sameValue = m.elements.filter((x) => x.value === v.value && x.section !== v.section);
  const timeIn = app.agf.edges.filter((e) => e.kind === "precedes" && e.target === a.id).map((e) => m.agfNode.get(e.source)!).filter(Boolean);
  const timeOut = app.agf.edges.filter((e) => e.kind === "precedes" && e.source === a.id).map((e) => m.agfNode.get(e.target)!).filter(Boolean);
  const dt = a.facets?.data_type, def = dt ? app.pv.valueDef("data_type", dt) : undefined;
  const findings = app.findingsFor(a.id);
  const stats = a.stats as Record<string, unknown> | undefined;
  return `
    <div class="eyebrow">${esc(app.pv.valueLabel("element_kind", a.facets?.element_kind))} · ${esc(app.pv.valueLabel("data_type", dt))}</div>
    <h2>${esc(a.name)}</h2>
    <div class="yaml">---\n${yaml}\n---</div>
    ${a.note || a.description ? `<p style="margin-top:.8rem">${esc(a.note || a.description)}</p>` : ""}
    ${a.value_domain?.length ? `<h3>Dominio de valores${a.facet_origin?.data_type === "inferred" && stats ? " (observado)" : ""}</h3><div class="chips">${a.value_domain.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>` : ""}
    ${stats ? `<h3>Estadísticas agregadas</h3><dl class="kv">${Object.entries(stats).map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val === null ? "—" : String(val))}</dd>`).join("")}</dl><p style="font-size:.74rem">Solo estadísticas: el Atlas nunca conserva filas.</p>` : ""}
    ${findings.length ? `<h3>Hallazgos · ${findings.length}</h3>${findings.map((f) => app.findingCard(f)).join("")}` : ""}
    ${timeIn.length || timeOut.length ? `<h3>Cronología esperada</h3><p>${timeIn.length ? "Posterior a " + timeIn.map((n) => app.wl(n)).join(", ") + ". " : ""}${timeOut.length ? "Anterior a " + timeOut.map((n) => app.wl(n)).join(", ") + "." : ""}</p>` : ""}
    ${relationsBlock(app, a.id)}
    ${semanticBlock(app, a.id)}
    ${def?.quality_rules?.length ? `<h3>Reglas de calidad sugeridas por tipo</h3><ul class="rules">${def.quality_rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
    ${provenanceBlock(app, a)}
    ${siblings.length ? `<h3>Misma ${parent !== sec ? "subsección" : m.isProject ? "fuente" : "sección"} · ${siblings.length}</h3><div class="chips">${siblings.map((x) => app.chip(x)).join("")}</div>` : ""}
    ${sameValue.length ? `<h3>Mismo valor (${esc(m.labelValue(v.value))}) en otras ${m.isProject ? "fuentes" : "secciones"} · ${sameValue.length}</h3><div class="chips">${sameValue.slice(0, 24).map((x) => app.chip(x, true)).join("")}${sameValue.length > 24 ? `<button class="chip" data-id="fv:${esc(v.value)}">+${sameValue.length - 24} más</button>` : ""}</div>` : ""}`;
}

function noteSection(app: App, c: VNode): string {
  const m = app.model, a = c.agf!;
  const subs = Object.values(m.N).filter((n) => n.kind === "sub" && n.parent === c.id);
  const findings = app.findingsFor(a.id);
  const dom = a.facets?.info_domain;
  return `
    <div class="eyebrow">Sección ${c.n !== undefined ? pad(c.n) + " de " + m.sections.length : ""} · ${c.elements.length} ${m.isProject ? "elementos" : "variables"}</div>
    <h2>${esc(c.name)}</h2>
    ${state.mode === "simple" ? `<button class="btn-inline" id="toggle-cat" data-cat="${esc(c.id)}">${state.expanded.has(c.id) ? "Cerrar sección en el grafo" : "Abrir sección en el grafo"}</button>` : ""}
    ${a.description ? `<p>${esc(a.description)}</p>` : ""}
    ${dom ? `<p style="font-size:.78rem">Dominio: <b>${esc(app.pv.valueLabel("info_domain", dom))}</b> ${a.facet_origin?.info_domain === "inferred" ? '<span class="inf" style="color:var(--warn)"># inferido</span>' : ""}</p>` : ""}
    ${findings.length ? `<h3>Hallazgos · ${findings.length}</h3>${findings.map((f) => app.findingCard(f)).join("")}` : ""}
    ${app.composition(c.elements)}
    ${subs.length ? `<h3>Subsecciones · ${subs.length}</h3><div class="chips">${subs.map((s) => `<button class="chip" data-id="${esc(s.id)}">${esc(s.name)} · ${s.elements.length}</button>`).join("")}</div>` : ""}
    <h3>Metadata agrupada por ${esc(app.pv.facetLabel(state.groupBy).toLowerCase())}</h3>
    <div class="grouplist">${app.groupedElements(c.elements)}</div>
    ${provenanceBlock(app, a)}`;
}

function noteSource(app: App, s: VNode): string {
  const m = app.model, src = app.agf.sources.find((x) => x.id === s.id);
  const all = app.agf.nodes.filter((n) => n.kind === "element" && n.source_id === s.id);
  const els = all.map((e) => ({ value: m.valueMap.get(facetValue(e, state.groupBy)) || UNCLASSIFIED }));
  const same = app.agf.edges.filter((e) => e.kind === "same_as" && e.status !== "rejected" && (m.agfNode.get(e.source)?.source_id === s.id || m.agfNode.get(e.target)?.source_id === s.id));
  const secs = app.agf.nodes.filter((n) => n.kind === "section" && n.source_id === s.id && !n.parent_id);
  const guard = src?.personal_data_guard;
  return `
    <div class="eyebrow">Fuente · ${esc(app.pv.valueLabel("source_type", src?.facets?.source_type))} · ${all.length} elementos</div>
    <h2>${esc(s.name)}</h2>
    <button class="btn-inline" data-scope="${esc(s.id)}">Abrir el grafo de esta fuente</button>
    <dl class="kv">
      <dt>Archivo</dt><dd>${esc(src?.name || "")}</dd>
      <dt>Adaptador</dt><dd>${esc(src?.adapter || "—")}</dd>
      <dt>Ingesta</dt><dd>${esc(src?.ingested_at || "—")}</dd>
      <dt>Secciones</dt><dd>${secs.length}</dd>
      <dt>Sin clasificar</dt><dd>${src?.unparsed_count ?? 0} bloques</dd>
      ${guard ? `<dt>Datos personales</dt><dd>${Object.values(guard.hits).some(Boolean) ? "patrones detectados; confirmado por el usuario" : "sin patrones detectados"}</dd>` : ""}
      <dt>Equivalencias</dt><dd>${same.length} con otras fuentes</dd>
    </dl>
    ${app.composition(els)}
    ${state.mode === "simple" ? `<button class="btn-inline" id="toggle-cat" data-cat="${esc(s.id)}">${state.expanded.has(s.id) ? "Cerrar elementos puente en el grafo" : "Mostrar elementos puente en el grafo"}</button>` : ""}
    <h3>Secciones · ${secs.length}</h3>
    <div class="chips">${secs.map((x) => `<button class="chip" data-id="${esc(x.id)}">${x.number !== undefined ? pad(x.number) + " · " : ""}${esc(x.name)}</button>`).join("")}</div>
    ${src?.unparsed?.length ? `<h3>Bloques sin clasificar · ${src.unparsed.length}</h3><ul class="rules">${src.unparsed.slice(0, 10).map((u) => `<li>${esc(u.text || JSON.stringify(u.locator))}</li>`).join("")}</ul>` : ""}`;
}

function noteSub(app: App, s: VNode): string {
  const c = app.model.N[s.parent!];
  return `
    <div class="eyebrow">Subsección · ${s.elements.length} variables</div>
    <h2>${esc(s.name)}</h2>
    <p>Pertenece a ${app.wl(c, app.model.sectionLabel(c))}.</p>
    ${app.composition(s.elements)}
    <div class="grouplist">${app.groupedElements(s.elements)}</div>`;
}

function noteGroup(app: App, g: VNode): string {
  const m = app.model, parent = m.N[g.parent!];
  return `
    <div class="eyebrow">Grupo de metadata · ${esc(app.pv.facetLabel(state.groupBy).toLowerCase())} × ${parent.kind === "source" ? "fuente" : "sección"}</div>
    <h2>${esc(m.labelPlural(g.value))} en ${esc(parent.kind === "section" ? m.sectionLabel(parent) : parent.name)}</h2>
    <p>${app.wl(m.N["fv:" + g.value], m.labelValue(g.value))} · ${g.elements.length} elementos.</p>
    <div class="chips">${g.elements.map((e) => app.chip(e)).join("")}</div>`;
}

function noteFacet(app: App, t: VNode): string {
  const m = app.model, def = t.value === "otros" || t.value === UNCLASSIFIED ? undefined : app.pv.valueDef(state.groupBy, t.value);
  const list = m.elements.filter((e) => e.value === t.value);
  const all = m.allElements().filter((e) => (m.valueMap.get(facetValue(e, state.groupBy)) || UNCLASSIFIED) === t.value);
  const perSec = m.sections.map((c) => ({ c, k: list.filter((v) => v.section === c.id).length })).filter((x) => x.k);
  return `
    <div class="eyebrow">${esc(app.pv.facetLabel(state.groupBy))} · ${all.length} de ${m.allElements().length} elementos</div>
    <h2>${esc(m.labelValue(t.value))}</h2>
    ${def?.definition ? `<p>${esc(def.definition)}</p>` : t.value === UNCLASSIFIED ? `<p>Elementos sin valor en esta faceta. El Atlas no inventa valores: revísalos y clasifícalos, o acepta la propuesta de otra faceta.</p>` : t.value === "otros" ? `<p>Valores menos frecuentes agrupados (máximo ${app.pv.p.max_colors_per_facet ?? 8} colores por faceta).</p>` : ""}
    ${def?.quality_rules?.length ? `<h3>Reglas de validación sugeridas</h3><ul class="rules">${def.quality_rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
    ${app.pv.facet(state.groupBy)?.note ? `<div class="note-box">${esc(app.pv.facet(state.groupBy)!.note!)}</div>` : ""}
    <h3>Distribución por ${m.isProject ? "fuente" : "sección"}</h3>
    ${perSec.map(({ c, k }) => `<div class="cat-row" data-id="${esc(c.id)}"><span class="num">${c.n !== undefined ? pad(c.n) : "·"}</span><span class="nm">${esc(c.name)}</span><span class="ct">${k}</span></div>`).join("")}
    ${all.length > list.length ? `<h3>En todo el proyecto · ${all.length}</h3><div class="chips">${all.slice(0, 40).map((e) => app.chipAgf(e)).join("")}${all.length > 40 ? `<span class="chip">+${all.length - 40} más</span>` : ""}</div>` : ""}`;
}

function noteVocab(app: App, s: VNode): string {
  const a = s.agf!;
  return `
    <div class="eyebrow">Terminología · asociación ${a.origin === "inferred" ? "inferida" : "declarada"}</div>
    <h2>${esc(a.name)}</h2>
    <p>${esc(a.full_name || "")}</p>
    <h3>Elementos que la usan · ${s.elements.length}</h3>
    <div class="chips">${s.elements.map((e) => app.chip(e, true)).join("")}</div>`;
}

function noteRoot(app: App): string {
  const m = app.model, a = m.root.agf;
  const secs = m.sections;
  return `
    <div class="eyebrow">${m.isProject ? "Proyecto" : app.agf.sources.length > 1 ? "Fuente" : "Nodo raíz"}</div>
    <h2>${esc(m.root.name)}</h2>
    ${a?.rationale ? `<div class="note-box">${esc(a.rationale)}</div>` : ""}
    <p>${m.isProject ? `Las ${secs.length} fuentes se disponen en anillo en el orden de carga; al centro, los elementos que dos o más fuentes comparten (equivalencias propuestas). Clic en una fuente abre su grafo.` : `Entidad central. Las ${secs.length} secciones se disponen en sentido horario siguiendo el orden del documento.`}</p>
    ${m.isProject && app.agf.sources.length > 1 ? `<button class="btn-inline" data-scope="project">Ver mapa del proyecto</button>` : app.agf.sources.length > 1 ? `<button class="btn-inline" data-scope="project">Volver al mapa del proyecto</button>` : ""}
    ${app.composition(m.elements.length ? m.elements : m.allElements().map((e) => ({ value: m.valueMap.get(facetValue(e, state.groupBy)) || UNCLASSIFIED })))}
    <div class="grouplist">${m.values.map((v) => `<div class="gh">${app.dot(v)} ${esc(m.labelPlural(v))} · ${m.isProject ? m.allElements().filter((e) => (m.valueMap.get(facetValue(e, state.groupBy)) || UNCLASSIFIED) === v).length : m.countValue(v)}</div>`).join("")}</div>
    <h3>${m.isProject ? "Fuentes" : "Secciones"} · ${secs.length}</h3>
    ${secs.map((c) => `<div class="cat-row" data-id="${esc(c.id)}"><span class="num">${c.n !== undefined ? pad(c.n) : "·"}</span><span class="nm">${esc(c.name)}</span><span class="ct">${c.elements.length}</span>${app.composition(c.elements)}</div>`).join("")}`;
}

export function renderSecciones(app: App): string {
  const m = app.model;
  const what = m.isProject ? "fuentes" : "secciones";
  return `<div class="eyebrow">Estructura ${m.isProject ? "del proyecto" : "del documento"}</div><h2>${m.sections.length} ${what}</h2>
    <p>La barra muestra la composición por ${esc(app.pv.facetLabel(state.groupBy).toLowerCase())} de cada ${m.isProject ? "fuente" : "sección"}.</p>` +
    m.sections.map((c) => `<div class="cat-row" data-id="${esc(c.id)}"><span class="num">${c.n !== undefined ? pad(c.n) : "·"}</span><span class="nm">${esc(c.name)}</span><span class="ct">${c.elements.length}</span>${app.composition(c.elements)}</div>`).join("");
}

export function renderFacetas(app: App): string {
  const m = app.model, f = state.groupBy, def = app.pv.facet(f);
  return `<div class="eyebrow">Metadata agrupada por faceta</div><h2>${esc(app.pv.facetLabel(f))} · ${m.values.length} valores</h2>
    <p>${def?.note ? esc(def.note) : "Asignación inferida desde el nombre de cada elemento y la convención del dominio; requiere validación."} Cambia la faceta activa en Ajustes › Agrupar por.</p>
    <div class="chips" style="margin-bottom:.6rem">${app.pv.groupableFacets().map((x) => `<button class="chip" data-groupby="${esc(x)}" ${x === f ? 'style="border-color:var(--accent);color:var(--ink)"' : ""}>${esc(app.pv.facetLabel(x))}</button>`).join("")}</div>` +
    m.values.map((v) => { const d = v === "otros" || v === UNCLASSIFIED ? undefined : app.pv.valueDef(f, v); return `
      <div class="type-card">
        <div class="hd" data-id="fv:${esc(v)}" role="button" tabindex="0"><i style="width:.7rem;height:.7rem;border-radius:50%;display:inline-block;background:${app.graph.color(v)}"></i><b>${esc(m.labelValue(v))}</b><span class="ct">${m.isProject ? m.allElements().filter((e) => (m.valueMap.get(facetValue(e, f)) || UNCLASSIFIED) === v).length : m.countValue(v)}</span></div>
        ${d?.definition ? `<p>${esc(d.definition)}</p>` : ""}
        ${d?.quality_rules?.length ? `<ul class="rules">${d.quality_rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
      </div>`; }).join("");
}

export function renderTraza(app: App): string {
  const m = app.model, findings = app.agf.findings || [], P = app.pv.p.priorities;
  const all = m.allElements();
  const inferred = (f: string) => all.filter((e) => e.facet_origin?.[f] === "inferred").length;
  const validated = app.agf.nodes.filter((n) => n.status === "validated").length;
  const guardIssues = app.agf.sources.filter((s) => s.personal_data_guard && Object.values(s.personal_data_guard.hits).some(Boolean));
  return `
    <div class="eyebrow">Trazabilidad</div><h2>Fuente, método y límites</h2>
    <dl class="kv">
      ${app.agf.sources.map((s) => `<dt>Fuente</dt><dd>${esc(s.name)}${s.adapter ? ` · ${esc(s.adapter)}` : ""}${s.ingested_at ? ` · ${esc(s.ingested_at.slice(0, 10))}` : ""}${s.sha256 ? `<br><span class="conf">sha256 ${esc(s.sha256.slice(0, 16))}…</span>` : ""}</dd>`).join("")}
      <dt>Extracción</dt><dd>Literal: ${app.agf.nodes.filter((n) => n.kind === "section" && !n.parent_id).length} secciones, ${app.agf.nodes.filter((n) => n.kind === "section" && n.parent_id).length} subsecciones, ${all.length} elementos. Solo se normalizan tildes y mayúsculas en identificadores; los nombres se conservan.</dd>
      <dt>Tipo de dato</dt><dd>${inferred("data_type")} de ${all.length} inferidos desde el nombre o los valores; ${all.length - inferred("data_type")} declarados por el documento.</dd>
      <dt>Dominio</dt><dd>${inferred("info_domain")} inferidos por léxico; ${all.filter((e) => !e.facets?.info_domain).length} sin clasificar.</dd>
      <dt>Sensibilidad</dt><dd>${inferred("sensitivity")} inferidos (provisional, pendiente de revisión legal: decisión M2).</dd>
      <dt>Terminologías</dt><dd>Asociadas por inferencia (${app.agf.nodes.filter((n) => n.kind === "vocabulary").map((n) => esc(n.name)).join(", ") || "ninguna"}).</dd>
      <dt>Cronología</dt><dd>${app.agf.edges.filter((e) => e.kind === "precedes").length} aristas desde plantilla por dominio; propuesta como base de reglas de coherencia.</dd>
      <dt>Relaciones</dt><dd>${app.agf.edges.filter((e) => e.kind === "same_as").length} equivalencias, ${app.agf.edges.filter((e) => e.kind === "relates").length} parecidos, ${app.agf.edges.filter((e) => e.kind === "references").length} referencias. Nunca se fusionan nodos: todo queda como arista propuesta.</dd>
      <dt>Grupos</dt><dd>Se crea un grupo de metadata cuando una sección tiene ${app.pv.p.group_threshold ?? 2} o más elementos con el mismo valor de la faceta activa. Los grupos no se guardan: se calculan al reagrupar.</dd>
      <dt>Validación</dt><dd>${validated} de ${app.agf.nodes.length} nodos validados (${(100 * validated / (app.agf.nodes.length || 1)).toFixed(1)} %). Solo lo validado entra a la memoria confiable de los agentes.</dd>
      ${guardIssues.length ? `<dt>Datos personales</dt><dd>${guardIssues.length} fuentes con patrones detectados y confirmadas por el usuario.</dd>` : ""}
    </dl>
    <h3>Hallazgos de calidad · ${findings.length}</h3>
    <p>Ordenados por <b>prioridad de corrección</b>:</p>
    <div class="prio-legend">${Object.entries(P).map(([k, v]) => `<div><span><span class="tag ${k}">${esc(v.label)}</span><span class="prio-count">${findings.filter((f) => f.priority === k).length}</span></span><span>${esc(v.def)}</span></div>`).join("")}</div>
    ${["bloqueante", "importante", "menor"].flatMap((p) => findings.filter((f) => f.priority === p)).map((f) => app.findingCard(f)).join("")}
    <h3>Decisiones que requieren validación</h3>
    <ul class="rules">
      <li>Confirmar tipos de dato y dominios de valores con el responsable del registro.</li>
      <li>Definir cardinalidad de tratamientos, comités y eventos de evolución.</li>
      <li>Revisar las equivalencias propuestas entre fuentes (pestaña Relaciones) antes de exportar la memoria.</li>
      <li>Validar la clasificación de sensibilidad con la asesoría legal (Ley 19.628, Ley 21.719, Ley 20.584).</li>
    </ul>`;
}
