import { all, get, json, parseDbDate, getSetting, setSetting } from "../db.ts";
import { computeMastery, type TopicMastery, STATUS_LABEL } from "./mastery.ts";
import { errorMemory, type ErrorMemory } from "./errors.ts";
import { templatesFor, templatesWithTrap } from "../exercises/library.ts";

export interface ExamRow {
  id: number;
  subject_id: number;
  title: string;
  date: string;
  units: string;
  topic_ids: string;
  daily_minutes: number;
  active: number;
}

export function activeExam(subjectId: number): ExamRow | undefined {
  return get<ExamRow>("SELECT * FROM exams WHERE subject_id = ? AND active = 1 ORDER BY date LIMIT 1", [subjectId]);
}

export function examTopicIds(subjectId: number, exam?: ExamRow): number[] {
  const ids = exam ? json<number[]>(exam.topic_ids, []) : [];
  if (ids.length) return ids;
  return all<{ id: number }>("SELECT id FROM topics WHERE subject_id = ?", [subjectId]).map((t) => t.id);
}

/**
 * Importancia de cada tema según cuánto aparece en parciales, corregidos y resueltos.
 * Si no hay parciales cargados, todos los temas pesan igual.
 */
export function topicImportance(subjectId: number): Map<number, { importance: number; examHits: number }> {
  const rows = all<{ topic_id: number; n: number }>(
    `SELECT c.topic_id, count(*) n FROM chunks c JOIN files f ON f.id = c.file_id
     WHERE c.subject_id = ? AND c.topic_id IS NOT NULL AND f.kind IN ('parcial','corregido','resuelto') AND c.quarantined = 0
     GROUP BY c.topic_id`,
    [subjectId],
  );
  const topics = all<{ id: number }>("SELECT id FROM topics WHERE subject_id = ?", [subjectId]);
  const max = Math.max(0, ...rows.map((r) => r.n));
  const m = new Map<number, { importance: number; examHits: number }>();
  for (const t of topics) {
    const n = rows.find((r) => r.topic_id === t.id)?.n ?? 0;
    m.set(t.id, { importance: max ? 0.6 + 0.8 * (n / max) : 1, examHits: n });
  }
  return m;
}

export interface Priority {
  topicId: number;
  name: string;
  priority: number;
  status: TopicMastery["status"];
  effective: number;
  importance: number;
  reasons: string[];
  hasExercises: boolean;
}

export function priorities(subjectId: number, exam?: ExamRow, now = new Date()): Priority[] {
  const ids = new Set(examTopicIds(subjectId, exam));
  const mastery = computeMastery(subjectId, now).filter((m) => ids.has(m.topicId));
  const imp = topicImportance(subjectId);
  const errs = errorMemory(subjectId, now).filter((e) => e.active);
  const hasMaterial = new Set(all<{ topic_id: number }>("SELECT DISTINCT topic_id FROM chunks WHERE subject_id = ? AND topic_id IS NOT NULL", [subjectId]).map((r) => r.topic_id));
  return mastery
    .map((m) => {
      const im = imp.get(m.topicId) ?? { importance: 1, examHits: 0 };
      const myErrs = errs.filter((e) => e.topics.some((t) => t.id === m.topicId));
      const reasons: string[] = [];
      let p = im.importance * (1 - m.effective);
      if (m.status === "sin_estudiar") {
        p += 0.25;
        reasons.push("todavía no lo practicaste");
      } else {
        reasons.push(`dominio ${Math.round(m.effective * 100)}% (${m.correct} de ${m.attempts} ejercicios bien)`);
      }
      if (myErrs.length) {
        p += 0.15 * Math.min(3, myErrs.reduce((a, e) => a + e.count, 0));
        reasons.push(`error recurrente: ${myErrs[0].label.toLowerCase()} (${myErrs[0].count} ${myErrs[0].count === 1 ? "vez" : "veces"})`);
      }
      if (m.attempts > 0 && m.retention < 0.5) {
        p += 0.1;
        reasons.push(`hace ${Math.round(m.daysSince ?? 0)} días que no lo practicás`);
      }
      if (im.examHits > 0) reasons.push(`aparece en ${im.examHits} fragmento(s) de parciales`);
      if (m.status === "fuerte") reasons.push("fuerte: se reduce su práctica");
      return {
        topicId: m.topicId,
        name: m.name,
        priority: Math.round(p * 1000) / 1000,
        status: m.status,
        effective: m.effective,
        importance: im.importance,
        reasons,
        hasExercises: (!!m.libraryKey && templatesFor(m.libraryKey).length > 0) || hasMaterial.has(m.topicId),
      };
    })
    .sort((a, b) => b.priority - a.priority);
}

export function daysUntil(dateStr: string, now = new Date()): number {
  const d = new Date(dateStr);
  return (d.getTime() - now.getTime()) / 86400000;
}

