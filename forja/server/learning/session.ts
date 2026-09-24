import { all, get, run, json, parseDbDate } from "../db.ts";
import { nextActions, type NextAction } from "./plan.ts";
import { dueCards } from "./flashcards.ts";
import { createExercise } from "../exercises/service.ts";

// Sesión de estudio con tiempo fijo: FORJA elige una tarea por vez según el examen,
// tu nivel, tus errores y el material pendiente.

export interface Task {
  kind: NextAction["kind"];
  title: string;
  detail: string;
  minutes: number;
  status: "actual" | "hecha" | "salteada";
  topicId?: number;
  exerciseId?: number;
  cardIds?: number[];
  chunkIds?: number[];
  startedAt: string;
  endedAt?: string;
  score?: number | null;
}

export function startSession(subjectId: number, minutes: number) {
  const m = Math.max(10, Math.min(240, Math.round(minutes)));
  return run("INSERT INTO study_sessions(subject_id, minutes) VALUES (?, ?)", [subjectId, m]).id;
}

function load(id: number) {
  const s = get<any>("SELECT * FROM study_sessions WHERE id = ?", [id]);
  if (!s) throw new Error("Sesión inexistente");
  return { ...s, tasks: json<Task[]>(s.tasks, []) };
}

function save(id: number, tasks: Task[], ended = false) {
  run(`UPDATE study_sessions SET tasks = ?${ended ? ", ended_at = datetime('now')" : ""} WHERE id = ?`, [JSON.stringify(tasks), id]);
}

function remaining(s: { minutes: number; started_at: string; tasks: Task[] }, now = new Date()) {
  const elapsed = (now.getTime() - parseDbDate(s.started_at).getTime()) / 60000;
  const planned = s.tasks.filter((t) => t.status === "hecha").reduce((a, t) => a + t.minutes, 0);
  return s.minutes - Math.max(elapsed, planned);
}

export async function sessionState(id: number) {
  const s = load(id);
  const tasks = s.tasks;
  const cur = tasks.find((t: Task) => t.status === "actual");
  // Un ejercicio se da por hecho cuando se entregó.
  if (cur?.exerciseId) {
    const a = get<{ score: number }>("SELECT score FROM attempts WHERE exercise_id = ? ORDER BY id DESC LIMIT 1", [cur.exerciseId]);
    if (a) {
      cur.status = "hecha";
      cur.score = a.score;
      cur.endedAt = new Date().toISOString();
      save(id, tasks);
    }
  }
  return view(id);
}

function view(id: number) {
  const s = load(id);
  const rem = remaining(s);
  const done = s.tasks.filter((t: Task) => t.status === "hecha");
  const scores = done.map((t: Task) => t.score).filter((x: any): x is number => typeof x === "number");
  return {
    id: s.id,
    subjectId: s.subject_id,
    minutes: s.minutes,
    startedAt: parseDbDate(s.started_at).toISOString(),
    endedAt: s.ended_at ? parseDbDate(s.ended_at).toISOString() : null,
    remainingMin: Math.max(0, Math.round(rem)),
    tasks: s.tasks,
    current: s.tasks.find((t: Task) => t.status === "actual") ?? null,
    summary: { done: done.length, exercises: scores.length, avg: scores.length ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null },
  };
}

/** Elige la próxima tarea. Nunca repite el mismo tema dos veces seguidas si hay alternativa. */
export async function nextTask(id: number, skip = false) {
  const s = load(id);
  const tasks: Task[] = s.tasks;
  const cur = tasks.find((t) => t.status === "actual");
  if (cur) {
    if (!skip && cur.exerciseId && !get("SELECT 1 FROM attempts WHERE exercise_id = ?", [cur.exerciseId])) return view(id);
    cur.status = skip ? "salteada" : "hecha";
    cur.endedAt = new Date().toISOString();
    if (!skip && cur.kind === "leer") for (const c of cur.chunkIds ?? []) run("INSERT INTO reading_events(subject_id, topic_id, chunk_id) VALUES (?,?,?)", [s.subject_id, cur.topicId ?? null, c]);
    if (cur.exerciseId) cur.score = get<{ score: number }>("SELECT score FROM attempts WHERE exercise_id = ? ORDER BY id DESC LIMIT 1", [cur.exerciseId])?.score ?? null;
  }
  const rem = remaining({ ...s, tasks });
  if (rem < 4) {
    save(id, tasks, true);
    return view(id);
  }
  const lastTopic = [...tasks].reverse().find((t) => t.topicId)?.topicId;
  const doneKinds = tasks.map((t) => t.kind);
  const actions = nextActions(s.subject_id).filter((a) => {
    if (a.kind === "simulacro") return false;
    if (a.kind === "tarjetas" && doneKinds.filter((k) => k === "tarjetas").length >= 2) return false;
    if (a.kind === "leer" && tasks.some((t) => t.kind === "leer" && t.topicId === a.topicId)) return false;
    return true;
  });
  const pick = actions.find((a) => a.topicId !== lastTopic || !a.topicId) ?? actions[0];
  if (!pick) {
    save(id, tasks, true);
    return view(id);
  }
  const minutes = Math.min(pick.minutes, Math.max(3, Math.floor(rem)));
  const task: Task = { kind: pick.kind, title: pick.title, detail: pick.detail, minutes, status: "actual", topicId: pick.topicId, startedAt: new Date().toISOString() };
  if (pick.kind === "tarjetas") task.cardIds = dueCards(s.subject_id, Math.max(3, Math.min(15, minutes))).map((c: any) => c.id);
  else if (pick.kind === "leer") {
    task.chunkIds = all<{ id: number }>("SELECT id FROM chunks WHERE subject_id = ? AND topic_id = ? AND quarantined = 0 ORDER BY file_id, ord LIMIT 3", [s.subject_id, pick.topicId]).map((c) => c.id);
  } else if (pick.kind === "error") task.exerciseId = await createExercise(s.subject_id, { errorTag: pick.errorTag, origin: "sesion" });
  else if (pick.kind === "tema") {
    // Cada tres tareas de práctica, una pregunta teórica.
    const practiced = tasks.filter((t) => t.kind === "tema").length;
    task.exerciseId = await createExercise(s.subject_id, { topicId: pick.topicId, origin: "sesion", kind: practiced % 3 === 2 ? "teoria" : "auto" }).catch(() =>
      createExercise(s.subject_id, { topicId: pick.topicId, origin: "sesion" }),
    );
  }
  tasks.push(task);
  save(id, tasks);
  return view(id);
}

export function endSession(id: number) {
  const s = load(id);
  const cur = s.tasks.find((t: Task) => t.status === "actual");
  if (cur) cur.status = "salteada";
  save(id, s.tasks, true);
  return view(id);
}
