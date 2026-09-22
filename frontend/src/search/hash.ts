/** Proveedor `hash`: espejo exacto de backend/atlas/embeddings/hashing.py.
 *  Vectores léxicos deterministas (FNV-1a sobre palabras y trigramas, 256 dimensiones, norma L2 = 1).
 *  Permite consultas libres en el navegador sin ningún modelo ni red. */
import { charNgrams, tokens } from "../lib/text";

export const DIM = 256;

export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  const bytes = new TextEncoder().encode(s);
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export interface EmbeddingProvider {
  name: string;
  model: string;
  embed(texts: string[], kind?: "passage" | "query"): Promise<number[][]>;
}

export const hashProvider: EmbeddingProvider = {
  name: "hash",
  model: "fnv1a-trigram-256",
  async embed(texts) {
    return texts.map(hashOne);
  },
};

export function hashOne(text: string): number[] {
  const v = new Array<number>(DIM).fill(0);
  for (const w of tokens(text)) {
    const h = fnv1a("w:" + w);
    v[h % DIM] += (h & 0x80000000) === 0 ? 2 : -2;
  }
  for (const g of charNgrams(text, 3)) {
    const h = fnv1a("g:" + g);
    v[h % DIM] += (h & 0x80000000) === 0 ? 1 : -1;
  }
  return normalize(v);
}

/** Registro de proveedores: `hash` siempre; un proveedor externo (p. ej. transformers.js con un modelo
 *  abierto) puede registrarse desde `window.atlasRegisterEmbeddings(provider)` cuando la IA local está
 *  activada por el usuario. Con IA apagada no se carga ningún módulo remoto. */
const providers: Record<string, EmbeddingProvider> = { hash: hashProvider };
export function registerProvider(p: EmbeddingProvider) { providers[p.name] = p; }
export function getProvider(name: string): EmbeddingProvider | null { return providers[name] || null; }