export interface PlanDay {
  date: string;
  label: string;
  minutes: number;
  blocks: { kind: "tema" | "simulacro" | "repaso" | "tarjetas"; topicId?: number; title: string; minutes: number; why: string }[];
}

export interface Plan {
  exam: ExamRow;
  daysLeft: number;
  hoursLeft: number;
  totalMinutes: number;
  priorities: Priority[];
  days: PlanDay[];
  changes: { topic: string; from: number; to: number; direction: "sube" | "baja"; why: string }[];
}

const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Plan día por día hasta el examen. Se recalcula cada vez con tus resultados actuales. */
export function buildPlan(subjectId: number, exam: ExamRow, now = new Date()): Plan {
  const pr = priorities(subjectId, exam, now);
  const examDate = new Date(exam.date);
  const hoursLeft = Math.max(0, (examDate.getTime() - now.getTime()) / 3600000);
  const days: PlanDay[] = [];
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastDay = new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate());
  const nDays = Math.max(0, Math.round((lastDay.getTime() - start.getTime()) / 86400000));
  const budget = exam.daily_minutes || 90;
  // Cuánto "necesita" cada tema: prioridad normalizada. Se descuenta a medida que se asigna (espaciado).
  const need = new Map(pr.map((p) => [p.topicId, Math.max(0.05, p.priority)]));
  const lastMock = get<{ started_at: string }>("SELECT started_at FROM mocks WHERE subject_id = ? ORDER BY started_at DESC LIMIT 1", [subjectId]);

  for (let i = 0; i < Math.min(nDays, 21); i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const remainingDays = nDays - i;
    const isToday = i === 0;
    const minutes = isToday ? Math.min(budget, Math.max(20, Math.round(Math.min(budget, (24 - now.getHours()) * 60 * 0.4)))) : budget;
    const blocks: PlanDay["blocks"] = [];
    let left = minutes;
    const mockDay = remainingDays === 2 || (nDays >= 7 && remainingDays === Math.round(nDays / 2) + 1);
    if (remainingDays === 1) {
      blocks.push({ kind: "repaso", title: "Repaso de errores recurrentes", minutes: Math.round(minutes * 0.5), why: "El día antes conviene reforzar lo que ya fallaste, no temas nuevos." });
      blocks.push({ kind: "tarjetas", title: "Tarjetas vencidas y fórmulas", minutes: Math.round(minutes * 0.5), why: "Repaso liviano de fórmulas y definiciones." });
      left = 0;
    } else if (mockDay && !(lastMock && (now.getTime() - parseDbDate(lastMock.started_at).getTime()) / 86400000 < 1 && isToday)) {
      const mockMin = Math.min(left, 120);
      blocks.push({ kind: "simulacro", title: "Simulacro completo con tiempo", minutes: mockMin, why: remainingDays === 2 ? "Dos días antes: medir cómo estás en condiciones reales y dejar un día para corregir." : "Mitad del plan: control de avance." });
      left -= mockMin;
    }
    if (left >= 15) {
      blocks.push({ kind: "tarjetas", title: "Tarjetas de repaso", minutes: 10, why: "Repetición espaciada: lo que toca repasar hoy." });
      left -= 10;
      // Hasta 3 temas por día, elegidos por necesidad restante.
      const chosen = [...need.entries()].sort((a, b) => b[1] - a[1]).slice(0, left >= 60 ? 3 : left >= 30 ? 2 : 1);
      const totalNeed = chosen.reduce((a, [, v]) => a + v, 0) || 1;
      for (const [tid, v] of chosen) {
        const p = pr.find((x) => x.topicId === tid)!;
        const m = Math.max(10, Math.round(((left * v) / totalNeed) / 5) * 5);
        blocks.push({ kind: "tema", topicId: tid, title: p.name, minutes: m, why: p.reasons.slice(0, 2).join("; ") });
        need.set(tid, v * 0.55); // ya se trabajó: baja para dar lugar a otros (espaciado)
      }
    }
    days.push({ date: ymd(d), label: isToday ? "Hoy" : i === 1 ? "Mañana" : `${DAY_NAMES[d.getDay()]} ${d.getDate()}`, minutes, blocks });
  }

  // Cambios respecto del cálculo anterior a tu última práctica.
  const prev = json<{ topicId: number; priority: number }[]>(getSetting(`plan_prev_${subjectId}`), []);
  const changes: Plan["changes"] = [];
  for (const p of pr) {
    const before = prev.find((x) => x.topicId === p.topicId);
    if (!before) continue;
    const delta = p.priority - before.priority;
    if (Math.abs(delta) >= 0.05) {
      changes.push({
        topic: p.name,
        from: before.priority,
        to: p.priority,
        direction: delta > 0 ? "sube" : "baja",
        why: delta > 0 ? `más práctica: ${p.reasons[0]}` : `menos práctica: ${p.reasons[0]}`,
      });
    }
  }
  return {
    exam,
    daysLeft: Math.max(0, daysUntil(exam.date, now)),
    hoursLeft,
    totalMinutes: days.reduce((a, d) => a + d.minutes, 0),
    priorities: pr,
    days,
    changes,
  };
}

