import { get, run, nowIso } from "../db.ts";

// Repetición espaciada tipo SM-2 simplificada.
// Notas: 0 = otra vez, 1 = difícil, 2 = bien, 3 = fácil.

export interface CardState {
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
}

export function schedule(c: CardState, grade: 0 | 1 | 2 | 3): CardState {
  let { ease, interval_days: iv, reps, lapses } = c;
  if (grade === 0) {
    lapses++;
    reps = 0;
    iv = 10 / 1440; // 10 minutos
    ease = Math.max(1.3, ease - 0.2);
  } else {
    reps++;
    if (reps === 1) iv = grade === 1 ? 0.5 : grade === 2 ? 1 : 3;
    else if (reps === 2) iv = grade === 1 ? 2 : grade === 2 ? 3 : 6;
    else iv = iv * (grade === 1 ? 1.2 : grade === 2 ? ease : ease * 1.3);
    ease = Math.max(1.3, ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0));
  }
  return { ease, interval_days: Math.min(iv, 120), reps, lapses };
}

export function reviewCard(cardId: number, grade: 0 | 1 | 2 | 3, now = new Date()) {
  const c = get<any>("SELECT * FROM flashcards WHERE id = ?", [cardId]);
  if (!c) throw new Error("Tarjeta inexistente");
  const next = schedule(c, grade);
  const due = new Date(now.getTime() + next.interval_days * 86400000);
  run("UPDATE flashcards SET ease = ?, interval_days = ?, reps = ?, lapses = ?, due_at = ?, last_review = ? WHERE id = ?", [
    next.ease,
    next.interval_days,
    next.reps,
    next.lapses,
    due.toISOString().replace("T", " ").slice(0, 19),
    nowIso(),
    cardId,
  ]);
  run("INSERT INTO flashcard_reviews(card_id, subject_id, topic_id, grade) VALUES (?,?,?,?)", [cardId, c.subject_id, c.topic_id, grade]);
  return { ...next, due_at: due.toISOString() };
}
