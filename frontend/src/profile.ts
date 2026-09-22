/** Perfil de visualización: colores por faceta y tema, etiquetas, variables CSS. */
import type { Agf, AgfNode, FacetDef, Profile } from "./types";

export type Theme = "dark" | "light";

export function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export const UNCLASSIFIED = "sin_clasificar";

export class ProfileView {
  constructor(public p: Profile) {}

  facet(key: string): FacetDef | undefined { return this.p.facets[key]; }
  facetLabel(key: string): string { return this.p.facets[key]?.label || key; }
  valueLabel(facet: string, value: string | null | undefined): string {
    if (!value || value === UNCLASSIFIED) return this.p.unclassified?.label || "Sin clasificar";
    return this.p.facets[facet]?.values[value]?.label || value;
  }
  valuePlural(facet: string, value: string | null | undefined): string {
    if (!value || value === UNCLASSIFIED) return this.p.unclassified?.plural || "Sin clasificar";
    const v = this.p.facets[facet]?.values[value];
    return v?.plural || v?.label || value;
  }
  valueDef(facet: string, value: string) { return this.p.facets[facet]?.values[value]; }
  color(facet: string, value: string | null | undefined, theme: Theme = currentTheme()): string {
    if (!value || value === UNCLASSIFIED) return theme === "dark" ? (this.p.unclassified?.color_dark || "#5c6579") : (this.p.unclassified?.color_light || "#8b96ab");
    const v = this.p.facets[facet]?.values[value];
    if (v) return theme === "dark" ? v.color_dark || "#888" : v.color_light || "#888";
    return this.p.tokens[theme].inkFaint;
  }
  token(name: string, theme: Theme = currentTheme()): string { return this.p.tokens[theme][name]; }
  /** Valores de una faceta en el orden del perfil, seguidos de los no declarados y de «sin clasificar». */
  orderedValues(facet: string, present: Iterable<string>): string[] {
    const order = this.p.facets[facet]?.order || [];
    const set = new Set(present);
    const out = order.filter((v) => set.has(v));
    for (const v of set) if (!order.includes(v) && v !== UNCLASSIFIED) out.push(v);
    if (set.has(UNCLASSIFIED)) out.push(UNCLASSIFIED);
    return out;
  }
  groupableFacets(): string[] {
    return (this.p.facet_order || Object.keys(this.p.facets)).filter((f) => f in this.p.facets && f !== "source_type");
  }
  /** Fija variables CSS --fv-<faceta>-<valor> para chips y leyendas HTML. */
  applyCssVars(theme: Theme = currentTheme()) {
    const st = document.documentElement.style;
    for (const [f, def] of Object.entries(this.p.facets))
      for (const v of Object.keys(def.values)) st.setProperty(`--fv-${f}-${v}`, this.color(f, v, theme));
    st.setProperty("--fv-unclassified", this.color("", null, theme));
  }
}

/** Valor de la faceta activa de un nodo (elemento o sección). `status`/`origin` se leen del nodo, no de facets. */
export function facetValue(n: AgfNode, facet: string): string {
  if (facet === "status") return (n.status as string) || UNCLASSIFIED;
  if (facet === "origin") return (n.origin as string) || UNCLASSIFIED;
  return n.facets?.[facet] || UNCLASSIFIED;
}

export function facetOrigin(n: AgfNode, facet: string): string | null {
  if (facet === "status" || facet === "origin") return null;
  return n.facet_origin?.[facet] || null;
}

export function sourceOf(agf: Agf, id: string | undefined) {
  return agf.sources.find((s) => s.id === id);
}