/** Se guarda justo antes de registrar una práctica, para poder mostrar qué cambió después. */
export function snapshotPriorities(subjectId: number) {
  const exam = activeExam(subjectId);
  const pr = priorities(subjectId, exam).map((p) => ({ topicId: p.topicId, priority: p.priority }));
  setSetting(`plan_prev_${subjectId}`, JSON.stringify(pr));
}

// ------------------------------------------------------------------ Readiness

export interface Factor {
  key: string;
  label: string;
  weight: number;
  value: number;
  contribution: number;
  detail: string;
}

export interface Readiness {
  score: number;
  factors: Factor[];
  formula: string;
  caveat: string;
}

export const READINESS_WEIGHTS = {
  dominio: 0.35,
  simulacros: 0.25,
  cobertura: 0.15,
  retencion: 0.1,
  errores: 0.1,
  reciente: 0.05,
};

export function readiness(subjectId: number, exam?: ExamRow, now = new Date()): Readiness {
  const ids = new Set(examTopicIds(subjectId, exam));
  const ms = computeMastery(subjectId, now).filter((m) => ids.has(m.topicId));
  const imp = topicImportance(subjectId);
  const W = READINESS_WEIGHTS;

  const wsum = ms.reduce((a, m) => a + (imp.get(m.topicId)?.importance ?? 1), 0) || 1;
  const dominio = ms.reduce((a, m) => a + m.effective * (imp.get(m.topicId)?.importance ?? 1), 0) / wsum;

  const mocks = all<{ score: number; submitted_at: string }>(
    "SELECT score, submitted_at FROM mocks WHERE subject_id = ? AND status = 'entregado' AND score IS NOT NULL ORDER BY submitted_at DESC LIMIT 3",
    [subjectId],
  );
  const mw = [1, 0.7, 0.5];
  const simulacros = mocks.length ? mocks.reduce((a, m, i) => a + m.score * mw[i], 0) / mocks.slice(0, 3).reduce((a, _, i) => a + mw[i], 0) : 0;

  const covered = ms.filter((m) => m.attempts >= 2).length;
  const cobertura = ms.length ? covered / ms.length : 0;

  const practiced = ms.filter((m) => m.attempts > 0);
  // Los temas sin practicar cuentan como retención 0: no hay nada que retener todavía.
  const retTopics = ms.length ? practiced.reduce((a, m) => a + m.retention, 0) / ms.length : 0;
  const practicedShare = ms.length ? practiced.length / ms.length : 0;
  const cards = get<{ total: number; overdue: number }>(
    "SELECT count(*) total, sum(CASE WHEN due_at < datetime('now', '-1 day') AND reps > 0 THEN 1 ELSE 0 END) overdue FROM flashcards WHERE subject_id = ?",
    [subjectId],
  )!;
  const overdueRatio = cards.total ? (cards.overdue ?? 0) / cards.total : 0;
  const retencion = retTopics * (1 - 0.5 * overdueRatio);

  const errs = errorMemory(subjectId, now).filter((e) => e.active && (e.topics.length === 0 || e.topics.some((t) => ids.has(t.id))));
  // Sin errores activos solo vale en la parte del temario que practicaste.
  const errores = (1 - Math.min(1, errs.length / 4)) * practicedShare;
  const hasAnyPractice = practiced.length > 0;

  const last = get<{ at: string }>(
    "SELECT max(created_at) at FROM (SELECT created_at FROM attempts WHERE subject_id = ? UNION ALL SELECT created_at FROM flashcard_reviews WHERE subject_id = ?)",
    [subjectId, subjectId],
  );
  const days = last?.at ? (now.getTime() - parseDbDate(last.at).getTime()) / 86400000 : null;
  const reciente = days === null ? 0 : Math.max(0, Math.min(1, 1 - (days - 1) / 6));

  const f = (key: keyof typeof W, label: string, value: number, detail: string): Factor => ({
    key,
    label,
    weight: W[key],
    value,
    contribution: Math.round(W[key] * value * 1000) / 10,
    detail,
  });
  const factors: Factor[] = [
    f("dominio", "Dominio de los temas del examen", dominio, `Promedio ponderado por importancia del dominio de ${ms.length} temas (${ms.filter((m) => m.status === "fuerte").length} fuertes, ${ms.filter((m) => m.status === "debil").length} débiles, ${ms.filter((m) => m.status === "sin_estudiar").length} sin estudiar).`),
    f("simulacros", "Simulacros", simulacros, mocks.length ? `Promedio de tus últimos ${mocks.length} simulacro(s), con más peso el más reciente: ${mocks.map((m) => Math.round(m.score * 100) + "%").join(", ")}.` : "Todavía no hiciste ningún simulacro: este factor vale 0."),
    f("cobertura", "Cobertura del temario", cobertura, `${covered} de ${ms.length} temas con al menos 2 ejercicios corregidos.`),
    f("retencion", "Retención", retencion, practiced.length ? `Retención estimada según días desde la última práctica, promediada sobre los ${ms.length} temas (los ${ms.length - practiced.length} sin practicar cuentan 0)${cards.total ? `; ${cards.overdue ?? 0} de ${cards.total} tarjetas atrasadas` : ""}.` : "Sin práctica registrada."),
    f("errores", "Errores recurrentes", hasAnyPractice ? errores : 0, hasAnyPractice ? `${errs.length} error(es) conceptual(es) activo(s); cada uno resta 25%. Se multiplica por la parte del temario practicada (${practiced.length}/${ms.length}).` : "Sin práctica registrada: no hay datos para este factor."),
    f("reciente", "Práctica reciente", reciente, days === null ? "Nunca practicaste esta materia." : `Última práctica hace ${days < 1 ? "menos de un día" : Math.round(days) + " día(s)"}.`),
  ];
  const score = Math.round(factors.reduce((a, x) => a + x.weight * x.value, 0) * 100);
  return {
    score,
    factors,
    formula: "Readiness = 35% dominio + 25% simulacros + 15% cobertura + 10% retención + 10% errores + 5% práctica reciente",
    caveat: "Es un indicador de preparación calculado con tus resultados en FORJA. No predice la nota ni garantiza aprobar.",
  };
}

