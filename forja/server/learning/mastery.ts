import { all, parseDbDate } from "../db.ts";
import { topicsOf } from "./topics.ts";

// Modelo de dominio por tema. Todo sale de tus respuestas registradas: no hay valores inventados.

export type Status = "sin_estudiar" | "debil" | "medio" | "fuerte";

export const STATUS_LABEL: Record<Status, string> = {
  sin_estudiar: "Sin estudiar",
  debil: "Débil",
  medio: "Medio",
  fuerte: "Fuerte",
};

export interface TopicMastery {
  topicId: number;
  name: string;
  unit: string;
  libraryKey: string | null;
  /** Promedio ponderado de tus resultados (0–1), con un prior conservador. */
  mastery: number;
  /** Dominio ajustado por olvido desde la última práctica. */
  effective: number;
  retention: number;
  attempts: number;
  correct: number;
  evidence: number;
  lastPracticed: string | null;
  daysSince: number | null;
  status: Status;
  reads: number;
  trend: number[];
}

export const MODEL = {
  prior: 0.25,
  priorWeight: 1.2,
  recencyDays: 21,
  weights: { examen: 1.3, practica: 1, sesion: 1, autoevaluado: 0.6, flashcard: 0.3 } as Record<string, number>,
  hintPenalty: 0.15,
  revealedCredit: 0.3,
};

export function creditFor(score: number, hints: number, revealed: boolean): number {
  if (revealed) return Math.min(score, MODEL.revealedCredit);
  return score * Math.max(0.4, 1 - MODEL.hintPenalty * hints);
}

interface Ev {
  topic_id: number;
  credit: number;
  w: number;
  at: Date;
  success: boolean;
  isAttempt: boolean;
}

export function computeMastery(subjectId: number, now = new Date()): TopicMastery[] {
  const topics = topicsOf(subjectId);
  const attempts = all<any>("SELECT topic_id, score, hints_used, revealed, mode, input, weight, created_at FROM attempts WHERE subject_id = ? AND topic_id IS NOT NULL", [subjectId]);
  const reviews = all<any>("SELECT topic_id, grade, created_at FROM flashcard_reviews WHERE subject_id = ? AND topic_id IS NOT NULL", [subjectId]);
  const reads = all<{ topic_id: number; n: number }>("SELECT topic_id, count(*) n FROM reading_events WHERE subject_id = ? GROUP BY topic_id", [subjectId]);
  const readMap = new Map(reads.map((r) => [r.topic_id, r.n]));

  const evs: Ev[] = [];
  for (const a of attempts) {
    const base = a.input === "autoevaluado" ? MODEL.weights.autoevaluado : (MODEL.weights[a.mode] ?? 1);
    const credit = creditFor(a.score, a.hints_used, !!a.revealed);
    evs.push({ topic_id: a.topic_id, credit, w: base * (a.weight ?? 1), at: parseDbDate(a.created_at), success: credit >= 0.7, isAttempt: true });
  }
  for (const r of reviews) {
    const credit = [0, 0.5, 0.85, 1][r.grade] ?? 0;
    evs.push({ topic_id: r.topic_id, credit, w: MODEL.weights.flashcard, at: parseDbDate(r.created_at), success: r.grade >= 2, isAttempt: false });
  }

  return topics.map((t) => {
    const mine = evs.filter((e) => e.topic_id === t.id).sort((a, b) => a.at.getTime() - b.at.getTime());
    let num = MODEL.prior * MODEL.priorWeight;
    let den = MODEL.priorWeight;
    let evidence = 0;
    for (const e of mine) {
      const age = (now.getTime() - e.at.getTime()) / 86400000;
      const w = e.w * Math.exp(-Math.max(0, age) / MODEL.recencyDays);
      num += w * e.credit;
      den += w;
      evidence += e.w;
    }
    const mastery = mine.length ? num / den : 0;
    const last = mine[mine.length - 1];
    const daysSince = last ? (now.getTime() - last.at.getTime()) / 86400000 : null;
    const successes = mine.filter((e) => e.success).length;
    const stability = Math.min(60, 3 * Math.pow(1 + successes, 1.2));
    const retention = daysSince === null ? 0 : Math.exp(-daysSince / stability);
    const effective = mine.length ? mastery * (0.6 + 0.4 * retention) : 0;
    const attemptsOnly = mine.filter((e) => e.isAttempt);
    let status: Status;
    if (!mine.length) status = "sin_estudiar";
    else if (effective < 0.45) status = "debil";
    else if (effective < 0.72 || evidence < 2) status = "medio";
    else status = "fuerte";
    return {
      topicId: t.id,
      name: t.name,
      unit: t.unit,
      libraryKey: t.library_key,
      mastery,
      effective,
      retention,
      attempts: attemptsOnly.length,
      correct: attemptsOnly.filter((e) => e.success).length,
      evidence,
      lastPracticed: last ? last.at.toISOString() : null,
      daysSince,
      status,
      reads: readMap.get(t.id) ?? 0,
      trend: attemptsOnly.slice(-8).map((e) => Math.round(e.credit * 100) / 100),
    };
  });
}
