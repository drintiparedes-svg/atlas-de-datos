/** Normalización de texto: espejo exacto de backend/atlas/text.py. */

export function stripAccents(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function norm(s: string): string {
  return stripAccents(s).toLowerCase().replace(/\s+/g, " ").trim();
}

export function slug(s: string): string {
  return stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function tokens(s: string): string[] {
  return norm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1);
}

export function charNgrams(s: string, n = 3): string[] {
  const t = " " + norm(s) + " ";
  const out: string[] = [];
  for (let i = 0; i <= t.length - n; i++) out.push(t.slice(i, i + n));
  return out;
}

export const pad = (n: number | string) => String(n).padStart(2, "0");

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export const fmtPct = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 1 }) + " %";
export const fmtNum = (n: number, d = 2) => n.toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });
