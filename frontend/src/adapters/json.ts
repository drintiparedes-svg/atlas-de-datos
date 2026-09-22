/** Adaptador json en el navegador: lista de objetos → claves con tipo desde los valores; JSON Schema → columnas. */
import { inferDataTypeFromValues } from "../infer";
import { el, sec, type IRDocument } from "./ir";

export function parseJson(filename: string, text: string): IRDocument {
  const data = JSON.parse(text);
  const doc: IRDocument = { filename, title: filename.replace(/\.[^.]+$/, ""), source_type: "tabla", adapter: "json@1.0", sections: [], relations: [], unparsed: [], meta: {}, text: text.slice(0, 200000) };
  if (data && typeof data === "object" && !Array.isArray(data) && data.properties && typeof data.properties === "object") {
    doc.source_type = "esquema_bd";
    const s = sec(data.title || doc.title!, { pointer: "/" }, { description: data.description });
    for (const [k, prop] of Object.entries(data.properties as Record<string, Record<string, unknown>>)) {
      let t = Array.isArray(prop.type) ? prop.type[0] : (prop.type as string) || "string";
      let dt = ({ string: prop.enum ? "categorica" : "texto_libre", integer: "numerica", number: "numerica", boolean: "binario", object: "compuesto", array: "compuesto" } as Record<string, string>)[t] || "categorica";
      if (prop.format === "date" || prop.format === "date-time") dt = "fecha";
      const e = el(k, { pointer: `/properties/${k}` }, { raw: JSON.stringify(prop).slice(0, 200), note: (prop.description as string) || null, element_kind: "column" });
      e.declared.data_type = dt; if (Array.isArray(prop.enum)) e.declared._value_domain = prop.enum.map(String).slice(0, 30);
      s.elements.push(e);
    }
    doc.sections.push(s); return doc;
  }
  const records: unknown[] = Array.isArray(data) ? data : [data];
  if (!records.every((r) => r && typeof r === "object" && !Array.isArray(r))) { doc.unparsed.push({ text: "el JSON no es una lista de objetos ni un objeto" }); return doc; }
  const s = sec(doc.title!, { pointer: "/" }, { description: `${records.length} registros; solo estadísticas por clave.` });
  const keys = new Map<string, unknown[]>();
  for (const r of records.slice(0, 5000)) for (const [k, v] of Object.entries(r as Record<string, unknown>)) (keys.get(k) || keys.set(k, []).get(k)!).push(v);
  for (const [k, vals] of keys) {
    const nested = vals.every((v) => v === null || typeof v === "object");
    const inf = nested ? { value: "compuesto", confidence: 0.9, rationale: "valores anidados (objeto o lista)" } : inferDataTypeFromValues(vals.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v ?? ""))), k);
    const e = el(k, { pointer: `/*/${k}` }, { element_kind: "column", stats: { non_null: vals.filter((v) => v !== null && v !== undefined).length, rows: records.length } });
    e.declared._data_type_from_values = { value: inf.value, confidence: inf.confidence, rationale: inf.rationale };
    s.elements.push(e);
  }
  doc.sections.push(s);
  return doc;
}
