import { all, json } from "../db.ts";
import { BM25 } from "./bm25.ts";
import { normalize } from "./text.ts";

export interface ChunkRow {
  id: number;
  file_id: number;
  file: string;
  kind: string;
  location: string;
  heading: string;
  text: string;
  topic_id: number | null;
}

interface CacheEntry {
  index: BM25;
  chunks: Map<number, ChunkRow>;
}

const cache = new Map<number, CacheEntry>();

export function invalidateIndex(subjectId: number) {
  cache.delete(subjectId);
}

function load(subjectId: number): CacheEntry {
  const hit = cache.get(subjectId);
  if (hit) return hit;
  // Solo entra material de ESTA materia y que no esté en cuarentena.
  const rows = all<ChunkRow>(
    `SELECT c.id, c.file_id, f.name AS file, f.kind, c.location, c.heading, c.text, c.topic_id
     FROM chunks c JOIN files f ON f.id = c.file_id
     WHERE c.subject_id = ? AND c.quarantined = 0 AND f.status NOT IN ('error','procesando')`,
    [subjectId],
  );
  const chunks = new Map(rows.map((r) => [r.id, r]));
  const index = new BM25(rows.map((r) => ({ id: r.id, text: r.text, boost: `${r.heading} ${r.file.replace(/\.[a-z]+$/i, "")}` })));
  const entry = { index, chunks };
  cache.set(subjectId, entry);
  return entry;
}

export interface SearchOpts {
  k?: number;
  topicId?: number | null;
  kinds?: string[];
  excludeKinds?: string[];
}

/**
 * Recuperación contextual: BM25 + expansión con palabras clave del tema mencionado.
 * Devuelve fragmentos con su archivo y ubicación para citar.
 */
export function search(subjectId: number, query: string, opts: SearchOpts = {}): (ChunkRow & { score: number })[] {
  const { index, chunks } = load(subjectId);
  let q = query;
  const topics = all<{ id: number; name: string; keywords: string }>("SELECT id, name, keywords FROM topics WHERE subject_id = ?", [subjectId]);
  const nq = normalize(query);
  for (const t of topics) {
    const kws = json<string[]>(t.keywords, []);
    if (nq.includes(normalize(t.name)) || kws.some((k) => k.length > 4 && nq.includes(normalize(k)))) q += " " + kws.slice(0, 4).join(" ");
  }
  const filter = (id: number) => {
    const c = chunks.get(id)!;
    if (opts.kinds && !opts.kinds.includes(c.kind)) return false;
    if (opts.excludeKinds && opts.excludeKinds.includes(c.kind)) return false;
    if (opts.topicId && c.topic_id !== opts.topicId) return false;
    return true;
  };
  const hits = index.search(q, opts.k ?? 6, filter);
  // Frases exactas de la consulta (p. ej. "ejercicio 1.7") suben al principio.
  const exact = /(ejercicio|ej\.?|pregunta|problema)\s*(\d+(?:[.,]\d+)?)/i.exec(query);
  const out = hits.map((h) => ({ ...chunks.get(h.id)!, score: h.score }));
  if (exact) {
    const re = new RegExp(`(ejercicio|ej\\.?|pregunta|problema)\\s*${exact[2].replace(/[.,]/, "[.,]")}(?!\\d)`, "i");
    const extra = [...chunks.values()].filter((c) => filter(c.id) && re.test(c.text) && !out.some((o) => o.id === c.id));
    out.unshift(...extra.slice(0, 3).map((c) => ({ ...c, score: 99 })));
    out.sort((a, b) => Number(re.test(b.text)) - Number(re.test(a.text)) || b.score - a.score);
  }
  return out.slice(0, opts.k ?? 6);
}

export function chunksOfSubject(subjectId: number): ChunkRow[] {
  return [...load(subjectId).chunks.values()];
}

export function chunkById(subjectId: number, id: number): ChunkRow | undefined {
  return load(subjectId).chunks.get(id);
}