// ------------------------------------------------------------------ Qué hacer ahora

export interface NextAction {
  kind: "tarjetas" | "error" | "tema" | "leer" | "simulacro";
  title: string;
  detail: string;
  topicId?: number;
  errorTag?: string;
  minutes: number;
  score: number;
}

export function nextActions(subjectId: number, now = new Date()): NextAction[] {
  const exam = activeExam(subjectId);
  const pr = priorities(subjectId, exam, now);
  const errs: ErrorMemory[] = errorMemory(subjectId, now).filter((e) => e.active);
  const due = get<{ n: number }>("SELECT count(*) n FROM flashcards WHERE subject_id = ? AND due_at <= datetime('now')", [subjectId])!.n;
  const out: NextAction[] = [];
  if (due >= 3) out.push({ kind: "tarjetas", title: `Repasar ${due} tarjeta(s)`, detail: "Tocan hoy según la repetición espaciada.", minutes: Math.min(12, Math.ceil(due * 0.7)), score: 0.35 + Math.min(0.4, due * 0.02) });
  for (const e of errs.slice(0, 2)) {
    if (!templatesWithTrap(e.tag).length) continue;
    out.push({ kind: "error", title: `Corregir: ${e.label}`, detail: `Lo cometiste ${e.count} ${e.count === 1 ? "vez" : "veces"}. Te armo un ejercicio donde aparece esa trampa.`, errorTag: e.tag, topicId: e.topics[0]?.id, minutes: 8, score: 0.5 + 0.1 * Math.min(3, e.count) });
  }
  for (const p of pr.slice(0, 4)) {
    if (p.status === "sin_estudiar") {
      const reads = get<{ n: number }>("SELECT count(*) n FROM reading_events WHERE subject_id = ? AND topic_id = ?", [subjectId, p.topicId])!.n;
      const mat = get<{ n: number }>("SELECT count(*) n FROM chunks WHERE subject_id = ? AND topic_id = ? AND quarantined = 0", [subjectId, p.topicId])!.n;
      if (!reads && mat) {
        out.push({ kind: "leer", title: `Leer el material de ${p.name}`, detail: `${mat} fragmento(s) del material hablan de este tema.`, topicId: p.topicId, minutes: 6, score: p.priority * 0.9 });
      }
    }
    if (p.hasExercises) out.push({ kind: "tema", title: `Practicar ${p.name}`, detail: p.reasons.slice(0, 2).join("; "), topicId: p.topicId, minutes: 8, score: p.priority });
  }
  if (exam) {
    const d = daysUntil(exam.date, now);
    const recentMock = get("SELECT 1 FROM mocks WHERE subject_id = ? AND started_at > datetime('now', '-2 day')", [subjectId]);
    if (d <= 4 && d > 0 && !recentMock) out.push({ kind: "simulacro", title: "Hacer un simulacro completo", detail: `Faltan ${Math.ceil(d)} día(s) y no hiciste simulacros recientes.`, minutes: 90, score: 0.9 });
  }
  return out.sort((a, b) => b.score - a.score);
}

export { STATUS_LABEL };
