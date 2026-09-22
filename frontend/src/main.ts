/** Arranque del visor: carga perfil + AGF (+ índice de vectores), inicializa UI y expone `window.__atlas` para pruebas. */
import { App } from "./app";
import { state } from "./state";
import { loadInferenceConfig } from "./infer";
import { fnv1a, hashOne } from "./search/hash";
import type { Agf, Profile, VectorIndex } from "./types";
import { afterProyectos, projectsState, refreshProjects, renderProyectos } from "./ui/projects";
import { renderFacetas, renderNota, renderSecciones, renderTraza } from "./ui/notes";
import { afterRelaciones, renderRelaciones } from "./ui/relations";
import { initSearch } from "./ui/searchbox";
import { initSettings } from "./ui/settings";
import { afterFuentes, renderFuentes } from "./ui/sources";
import { initPanelActions } from "./ui/traza";

declare global { interface Window { __atlas: unknown; atlasRegisterEmbeddings?: (p: unknown) => void } }

async function fetchJson<T>(url: string): Promise<T | null> {
  try { const r = await fetch(url); if (!r.ok) return null; return (await r.json()) as T; } catch { return null; }
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");
  const agfUrl = params.get("agf") || `${base}data/oncologia.agf.json`;
  const profileUrl = params.get("profile") || `${base}data/profile.default.json`;
  const [agf, profile] = await Promise.all([fetchJson<Agf>(agfUrl), fetchJson<Profile>(profileUrl)]);
  if (!agf || !profile) { document.getElementById("panel-body")!.innerHTML = `<div class="alert"><b>No se pudo cargar el AGF o el perfil.</b> Revisa la URL (${agfUrl}).</div>`; document.getElementById("panel")!.classList.add("open"); return; }
  await loadInferenceConfig(base);
  const vectors = await fetchJson<VectorIndex>(agfUrl.replace(/\.agf\.json$/, ".vectors.json"));

  try { const t = localStorage.getItem("atlas.theme"); if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t); } catch { /* sin almacenamiento */ }
  const app = new App();
  app.renderers = { nota: renderNota, proyectos: renderProyectos, secciones: renderSecciones, facetas: renderFacetas, relaciones: renderRelaciones, fuentes: renderFuentes, traza: renderTraza };
  app.afterRender = { relaciones: afterRelaciones, fuentes: afterFuentes, proyectos: afterProyectos };
  initSettings(app); initSearch(app); initPanelActions(app);
  document.querySelectorAll<HTMLButtonElement>("#tabs button[data-tab]").forEach((b) => b.addEventListener("click", () => app.setTab(b.dataset.tab as never)));
  document.getElementById("btn-back")!.addEventListener("click", () => app.goBack());
  document.getElementById("btn-home")!.addEventListener("click", () => app.goHome());
  document.getElementById("btn-close")!.addEventListener("click", () => app.openPanel(false));
  document.getElementById("btn-panel")!.addEventListener("click", () => { const open = !app.panel.classList.contains("open"); app.openPanel(open); if (open) app.renderTab(); });
  window.addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "");
    if ((e.altKey && e.key === "ArrowLeft") || (!typing && e.key === "Backspace")) { e.preventDefault(); app.goBack(); }
  });

  app.load(agf, profile, vectors);
  let mode: "simple" | "detalle" = "simple";
  try { mode = (localStorage.getItem("atlas.mode") as "simple" | "detalle") || "simple"; } catch { /* sin almacenamiento */ }
  const pm = params.get("mode");
  if (pm === "detalle" || pm === "simple") mode = pm;
  app.setMode(mode, false);
  if (params.get("view")) app.setView(params.get("view") as never);
  app.rebuild();
  app.syncBack();
  if (app.graph.W < 760) { (document.getElementById("settings") as HTMLElement).hidden = true; document.getElementById("btn-settings")!.setAttribute("aria-expanded", "false"); }
  else app.openPanel(true);
  app.renderTab();
  app.graph.prewarm(); app.graph.fit(); app.graph.start();

  // API de pruebas y automatización (Playwright): cifras del caso dorado y navegación.
  window.__atlas = {
    app, state,
    stats: () => ({
      elements: app.graph.visNodes.filter((n) => n.kind === "element").length,
      sections: app.graph.visNodes.filter((n) => n.kind === "section").length,
      subsections: app.graph.visNodes.filter((n) => n.kind === "sub").length,
      groups: app.graph.visNodes.filter((n) => n.kind === "group").length,
      facets: app.graph.visNodes.filter((n) => n.kind === "facet").length,
      vocabs: app.graph.visNodes.filter((n) => n.kind === "vocab").length,
      links: app.graph.visLinks.length,
      view: state.view, mode: state.mode, groupBy: state.groupBy, scope: state.scope,
      labelsShown: app.graph.visNodes.filter((n) => n.lblShown).length,
    }),
    labelBoxes: () => app.graph.visNodes.filter((n) => n.lblShown).length,
    select: (id: string) => app.selectById(id),
    setMode: (m: "simple" | "detalle") => app.setMode(m, false),
    setView: (v: "estructura" | "combinada" | "tipo") => { app.setView(v); app.rebuild(); },
    setGroupBy: (f: string) => app.setGroupBy(f),
    setLayer: (l: string, on: boolean) => { on ? state.layers.add(l) : state.layers.delete(l); app.rebuild(); },
    search: (q: string) => app.index!.search(q),
    load: (agf: Agf, vectors: VectorIndex | null = null) => app.load(agf, profile, vectors),
    settle: () => { app.graph.prewarm(); app.graph.fit(); },
    hash: (t: string) => hashOne(t), fnv1a: (t: string) => fnv1a(t),
  };
  if (projectsState.cfg) void refreshProjects(app);
  document.body.dataset.ready = "1";
}

boot();
