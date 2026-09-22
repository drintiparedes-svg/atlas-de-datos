/** Adaptador esquema-bd en el navegador: DDL → tablas, columnas, llaves foráneas (solo metadatos). */
import { el, sec, type IRDocument } from "./ir";

const SQL_TYPES: [string[], string][] = [[["date", "timestamp", "datetime"], "fecha"], [["bool", "bit"], "binario"], [["int", "serial", "numeric", "decimal", "float", "double", "real", "money"], "numerica"], [["uuid"], "identificador"], [["text", "clob"], "texto_libre"], [["json", "array"], "compuesto"], [["blob", "bytea", "binary"], "archivo"], [["char", "varchar", "string", "enum"], "categorica"]];
const mapType = (t: string) => { const low = t.toLowerCase(); for (const [keys, dt] of SQL_TYPES) if (keys.some((k) => low.includes(k))) return dt; return "categorica"; };

function splitColumns(body: string): string[] {
  const parts: string[] = []; let depth = 0, cur = "";
  for (const ch of body) { if (ch === "(") depth++; else if (ch === ")") depth--; if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch; }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function parseSql(filename: string, text: string): IRDocument {
  const doc: IRDocument = { filename, title: filename.replace(/\.[^.]+$/, ""), source_type: "esquema_bd", adapter: "esquema-bd@1.0", sections: [], relations: [], unparsed: [], meta: {}, text };
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?[`"]?(?:\w+\.)?(\w+)[`"]?\s*\(([\s\S]*?)\)\s*;/gi;
  const FK = /foreign\s+key\s*\(\s*[`"]?(\w+)[`"]?\s*\)\s*references\s+[`"]?(\w+)[`"]?\s*\(\s*[`"]?(\w+)[`"]?\s*\)/i;
  const INLINE = /references\s+[`"]?(\w+)[`"]?\s*\(\s*[`"]?(\w+)[`"]?\s*\)/i;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const tname = m[1]; let body = m[2];
    const line = text.slice(0, m.index).split("\n").length;
    const comments = new Map<string, string>();
    body = body.split("\n").map((ln) => { const cm = ln.match(/--\s*(.*)$/), first = ln.match(/^\s*[`"]?(\w+)/); if (cm && first) comments.set(first[1].toLowerCase(), cm[1].trim()); return ln.replace(/--.*$/, ""); }).join("\n");
    const s = sec(tname, { line }, { declared: { kind: "table" } });
    const pks = new Set<string>();
    for (const raw of splitColumns(body)) {
      const low = raw.toLowerCase();
      const fk = raw.match(FK);
      if (fk) { doc.relations.push({ kind: "references", source: `${tname}.${fk[1]}`, target: `${fk[2]}.${fk[3]}` }); continue; }
      const pk = low.match(/primary\s+key\s*\((.*?)\)/);
      if (pk) { pk[1].split(",").forEach((c) => pks.add(c.trim().replace(/[`"]/g, ""))); continue; }
      if (/^(constraint|unique|index|key |check)/.test(low)) continue;
      const cm = raw.match(/^[`"]?(\w+)[`"]?\s+([a-z]+(?:\s*\([^)]*\))?)([\s\S]*)$/i);
      if (!cm) { doc.unparsed.push({ locator: { table: tname }, text: raw.slice(0, 120) }); continue; }
      const [, cname, ctype, rest] = cm;
      const e = el(cname, { table: tname, line }, { raw: raw.trim(), element_kind: "column", note: comments.get(cname.toLowerCase()) || null });
      e.declared.native_type = ctype.trim(); e.declared.nullable = !rest.toLowerCase().includes("not null"); e.declared.data_type = mapType(ctype);
      if (rest.toLowerCase().includes("primary key")) { e.declared.key = "primary"; e.declared.data_type = "identificador"; }
      const ifk = rest.match(INLINE); if (ifk) doc.relations.push({ kind: "references", source: `${tname}.${cname}`, target: `${ifk[1]}.${ifk[2]}` });
      s.elements.push(e);
    }
    for (const e of s.elements) if (pks.has(e.name)) { e.declared.key = "primary"; e.declared.data_type = "identificador"; }
    doc.sections.push(s);
  }
  if (!doc.sections.length) doc.unparsed.push({ text: "no se encontraron sentencias CREATE TABLE" });
  return doc;
}
