import { all, run, parseDbDate } from "../db.ts";
import type { Grade } from "../exercises/grade.ts";

export interface ErrorMemory {
  tag: string;
  label: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  daysSinceLast: number;
  passesSinceLast: number;
  active: boolean;
  topics: { id: number; name: string }[];
  details: string[];
}

/** Guarda los errores conceptuales detectados y las trampas superadas en una corrección. */
export function recordErrors(subjectId: number, topicId: number | null, attemptId: number, grade: Grade) {
  for (const e of grade.errors) {
    run("INSERT INTO error_events(subject_id, topic_id, tag, label, kind, attempt_id, detail) VALUES (?,?,?,?, 'error', ?, ?)", [subjectId, topicId, e.tag, e.label, attemptId, e.detail]);
  }
  for (const tag of grade.passedTraps) {
    // Solo interesa registrar que lo superaste si alguna vez fue un error.
    const had = all("SELECT 1 FROM error_events WHERE subject_id = ? AND tag = ? AND kind = 'error' LIMIT 1", [subjectId, tag]);
    if (had.length) run("INSERT INTO error_events(subject_id, topic_id, tag, label, kind, attempt_id) VALUES (?,?,?, '', 'superado', ?)", [subjectId, topicId, tag, attemptId]);
  }
}

/**
 * Un error sigue activo hasta que lo superás 2 veces después de la última vez que lo cometiste.
 */
export function errorMemory(subjectId: number, now = new Date()): ErrorMemory[] {
  const rows = all<any>(
    `SELECT e.*, t.name AS topic_name FROM error_events e LEFT JOIN topics t ON t.id = e.topic_id
     WHERE e.subject_id = ? ORDER BY e.created_at, e.id`,
    [subjectId],
  );
  const map = new Map<string, ErrorMemory & { _last: Date }>();
  for (const r of rows) {
    let m = map.get(r.tag);
    if (!m) {
      if (r.kind !== "error") continue;
      m = { tag: r.tag, label: r.label, count: 0, firstSeen: r.created_at, lastSeen: r.created_at, daysSinceLast: 0, passesSinceLast: 0, active: true, topics: [], details: [], _last: parseDbDate(r.created_at) };
      map.set(r.tag, m);
    }
    if (r.kind === "error") {
      m.count++;
      m.lastSeen = r.created_at;
      m._last = parseDbDate(r.created_at);
      m.passesSinceLast = 0;
      if (r.label) m.label = r.label;
      if (r.detail && !m.details.includes(r.detail)) m.details.push(r.detail);
      if (r.topic_id && !m.topics.some((t) => t.id === r.topic_id)) m.topics.push({ id: r.topic_id, name: r.topic_name });
    } else m.passesSinceLast++;
  }
  return [...map.values()]
    .map(({ _last, ...m }) => ({
      ...m,
      details: m.details.slice(-3),
      daysSinceLast: (now.getTime() - _last.getTime()) / 86400000,
      active: m.passesSinceLast < 2,
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || b.count - a.count || a.daysSinceLast - b.daysSinceLast);
}
