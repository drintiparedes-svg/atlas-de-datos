/** Adaptador docx-diccionario en el navegador (JSZip + XML): mismas heurísticas que backend (SPEC §6.3).
 *  Párrafo sin numeración cuyo texto en negrita empieza con «N.» → sección; «Subcategoría:» → subsección;
 *  párrafo con numeración (w:numPr) → elemento; primer párrafo → título. */
import JSZip from "jszip";
import { el, sec, type IRDocument, type IRSection } from "./ir";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export async function parseDocx(filename: string, buf: ArrayBuffer): Promise<IRDocument> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("docx sin word/document.xml");
  const dom = new DOMParser().parseFromString(xml, "application/xml");
  const body = dom.getElementsByTagNameNS(W, "body")[0];
  const doc: IRDocument = { filename, title: null, source_type: "diccionario", adapter: "docx-diccionario@1.0", sections: [], relations: [], unparsed: [], meta: {} };
  const texts: string[] = [];
  let cur: IRSection | null = null, sub: IRSection | null = null;
  const paras = Array.from(body.getElementsByTagNameNS(W, "p"));
  paras.forEach((p, i) => {
    if (p.parentNode !== body && (p.parentNode as Element).localName !== "body") { /* párrafos dentro de tablas: se procesan aparte */ }
    const runs = Array.from(p.getElementsByTagNameNS(W, "r"));
    const runText = (r: Element) => Array.from(r.getElementsByTagNameNS(W, "t")).map((t) => t.textContent || "").join("");
    const isBold = (r: Element) => { const rpr = r.getElementsByTagNameNS(W, "rPr")[0]; if (!rpr) return false; const b = rpr.getElementsByTagNameNS(W, "b")[0]; if (!b) return false; const v = b.getAttributeNS(W, "val") ?? b.getAttribute("w:val"); return v === null || v === "" || v === "1" || v === "true" || v === "on"; };
    const t = runs.map(runText).join("").trim();
    if (!t) return;
    texts.push(t);
    if (p.closest && (p as Element).closest("tbl")) return;   // tablas: fuera del flujo principal
    if (doc.title === null) { doc.title = t; return; }
    const pPr = p.getElementsByTagNameNS(W, "pPr")[0];
    const isList = !!(pPr && pPr.getElementsByTagNameNS(W, "numPr").length);
    const bold = runs.filter(isBold).map(runText).join("").trim();
    const m = !isList ? bold.match(/^(\d+)\.\s*(.+)$/) : null;
    if (m) {
      const rest = runs.filter((r) => !isBold(r)).map(runText).join("").trim();
      cur = sec(m[2].replace(/[.\s]+$/, "").trim(), { paragraph: i }, { number: +m[1], description: rest || null });
      doc.sections.push(cur); sub = null; return;
    }
    if (/^subcategor[ií]a\s*:/i.test(t)) {
      if (!cur) { doc.unparsed.push({ locator: { paragraph: i }, text: t }); return; }
      sub = sec(t.split(":").slice(1).join(":").trim(), { paragraph: i }); cur.subsections.push(sub); return;
    }
    if (isList && cur) {
      const mm = t.match(/^([^:]{2,80}):\s+(.{8,})$/);
      const e = mm && !/^http/i.test(t) ? el(mm[1].trim(), { paragraph: i }, { raw: t, note: mm[2].trim() }) : el(t, { paragraph: i }, { raw: t });
      (sub || cur).elements.push(e); return;
    }
    if (cur && cur.description == null && !cur.elements.length && !cur.subsections.length) { cur.description = t; return; }
    doc.unparsed.push({ locator: { paragraph: i }, text: t });
  });
  // tablas con columna «Variable»
  Array.from(body.getElementsByTagNameNS(W, "tbl")).forEach((tbl, ti) => {
    const rows = Array.from(tbl.getElementsByTagNameNS(W, "tr")).map((tr) => Array.from(tr.getElementsByTagNameNS(W, "tc")).map((tc) => (tc.textContent || "").trim()));
    if (!rows.length) return;
    const head = rows[0].map((h) => h.toLowerCase());
    const nameCol = head.findIndex((h) => ["variable", "campo", "nombre", "elemento"].includes(h));
    if (nameCol < 0) { doc.unparsed.push({ locator: { table: ti }, text: `tabla ${ti + 1} sin columna de variable` }); return; }
    const typeCol = head.findIndex((h) => ["tipo", "tipo de dato", "type"].includes(h));
    const s = sec(`Tabla ${ti + 1}`, { table: ti });
    rows.slice(1).forEach((r, ri) => { if (r[nameCol]) { const e = el(r[nameCol], { table: ti, row: ri + 1 }, { raw: r.join(" | ") }); if (typeCol >= 0 && r[typeCol]) e.declared.data_type = r[typeCol]; s.elements.push(e); } });
    if (s.elements.length) doc.sections.push(s);
  });
  doc.text = texts.join("\n");
  return doc;
}
