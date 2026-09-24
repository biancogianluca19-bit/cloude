import { all, get, run, tx, json } from "../db.ts";
import { normalize } from "../retrieval/text.ts";
import { TOPICS, topicByKey } from "../exercises/library.ts";

export interface TopicRow {
  id: number;
  subject_id: number;
  name: string;
  unit: string;
  keywords: string;
  library_key: string | null;
  description: string;
  ord: number;
  origin: string;
}

function countPhrase(hay: string, phrase: string): number {
  if (!phrase) return 0;
  let n = 0;
  let i = hay.indexOf(phrase);
  while (i !== -1) {
    const before = i === 0 ? " " : hay[i - 1];
    const after = hay[i + phrase.length] ?? " ";
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) n++;
    i = hay.indexOf(phrase, i + phrase.length);
  }
  return n;
}

export function topicScore(text: string, t: { name: string; keywords: string[] }): number {
  const hay = normalize(text);
  let s = 3 * countPhrase(hay, normalize(t.name));
  for (const k of t.keywords) {
    const nk = normalize(k);
    const w = nk.includes(" ") ? 2 : 1;
    s += Math.min(4, countPhrase(hay, nk)) * w;
  }
  return s;
}

/** Asigna cada fragmento al tema con más coincidencias (si supera un mínimo). */
export function assignTopics(subjectId: number) {
  const topics = all<TopicRow>("SELECT * FROM topics WHERE subject_id = ?", [subjectId]).map((t) => ({ ...t, kw: json<string[]>(t.keywords, []) }));
  const chunks = all<{ id: number; text: string; heading: string }>("SELECT id, text, heading FROM chunks WHERE subject_id = ?", [subjectId]);
  tx(() => {
    for (const c of chunks) {
      let best: number | null = null;
      let bestScore = 0;
      for (const t of topics) {
        const s = topicScore(c.text + " " + c.heading + " " + c.heading, { name: t.name, keywords: t.kw });
        if (s > bestScore) {
          bestScore = s;
          best = t.id;
        }
      }
      run("UPDATE chunks SET topic_id = ? WHERE id = ?", [bestScore >= 2 ? best : null, c.id]);
    }
  });
}

export interface TopicSuggestion {
  key?: string;
  name: string;
  unit: string;
  keywords: string[];
  hits: number;
  source: "biblioteca" | "titulos";
  evidence: string[];
}

/** Sugiere temas a partir del material: temas de la biblioteca que aparecen, y títulos de unidades. */
export function suggestTopics(subjectId: number): TopicSuggestion[] {
  const chunks = all<{ text: string; heading: string; location: string; file: string }>(
    "SELECT c.text, c.heading, c.location, f.name file FROM chunks c JOIN files f ON f.id = c.file_id WHERE c.subject_id = ? AND c.quarantined = 0",
    [subjectId],
  );
  const existing = new Set(all<{ library_key: string; name: string }>("SELECT library_key, name FROM topics WHERE subject_id = ?", [subjectId]).flatMap((t) => [t.library_key, normalize(t.name)]));
  const out: TopicSuggestion[] = [];
  for (const t of TOPICS) {
    if (existing.has(t.key)) continue;
    let hits = 0;
    const ev: string[] = [];
    for (const c of chunks) {
      const s = topicScore(c.text + " " + c.heading, { name: t.name, keywords: t.keywords });
      if (s >= 3) {
        hits++;
        if (ev.length < 3) ev.push(`${c.file}, ${c.location}`);
      }
    }
    if (hits >= 2) out.push({ key: t.key, name: t.name, unit: t.unit, keywords: t.keywords, hits, source: "biblioteca", evidence: ev });
  }
  // Títulos del tipo "Unidad 3: Carga fabril" en el material.
  const seen = new Set<string>();
  for (const c of chunks) {
    for (const line of (c.heading + "\n" + c.text).split("\n")) {
      const m = /^\s*(unidad|tema|m[oó]dulo)\s+(\d+)\s*[:.\-–]\s*(.{4,70})$/i.exec(line.trim());
      if (!m) continue;
      const name = m[3].replace(/[.:]+$/, "").trim();
      const key = normalize(name);
      if (seen.has(key) || existing.has(key) || out.some((o) => normalize(o.name) === key)) continue;
      seen.add(key);
      out.push({
        name,
        unit: `Unidad ${m[2]}`,
        keywords: name
          .toLowerCase()
          .split(/[,y]+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 3),
        hits: 1,
        source: "titulos",
        evidence: [`${c.file}, ${c.location}`],
      });
    }
  }
  return out.sort((a, b) => b.hits - a.hits);
}

export function createTopic(subjectId: number, t: { name: string; unit?: string; keywords?: string[]; libraryKey?: string; description?: string; origin?: string }): number {
  const ord = get<{ n: number }>("SELECT count(*) n FROM topics WHERE subject_id = ?", [subjectId])!.n;
  const lib = t.libraryKey ? topicByKey(t.libraryKey) : undefined;
  const { id } = run("INSERT INTO topics(subject_id, name, unit, keywords, library_key, description, ord, origin) VALUES (?,?,?,?,?,?,?,?)", [
    subjectId,
    t.name,
    t.unit ?? lib?.unit ?? "",
    JSON.stringify(t.keywords ?? lib?.keywords ?? [t.name.toLowerCase()]),
    t.libraryKey ?? null,
    t.description ?? lib?.description ?? "",
    ord,
    t.origin ?? (lib ? "biblioteca" : "manual"),
  ]);
  return id;
}

/** Crea temas de la biblioteca y conecta sus prerrequisitos entre sí. */
export function addLibraryTopics(subjectId: number, keys: string[]) {
  tx(() => {
    for (const k of keys) {
      const lib = topicByKey(k);
      if (!lib) continue;
      if (get("SELECT 1 FROM topics WHERE subject_id = ? AND library_key = ?", [subjectId, k])) continue;
      createTopic(subjectId, { name: lib.name, libraryKey: k });
    }
    linkLibraryEdges(subjectId);
  });
  assignTopics(subjectId);
}

export function linkLibraryEdges(subjectId: number) {
  const rows = all<TopicRow>("SELECT * FROM topics WHERE subject_id = ? AND library_key IS NOT NULL", [subjectId]);
  const byKey = new Map(rows.map((r) => [r.library_key!, r.id]));
  for (const r of rows) {
    for (const p of topicByKey(r.library_key!)?.prereqs ?? []) {
      const from = byKey.get(p);
      if (from) run("INSERT OR IGNORE INTO topic_edges(subject_id, from_id, to_id) VALUES (?,?,?)", [subjectId, from, r.id]);
    }
  }
}

export function topicsOf(subjectId: number) {
  return all<TopicRow>("SELECT * FROM topics WHERE subject_id = ? ORDER BY unit, ord", [subjectId]).map((t) => ({ ...t, keywords: json<string[]>(t.keywords, []) }));
}

export function edgesOf(subjectId: number) {
  return all<{ from_id: number; to_id: number }>("SELECT from_id, to_id FROM topic_edges WHERE subject_id = ?", [subjectId]);
}
