/** Adaptadores en el navegador: archivo → IR → AGF. Nada sale del equipo. Espejo de backend/atlas/adapters. */
import { scanPersonalData } from "../infer";
import type { Agf } from "../types";
import { buildAgf, summary, type IRDocument } from "./ir";
import { parseCsv, parseXlsx } from "./tabla";
import { parseDocx } from "./docx";
import { parseJson } from "./json";
import { parseMarkdown } from "./markdown";
import { parseSql } from "./sql";

export interface IngestResult { agf: Agf; summary: ReturnType<typeof summary>; adapter: string }

export async function ingestFile(file: File, opts: { rootName?: string } = {}): Promise<IngestResult> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const buf = await file.arrayBuffer();
  const text = () => new TextDecoder("utf-8").decode(buf);
  if (file.name.endsWith(".agf.json") || (ext === "json" && /"agf_version"\s*:/.test(text().slice(0, 200)))) {
    const agf = JSON.parse(text()) as Agf;
    if (agf.agf_version !== "1.0" || !Array.isArray(agf.nodes) || !Array.isArray(agf.edges)) throw new Error("El archivo no es un AGF 1.0 válido.");
    return { agf, summary: { sections: agf.nodes.filter((n) => n.kind === "section" && !n.parent_id).length, subsections: agf.nodes.filter((n) => n.kind === "section" && n.parent_id).length, elements: agf.nodes.filter((n) => n.kind === "element").length, unparsed: 0 }, adapter: "agf" };
  }
  let doc: IRDocument;
  switch (ext) {
    case "docx": doc = await parseDocx(file.name, buf); break;
    case "csv": case "tsv": doc = parseCsv(file.name, text(), ext === "tsv" ? "\t" : null); break;
    case "xlsx": doc = await parseXlsx(file.name, buf); break;
    case "sql": case "ddl": doc = parseSql(file.name, text()); break;
    case "md": case "markdown": case "txt": doc = parseMarkdown(file.name, text()); break;
    case "json": doc = parseJson(file.name, text()); break;
    default: doc = { filename: file.name, title: file.name.replace(/\.[^.]+$/, ""), source_type: "otro", adapter: "generico@1.0", sections: [], relations: [], unparsed: [], meta: { size_bytes: file.size, extension: "." + ext } };
  }
  const guard = scanPersonalData(doc.text ?? text());
  const agf = await buildAgf(doc, buf, { rootName: opts.rootName, useTimeline: true });
  agf.sources[0].personal_data_guard = { hits: guard.hits, confirmed_by_user: false };
  return { agf, summary: summary(doc), adapter: doc.adapter };
}
