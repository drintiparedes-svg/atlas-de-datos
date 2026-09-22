/** Estado compartido del visor y bus de eventos mínimo. */
import type { Mode, Scope, View } from "./model";

export interface State {
  mode: Mode;
  view: View;
  groupBy: string;
  scope: Scope;
  values: Set<string>;          // valores de la faceta activa habilitados
  layers: Set<string>;          // capas activas
  labelsAll: boolean;
  rep: number;
  len: number;
  query: string;
  expanded: Set<string>;        // secciones (o fuentes) abiertas en modo simplificado
}

export const state: State = {
  mode: "detalle",
  view: "combinada",
  groupBy: "data_type",
  scope: { level: "source" },
  values: new Set(),
  layers: new Set(),
  labelsAll: false,
  rep: 1700,
  len: 1,
  query: "",
  expanded: new Set(),
};

type Handler = (...args: unknown[]) => void;
const handlers: Record<string, Handler[]> = {};
export function on(evt: string, h: Handler) { (handlers[evt] = handlers[evt] || []).push(h); }
export function emit(evt: string, ...args: unknown[]) { for (const h of handlers[evt] || []) h(...args); }
