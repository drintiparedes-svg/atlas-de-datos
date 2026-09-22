// Copia muestras, perfil y configuración a public/data (el visor los lee por fetch).
// Convierte config/standards.yaml y config/timelines/oncologia.yaml (YAML de flujo simple) a JSON sin dependencias.
import { cpSync, mkdirSync, readdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const out = join(here, "..", "public", "data");
mkdirSync(out, { recursive: true });
for (const f of readdirSync(join(root, "samples"))) if (f.endsWith(".json")) cpSync(join(root, "samples", f), join(out, f));
cpSync(join(root, "profiles", "default.json"), join(out, "profile.default.json"));
cpSync(join(root, "config", "inference.json"), join(out, "inference.json"));

/** Convierte un valor YAML de flujo ({...}, [...], "..", bare) a JSON. Suficiente para los archivos de config. */
function flowToJson(s) {
  let i = 0;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const bare = (stops) => { let start = i; while (i < s.length && !stops.includes(s[i])) i++; return s.slice(start, i).trim(); };
  const scalar = (t) => (t === "true" ? true : t === "false" ? false : t === "null" || t === "" ? null : /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t);
  const value = (stops) => {
    ws();
    if (s[i] === '"') { let j = i + 1, o = ""; while (j < s.length && s[j] !== '"') { if (s[j] === "\\") { o += s[j + 1]; j += 2; } else o += s[j++]; } i = j + 1; return o; }
    if (s[i] === "'") { let j = i + 1, o = ""; while (j < s.length && s[j] !== "'") o += s[j++]; i = j + 1; return o; }
    if (s[i] === "{") { i++; const obj = {}; ws(); if (s[i] === "}") { i++; return obj; } while (i < s.length) { ws(); const k = bare([":"]).replace(/^["']|["']$/g, ""); i++; obj[k] = value([",", "}"]); ws(); if (s[i] === ",") { i++; continue; } if (s[i] === "}") { i++; break; } } return obj; }
    if (s[i] === "[") { i++; const arr = []; ws(); if (s[i] === "]") { i++; return arr; } while (i < s.length) { arr.push(value([",", "]"])); ws(); if (s[i] === ",") { i++; continue; } if (s[i] === "]") { i++; break; } } return arr; }
    return scalar(bare(stops));
  };
  return value([]);
}
const stdYaml = readFileSync(join(root, "config", "standards.yaml"), "utf8");
const standards = {};
for (const line of stdYaml.split("\n")) { const m = line.match(/^([a-z0-9_]+):\s*(\{.*\})\s*$/); if (m) standards[m[1]] = flowToJson(m[2]); }
writeFileSync(join(out, "standards.json"), JSON.stringify(standards, null, 1));
const tl = join(root, "config", "timelines", "oncologia.yaml");
if (existsSync(tl)) {
  const edges = [];
  for (const line of readFileSync(tl, "utf8").split("\n")) { const m = line.match(/^\s*-\s*(\[.*\])\s*$/); if (m) edges.push(flowToJson(m[1])); }
  writeFileSync(join(out, "timeline.oncologia.json"), JSON.stringify({ edges }, null, 1));
}
console.log("datos sincronizados en public/data:", Object.keys(standards).length, "estándares");
