/** Cuadros de Ajustes y Nota ajustables: arrastre del borde, teclado (flechas en el asa), botón Ampliar
 *  y doble clic para restablecer. Los anchos se guardan en el navegador y el grafo se recentra al terminar.
 *  En pantallas estrechas (≤ 640 px) las asas se ocultan y los cuadros ocupan todo el ancho (CSS). */
import type { App } from "../app";

type Kind = "settings" | "panel";
const REM = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
const DEFAULTS: Record<Kind, number> = { settings: 17.5, panel: 27 };          // en rem, iguales a styles.css
const MIN: Record<Kind, number> = { settings: 224, panel: 288 };               // px
const KEY: Record<Kind, string> = { settings: "atlas.settingsW", panel: "atlas.panelW" };
const KEY_WIDE: Record<Kind, string> = { settings: "atlas.settingsWide", panel: "atlas.panelWide" };
const VAR: Record<Kind, string> = { settings: "--settings-w", panel: "--panel-w" };

const maxWidth = (k: Kind) => k === "settings" ? Math.min(40 * REM(), window.innerWidth - 2 * REM()) : Math.floor(window.innerWidth * 0.94);
const clamp = (k: Kind, px: number) => Math.round(Math.max(MIN[k], Math.min(maxWidth(k), px)));
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, v: string | null) => { try { v === null ? localStorage.removeItem(key) : localStorage.setItem(key, v); } catch { /* sin almacenamiento */ } };

export function elementOf(k: Kind): HTMLElement { return document.getElementById(k === "settings" ? "settings" : "panel") as HTMLElement; }

/** Ancho actual en píxeles que ocupa cada cuadro (0 si está cerrado u oculto). Lo usa `graphArea`. */
export function occupied(k: Kind): number {
  const el = elementOf(k);
  if (k === "settings") return el.hidden ? 0 : el.getBoundingClientRect().right;
  return el.classList.contains("open") ? el.offsetWidth : 0;
}

export function setWidth(k: Kind, px: number, persist = true) {
  const w = clamp(k, px);
  document.documentElement.style.setProperty(VAR[k], `${w}px`);
  elementOf(k).classList.remove("wide");
  syncButtons(k);
  if (persist) { write(KEY[k], String(w)); write(KEY_WIDE[k], null); }
  return w;
}

export function resetWidth(k: Kind) {
  document.documentElement.style.removeProperty(VAR[k]);
  elementOf(k).classList.remove("wide");
  write(KEY[k], null); write(KEY_WIDE[k], null);
  syncButtons(k);
}

export function setWide(k: Kind, wide: boolean, persist = true) {
  elementOf(k).classList.toggle("wide", wide);
  if (persist) write(KEY_WIDE[k], wide ? "1" : null);
  syncButtons(k);
}
export const isWide = (k: Kind) => elementOf(k).classList.contains("wide");

function syncButtons(k: Kind) {
  const wide = isWide(k);
  const b = document.getElementById(k === "settings" ? "btn-settings-wide" : "btn-panel-wide");
  if (!b) return;
  b.setAttribute("aria-pressed", String(wide));
  if (k === "settings") b.textContent = wide ? "Reducir" : "Ampliar";
  else b.title = wide ? "Reducir el panel" : "Ampliar el panel";
  const h = document.getElementById(k === "settings" ? "rh-settings" : "rh-panel");
  h?.setAttribute("aria-valuenow", String(Math.round(elementOf(k).getBoundingClientRect().width || 0)));
}

export function initResize(app: App) {
  // estado guardado
  (["settings", "panel"] as Kind[]).forEach((k) => {
    const saved = Number(read(KEY[k]));
    if (saved > 0) setWidth(k, saved, false);
    if (read(KEY_WIDE[k]) === "1") setWide(k, true, false);
    syncButtons(k);
  });
  const refit = () => setTimeout(() => app.graph.fit(), 40);

  document.getElementById("btn-settings-wide")?.addEventListener("click", () => { setWide("settings", !isWide("settings")); refit(); });
  document.getElementById("btn-settings-hide")?.addEventListener("click", () => {
    (document.getElementById("settings") as HTMLElement).hidden = true;
    document.getElementById("btn-settings")?.setAttribute("aria-expanded", "false");
    refit();
  });
  document.getElementById("btn-panel-wide")?.addEventListener("click", () => { setWide("panel", !isWide("panel")); refit(); });

  document.querySelectorAll<HTMLElement>(".resize-h[data-resize]").forEach((h) => {
    const k = h.dataset.resize as Kind;
    const widthFrom = (clientX: number) => k === "settings" ? clientX - elementOf(k).getBoundingClientRect().left : window.innerWidth - clientX;
    let dragging = false;
    h.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      dragging = true; h.setPointerCapture(e.pointerId); document.body.classList.add("resizing"); e.preventDefault();
    });
    h.addEventListener("pointermove", (e) => { if (dragging) setWidth(k, widthFrom(e.clientX), false); });
    const end = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false; document.body.classList.remove("resizing");
      try { h.releasePointerCapture(e.pointerId); } catch { /* ya liberado */ }
      setWidth(k, widthFrom(e.clientX)); refit();
    };
    h.addEventListener("pointerup", end); h.addEventListener("pointercancel", end);
    h.addEventListener("dblclick", () => { resetWidth(k); refit(); });
    h.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 64 : 16;
      const cur = elementOf(k).getBoundingClientRect().width;
      const grow = k === "settings" ? e.key === "ArrowRight" : e.key === "ArrowLeft";
      const shrink = k === "settings" ? e.key === "ArrowLeft" : e.key === "ArrowRight";
      if (grow || shrink) { e.preventDefault(); setWidth(k, cur + (grow ? step : -step)); refit(); }
      else if (e.key === "Home" || e.key === "Enter") { e.preventDefault(); resetWidth(k); refit(); }
    });
  });

  window.addEventListener("resize", () => {
    // si la ventana se achica, el ancho guardado se recorta al máximo permitido (sin perder el valor guardado)
    (["settings", "panel"] as Kind[]).forEach((k) => {
      const saved = Number(read(KEY[k]));
      if (saved > 0) document.documentElement.style.setProperty(VAR[k], `${clamp(k, saved)}px`);
    });
  });
}

export const defaultsRem = DEFAULTS;
