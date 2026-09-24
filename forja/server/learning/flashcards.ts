import { all, get, run } from "../db.ts";
import { normalize, truncate } from "../retrieval/text.ts";
import { getProfile } from "../profile/professor.ts";
import { extractDefinitions } from "../exercises/definitions.ts";
import { errorMemory } from "./errors.ts";
import { TEMPLATES } from "../exercises/library.ts";
import { activeExam, examTopicIds } from "./plan.ts";
import { topicScore } from "./topics.ts";

// Tarjetas: pocas y útiles. Prioridad: tus errores > fórmulas del profesor > definiciones
// de temas del examen > fórmulas generales. Tope por materia.

const MAX_CARDS = 45;

interface Candidate {
  front: string;
  back: string;
  origin: "error" | "formula" | "definicion" | "formula_general";
  source: string;
  chunkId: number | null;
  topicId: number | null;
  priority: number;
  key: string;
}

function topicFor(subjectId: number, text: string): number | null {
  const topics = all<{ id: number; name: string; keywords: string }>("SELECT id, name, keywords FROM topics WHERE subject_id = ?", [subjectId]);
  let best: number | null = null;
  let bs = 0;
  for (const t of topics) {
    const s = topicScore(text, { name: t.name, keywords: JSON.parse(t.keywords) });
    if (s > bs) {
      bs = s;
      best = t.id;
    }
  }
  return bs >= 1 ? best : null;
}

export function generateFlashcards(subjectId: number): { added: number; total: number } {
  const cands: Candidate[] = [];
  const examIds = new Set(examTopicIds(subjectId, activeExam(subjectId)));

  for (const e of errorMemory(subjectId).filter((x) => x.active)) {
    const tpl = TEMPLATES.find((t) => t.traps.some((tr) => tr.tag === e.tag));
    const trap = tpl?.traps.find((tr) => tr.tag === e.tag);
    const step = tpl?.steps.find((s) => s.id === trap?.step);
    cands.push({
      front: `Error que cometiste ${e.count} ${e.count === 1 ? "vez" : "veces"}: «${e.label}». ¿Cuál es la forma correcta?`,
      back: step ? `${step.formulaText}.${trap ? " " + trap.message.replace(/\{\w+\}/g, "").replace(/\(\s*\)/g, "") : ""}` : e.details[0] ?? e.label,
      origin: "error",
      source: "Tu memoria de errores",
      chunkId: null,
      topicId: e.topics[0]?.id ?? null,
      priority: 1 + Math.min(0.5, e.count * 0.1),
      key: "error:" + e.tag,
    });
  }

  const profile = getProfile(subjectId);
  for (const f of profile?.formulas ?? []) {
    const m = /^(?:f[oó]rmula\s*:\s*)?([^=]{2,60})=(.+)$/i.exec(f.text);
    if (!m) continue;
    const left = m[1].replace(/^[•\-–·*\d.)\s]+/, "").trim();
    if (!/[a-záéíóú]/i.test(left)) continue;
    const ev = f.evidence[0];
    const tid = ev ? (get<{ topic_id: number }>("SELECT topic_id FROM chunks WHERE id = ?", [ev.chunkId])?.topic_id ?? null) : null;
    cands.push({
      front: `¿Cómo se calcula ${left}? (según el material de la cátedra)`,
      back: f.text,
      origin: "formula",
      source: ev ? `${ev.file}, ${ev.location}` : "",
      chunkId: ev?.chunkId ?? null,
      topicId: tid,
      priority: 0.9 + (tid && examIds.has(tid) ? 0.1 : 0) + Math.min(0.1, (f.count ?? 1) * 0.03),
      key: "formula:" + normalize(f.text).replace(/\s+/g, ""),
    });
  }

  for (const d of extractDefinitions(subjectId)) {
    cands.push({
      front: `¿Qué es ${d.term.toLowerCase()}?`,
      back: `${d.term}: ${d.definition}.`,
      origin: "definicion",
      source: `${d.citation.file}, ${d.citation.location}`,
      chunkId: d.citation.chunkId,
      topicId: d.topicId,
      priority: 0.6 + (d.topicId && examIds.has(d.topicId) ? 0.2 : 0),
      key: "def:" + normalize(d.term),
    });
  }

  // Fórmulas generales de la biblioteca, solo para temas de la materia sin fórmulas en el material.
  const libTopics = all<{ id: number; library_key: string }>("SELECT id, library_key FROM topics WHERE subject_id = ? AND library_key IS NOT NULL", [subjectId]);
  const topicsWithFormula = new Set(cands.filter((c) => c.origin === "formula").map((c) => c.topicId));
  for (const t of libTopics) {
    if (topicsWithFormula.has(t.id)) continue;
    for (const tpl of TEMPLATES.filter((x) => x.topic === t.library_key)) {
      for (const s of tpl.steps.slice(0, 2)) {
        cands.push({
          front: `¿Cómo se calcula: ${s.label.toLowerCase()}?`,
          back: `${s.formulaText}.`,
          origin: "formula_general",
          source: "Conocimiento académico general (no del profesor)",
          chunkId: null,
          topicId: t.id,
          priority: 0.45 + (examIds.has(t.id) ? 0.1 : 0),
          key: "gen:" + normalize(s.formulaText).replace(/\s+/g, ""),
        });
      }
    }
  }

  const existing = get<{ n: number }>("SELECT count(*) n FROM flashcards WHERE subject_id = ?", [subjectId])!.n;
  const room = Math.max(0, MAX_CARDS - existing);
  const seen = new Set(all<{ dedupe_key: string }>("SELECT dedupe_key FROM flashcards WHERE subject_id = ?", [subjectId]).map((r) => r.dedupe_key));
  const fresh = cands.filter((c) => !seen.has(c.key)).sort((a, b) => b.priority - a.priority);
  // Los errores siempre entran, aunque se pase el tope.
  const chosen = [...fresh.filter((c) => c.origin === "error"), ...fresh.filter((c) => c.origin !== "error").slice(0, room)];
  const uniq = new Map<string, Candidate>();
  chosen.forEach((c) => uniq.set(c.key, c));
  for (const c of uniq.values()) {
    run("INSERT OR IGNORE INTO flashcards(subject_id, topic_id, front, back, origin, source, chunk_id, dedupe_key, priority) VALUES (?,?,?,?,?,?,?,?,?)", [
      subjectId,
      c.topicId ?? topicFor(subjectId, c.front + " " + c.back),
      truncate(c.front, 300),
      truncate(c.back, 600),
      c.origin,
      c.source,
      c.chunkId,
      c.key,
      c.priority,
    ]);
  }
  const total = get<{ n: number }>("SELECT count(*) n FROM flashcards WHERE subject_id = ?", [subjectId])!.n;
  return { added: uniq.size, total };
}

export function dueCards(subjectId: number, limit = 20) {
  return all<any>(
    `SELECT f.*, t.name AS topic_name FROM flashcards f LEFT JOIN topics t ON t.id = f.topic_id
     WHERE f.subject_id = ? AND f.due_at <= datetime('now') ORDER BY f.reps = 0, f.priority DESC, f.due_at LIMIT ?`,
    [subjectId, limit],
  );
}
