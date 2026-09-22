/** Adaptador tabla en el navegador: csv/tsv y xlsx (JSZip + XML). Solo estadísticas por columna: nunca filas. */
import JSZip from "jszip";
import { inferDataTypeFromValues } from "../infer";
import { el, sec, type IRDocument, type IRSection } from "./ir";

const MAX_ROWS = 5000;

export function parseCsvText(text: string, delim: string | null): string[][] {
  if (!delim) { const head = text.slice(0, 4096); const cands = [",", ";", "\t", "|"]; delim = cands.map((d) => [d, (head.match(new RegExp("\\" + d, "g")) || []).length] as [string, number]).sort((a, b) => b[1] - a[1])[0][0]; }
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; if (rows.length > MAX_ROWS) break; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function formatExample(vals: string[]): string | null {
  if (!vals.length) return null;
  return vals[0].slice(0, 24).replace(/\d/g, "9").replace(/\p{L}/gu, "a");
}

export function sheetSection(name: string, rows: string[][], locator: Record<string, unknown>): IRSection {
  const s = sec(name, locator);
  if (!rows.length) return s;
  const [header, ...body] = rows;
  s.description = `${body.length} filas leídas (máximo ${MAX_ROWS}); solo se conservan estadísticas por columna.`;
  header.forEach((col, ci) => {
    col = (col || "").trim(); if (!col) return;
    const values = body.map((r) => r[ci] ?? ""), nonEmpty = values.filter((v) => String(v).trim() !== "");
    const inf = inferDataTypeFromValues(nonEmpty, col), distinct = new Set(nonEmpty.map((v) => v.trim()));
    const e = el(col, { ...locator, column: ci }, { element_kind: "column", stats: { rows: values.length, non_null: nonEmpty.length, null_pct: values.length ? Math.round(1000 * (1 - nonEmpty.length / values.length)) / 10 : null, distinct: distinct.size, format_example: formatExample(nonEmpty) } });
    e.declared._data_type_from_values = { value: inf.value, confidence: inf.confidence, rationale: inf.rationale };
    if ((inf.value === "categorica" || inf.value === "binario") && distinct.size <= 30) e.declared._value_domain = [...distinct].sort().slice(0, 30);
    s.elements.push(e);
  });
  return s;
}

export function parseCsv(filename: string, text: string, delim: string | null): IRDocument {
  const rows = parseCsvText(text.replace(/^﻿/, ""), delim);
  const title = filename.replace(/\.[^.]+$/, "");
  return { filename, title, source_type: "tabla", adapter: "tabla@1.0", sections: [sheetSection(title, rows, { file: filename })], relations: [], unparsed: [], meta: {}, text: rows.slice(0, 200).map((r) => r.join(" ")).join("\n") };
}

export async function parseXlsx(filename: string, buf: ArrayBuffer): Promise<IRDocument> {
  const zip = await JSZip.loadAsync(buf);
  const parse = (x: string) => new DOMParser().parseFromString(x, "application/xml");
  const shared: string[] = [];
  const ss = await zip.file("xl/sharedStrings.xml")?.async("string");
  if (ss) Array.from(parse(ss).getElementsByTagName("si")).forEach((si) => shared.push(Array.from(si.getElementsByTagName("t")).map((t) => t.textContent || "").join("")));
  const wb = parse((await zip.file("xl/workbook.xml")?.async("string")) || "<workbook/>");
  const rels = parse((await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) || "<Relationships/>");
  const relMap = new Map(Array.from(rels.getElementsByTagName("Relationship")).map((r) => [r.getAttribute("Id")!, r.getAttribute("Target")!]));
  const sheets = Array.from(wb.getElementsByTagName("sheet"));
  const doc: IRDocument = { filename, title: filename.replace(/\.[^.]+$/, ""), source_type: "tabla", adapter: "tabla@1.0", sections: [], relations: [], unparsed: [], meta: {}, text: "" };
  const texts: string[] = [];
  for (let si = 0; si < sheets.length; si++) {
    const sh = sheets[si], rid = sh.getAttribute("r:id") || sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || "";
    const target = (relMap.get(rid) || `worksheets/sheet${si + 1}.xml`).replace(/^\/?xl\//, "");
    const xml = await zip.file("xl/" + target)?.async("string"); if (!xml) continue;
    const rows: string[][] = [];
    for (const r of Array.from(parse(xml).getElementsByTagName("row"))) {
      const row: string[] = [];
      for (const c of Array.from(r.getElementsByTagName("c"))) {
        const ref = c.getAttribute("r") || "", colIdx = colIndex(ref.replace(/\d+/g, ""));
        const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0]?.textContent ?? c.getElementsByTagName("t")[0]?.textContent ?? "";
        row[colIdx] = t === "s" ? shared[+v] ?? "" : v;
      }
      rows.push(Array.from(row, (x) => x ?? ""));
      if (rows.length > MAX_ROWS) break;
    }
    doc.sections.push(sheetSection(sh.getAttribute("name") || `Hoja ${si + 1}`, rows, { sheet: sh.getAttribute("name"), index: si }));
    texts.push(rows.slice(0, 200).map((r) => r.join(" ")).join("\n"));
  }
  doc.text = texts.join("\n");
  return doc;
}

function colIndex(letters: string): number { let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return Math.max(0, n - 1); }
