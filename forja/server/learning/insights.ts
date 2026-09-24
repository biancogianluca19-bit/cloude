import { all, get, parseDbDate } from "../db.ts";
import { computeMastery } from "./mastery.ts";
import { errorMemory } from "./errors.ts";
import { activeExam, examTopicIds, nextActions, readiness, daysUntil } from "./plan.ts";

export function dashboard(subjectId: number) {
  const subject = get<any>("SELECT * FROM subjects WHERE id = ?", [subjectId]);
  if (!subject) throw new Error("Materia inexistente");
  const exam = activeExam(subjectId);
  const ids = new Set(examTopicIds(subjectId, exam));
  const ms = computeMastery(subjectId).filter((m) => ids.has(m.topicId));
  const mocks = all<any>("SELECT id, title, score, submitted_at FROM mocks WHERE subject_id = ? AND status = 'entregado' ORDER BY submitted_at DESC", [subjectId]);
  const errs = errorMemory(subjectId).filter((e) => e.active).slice(0, 5);
  const studied = ms.filter((m) => m.attempts > 0 || m.reads > 0).length;
  const files = get<any>("SELECT count(*) n, sum(status = 'revisar') review FROM files WHERE subject_id = ?", [subjectId]);
  return {
    subject,
    exam: exam ? { ...exam, daysLeft: daysUntil(exam.date), topicCount: ids.size } : null,
    coverage: { studied, total: ms.length },
    mocks: { count: mocks.length, avg: mocks.length ? mocks.reduce((a, m) => a + m.score, 0) / mocks.length : null, last: mocks[0] ?? null },
    strong: ms.filter((m) => m.status === "fuerte").map((m) => ({ id: m.topicId, name: m.name, effective: m.effective })),
    weak: ms.filter((m) => m.status === "debil").sort((a, b) => a.effective - b.effective).map((m) => ({ id: m.topicId, name: m.name, effective: m.effective })),
    unstudied: ms.filter((m) => m.status === "sin_estudiar").map((m) => ({ id: m.topicId, name: m.name })),
    errors: errs,
    readiness: readiness(subjectId, exam),
    next: nextActions(subjectId).slice(0, 3),
    files: { count: files?.n ?? 0, review: files?.review ?? 0 },
  };
}

/** "¿Estoy para aprobar?": solo datos. No promete nada. */
export function verdict(subjectId: number) {
  const subject = get<any>("SELECT * FROM subjects WHERE id = ?", [subjectId])!;
  const exam = activeExam(subjectId);
  const ids = new Set(examTopicIds(subjectId, exam));
  const threshold = subject.pass_threshold ?? 0.6;
  const mocks = all<any>("SELECT id, title, score, submitted_at FROM mocks WHERE subject_id = ? AND status = 'entregado' ORDER BY submitted_at", [subjectId]).map((m) => ({ ...m, submitted_at: parseDbDate(m.submitted_at).toISOString() }));
  const recent = all<{ score: number; created_at: string; topic_id: number }>(
    "SELECT score, created_at, topic_id FROM attempts WHERE subject_id = ? AND created_at > datetime('now', '-14 day') ORDER BY created_at",
    [subjectId],
  );
  const ms = computeMastery(subjectId).filter((m) => ids.has(m.topicId));
  const last3 = mocks.slice(-3);
  const avgLast3 = last3.length ? last3.reduce((a, m) => a + m.score, 0) / last3.length : null;
  const correctPct = recent.length ? recent.filter((r) => r.score >= 0.7).length / recent.length : null;
  // Evolución: promedio diario de puntajes.
  const byDay = new Map<string, number[]>();
  for (const r of all<{ score: number; d: string }>("SELECT score, date(created_at) d FROM attempts WHERE subject_id = ? ORDER BY created_at", [subjectId])) {
    byDay.set(r.d, [...(byDay.get(r.d) ?? []), r.score]);
  }
  const evolution = [...byDay.entries()].map(([d, xs]) => ({ date: d, avg: xs.reduce((a, b) => a + b, 0) / xs.length, n: xs.length }));
  const statements: string[] = [];
  if (avgLast3 !== null) {
    statements.push(
      `Tus últimos ${last3.length} simulacro(s) promedian ${Math.round(avgLast3 * 100)}%, ${avgLast3 >= threshold ? "por encima" : "por debajo"} del ${Math.round(threshold * 100)}% que usás como referencia para aprobar.`,
    );
  } else statements.push("Todavía no hiciste simulacros: sin ellos no hay una medición en condiciones de examen.");
  if (correctPct !== null) statements.push(`En los últimos 14 días resolviste bien el ${Math.round(correctPct * 100)}% de ${recent.length} ejercicios (70% o más de puntaje).`);
  const weak = ms.filter((m) => m.status === "debil");
  const unpracticed = ms.filter((m) => m.attempts === 0);
  if (weak.length) statements.push(`Temas todavía débiles: ${weak.map((m) => m.name).join(", ")}.`);
  if (unpracticed.length) statements.push(`Temas del examen sin practicar: ${unpracticed.map((m) => m.name).join(", ")}.`);
  if (evolution.length >= 2) {
    const first = evolution.slice(0, Math.ceil(evolution.length / 2));
    const second = evolution.slice(Math.ceil(evolution.length / 2));
    const a = first.reduce((x, e) => x + e.avg, 0) / first.length;
    const b = second.reduce((x, e) => x + e.avg, 0) / second.length;
    statements.push(`Evolución: tu promedio pasó de ${Math.round(a * 100)}% a ${Math.round(b * 100)}% entre la primera y la segunda mitad de tus días de práctica.`);
  }
  return {
    threshold,
    exam,
    mocks,
    avgLast3,
    recentCount: recent.length,
    correctPct,
    weak: weak.map((m) => ({ id: m.topicId, name: m.name, effective: m.effective })),
    unpracticed: unpracticed.map((m) => ({ id: m.topicId, name: m.name })),
    evolution,
    statements,
    disclaimer: "Esto resume tus resultados en FORJA. No es una predicción de la nota: el parcial real puede tomar cosas distintas y corregirse con otro criterio.",
  };
}
