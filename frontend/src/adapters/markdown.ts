/** Adaptador markdown en el navegador: #/## → secciones; listas y tablas → elementos; [[enlaces]] → relaciones. */
import { norm } from "../lib/text";
import { el, sec, type IRDocument, type IRSection } from "./ir";

const KIND_BY_SECTION: [string, string][] = [["tarea", "task"], ["pendiente", "task"], ["compromiso", "task"], ["decision", "decision"], ["acuerdo", "decision"], ["pregunta", "question"], ["duda", "question"], ["evento", "event"], ["hito", "event"], ["participante", "entity"], ["asistente", "entity"], ["persona", "entity"]];
const kindFor = (name: string) => { const n = norm(name); for (const [k, v] of KIND_BY_SECTION) if (n.includes(k)) return v; return "field"; };
const TYPE_MAP: Record<string, string> = { fecha: "fecha", date: "fecha", categorica: "categorica", categorical: "categorica", binario: "binario", binaria: "binario", boolean: "binario", dicotomica: "binario", numerica: "numerica", numeric: "numerica", entero: "numerica", decimal: "numerica", codigo: "codigo", code: "codigo", identificador: "identificador", id: "identificador", texto: "texto_libre", "texto libre": "texto_libre", text: "texto_libre", compuesto: "compuesto", json: "compuesto", lista: "compuesto", archivo: "archivo", file: "archivo" };
const WL = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

export function parseMarkdown(filename: string, text: string): IRDocument {
  const doc: IRDocument = { filename, title: null, source_type: "diccionario", adapter: "markdown@1.0", sections: [], relations: [], unparsed: [], meta: {}, text };
  let cur: IRSection | null = null, sub: IRSection | null = null, number = 0, head: string[] | null = null;
  text.split(/\r?\n/).forEach((line, idx) => {
    const i = idx + 1, t = line.trimEnd();
    if (!t.trim()) { head = null; return; }
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length, name = h[2].trim();
      if (level === 1 && doc.title === null) { doc.title = name; return; }
      if (level <= 2 || !cur) { number++; const m = name.match(/^(\d+)[.)]\s*(.*)$/); cur = sec(m ? m[2] : name, { line: i }, { number: m ? +m[1] : number }); doc.sections.push(cur); sub = null; }
      else { sub = sec(name, { line: i }); cur.subsections.push(sub); }
      return;
    }
    if (t.trim().startsWith("|")) {
      const cells = t.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      if (!head) { head = cells.map((c) => c.toLowerCase()); return; }
      if (cells.every((c) => /^[-: ]*$/.test(c))) return;
      const nameCol = head.findIndex((x) => ["variable", "campo", "nombre", "elemento", "columna"].includes(x));
      if (nameCol < 0 || !cur || nameCol >= cells.length) { doc.unparsed.push({ locator: { line: i }, text: t.slice(0, 120) }); return; }
      const e = el(cells[nameCol], { line: i }, { raw: t.trim() });
      head.forEach((hh, k) => {
        const v = cells[k]; if (!v) return;
        if (["tipo", "tipo de dato", "type"].includes(hh)) e.declared.data_type = TYPE_MAP[norm(v)] || norm(v).replace(/ /g, "_");
        else if (["dominio", "valores", "dominio de valores"].includes(hh)) e.declared._value_domain = v.split(/[;,/]/).map((x) => x.trim()).filter(Boolean);
        else if (["descripcion", "descripción", "definicion", "definición", "nota"].includes(hh)) e.note = v;
        else if (["terminologia", "terminología", "estandar", "estándar", "vocabulario"].includes(hh)) e.declared.vocabulary = v.toLowerCase();
        else if (hh === "sensibilidad") e.declared.sensitivity = v.toLowerCase();
        else if (["dominio de informacion", "dominio de información", "ambito", "ámbito"].includes(hh)) e.declared.info_domain = v.toLowerCase();
      });
      (sub || cur).elements.push(e);
      for (const mm of (e.note || "").matchAll(WL)) doc.relations.push({ kind: "relates", source: e.name, target: mm[1].trim(), predicate: "enlace" });
      return;
    }
    const li = t.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (li && cur) {
      const raw = li[1].trim(), m = raw.match(/^\*{0,2}([^:*]{2,80})\*{0,2}\s*[:·-]\s+(.+)$/);
      const name = (m ? m[1] : raw).trim().replace(WL, "$1"), note = m ? m[2].trim() : null;
      const e = el(name, { line: i }, { raw, note, element_kind: kindFor((sub || cur).name) });
      (sub || cur).elements.push(e);
      for (const mm of raw.matchAll(WL)) if (mm[1].trim() !== e.name) doc.relations.push({ kind: "relates", source: e.name, target: mm[1].trim(), predicate: "enlace" });
      return;
    }
    if (cur && (sub || cur).description == null && !(sub || cur).elements.length) { (sub || cur).description = t.trim(); return; }
    if (!cur && doc.title !== null && !("description" in doc.meta)) { doc.meta.description = t.trim(); return; }
    doc.unparsed.push({ locator: { line: i }, text: t.slice(0, 120) });
  });
  return doc;
}
