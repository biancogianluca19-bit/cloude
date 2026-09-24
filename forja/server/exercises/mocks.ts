import { all, get, run, json, parseDbDate } from "../db.ts";
import { getProfile, buildProfile } from "../profile/professor.ts";
import { createExercise, existingFromExam, insertExisting, publicView, submit, getExercise, type SubmitInput } from "./service.ts";
import { activeExam, examTopicIds, priorities } from "../learning/plan.ts";
import { templatesFor } from "./library.ts";

// Simulacros de parcial. Estructura, duración y reparto teoría/práctica salen de los
// parciales del material; si no hay, se usa una estructura genérica y se avisa.

export interface MockStructure {
  durationMin: number;
  items: { type: "practica" | "teoria"; points: number; topicId: number | null }[];
  basis: string;
  generic: boolean;
}

export function planStructure(subjectId: number): MockStructure {
  const profile = getProfile(subjectId) ?? buildProfile(subjectId);
  const exam = activeExam(subjectId);
  const examTopics = new Set(examTopicIds(subjectId, exam));
  const pr = priorities(subjectId, exam).filter((p) => examTopics.has(p.topicId));
  const withTpl = new Set(
    all<{ id: number; library_key: string }>("SELECT id, library_key FROM topics WHERE subject_id = ? AND library_key IS NOT NULL", [subjectId])
      .filter((t) => templatesFor(t.library_key).length)
      .map((t) => t.id),
  );
  const st = profile.structure;
  const practiceN = st ? Math.max(1, st.practice) : 3;
  const theoryN = st ? st.theory : 2;
  const duration = st?.durationMin ?? 90;
  const totalPts = st?.avgPoints ?? 100;
  const theoryPts = st ? Math.round(totalPts * st.theoryShare) : 20;
  const practicePts = totalPts - theoryPts;

  // Temas de los ejercicios prácticos: primero los que el profesor toma en sus parciales,
  // después los de mayor prioridad (más débiles o más importantes).
  const fromExams = (profile.exams ?? []).flatMap((e) => e.items.filter((i) => i.type === "practica" && i.topicId).map((i) => i.topicId!));
  const practiceTopics: number[] = [];
  for (const t of [...fromExams, ...pr.map((p) => p.topicId)]) {
    if (practiceTopics.length >= practiceN) break;
    if (examTopics.has(t) && withTpl.has(t) && !practiceTopics.includes(t)) practiceTopics.push(t);
  }
  const allTopics = [...examTopics];
  while (practiceTopics.length < practiceN && allTopics.length) {
    const t = allTopics.filter((x) => withTpl.has(x))[practiceTopics.length % Math.max(1, allTopics.filter((x) => withTpl.has(x)).length)];
    if (t === undefined) break;
    practiceTopics.push(t);
  }
  const theoryTopics = pr.slice(0, Math.max(theoryN, 1)).map((p) => p.topicId);
  const items: MockStructure["items"] = [
    ...practiceTopics.map((t) => ({ type: "practica" as const, points: Math.round(practicePts / Math.max(1, practiceTopics.length)), topicId: t })),
    ...Array.from({ length: theoryN }, (_, i) => ({ type: "teoria" as const, points: Math.round(theoryPts / Math.max(1, theoryN)), topicId: theoryTopics[i % Math.max(1, theoryTopics.length)] ?? null })),
  ];
  return {
    durationMin: duration,
    items,
    generic: !st,
    basis: st
      ? `Basado en ${st.basedOn} parcial(es) del material: ${st.practice} práctico(s), ${st.theory} teórico(s)${st.durationMin ? `, ${st.durationMin} min` : ""}.`
      : "No hay parciales en el material: estructura genérica de 3 ejercicios prácticos y 2 preguntas teóricas en 90 minutos.",
  };
}

export async function createMock(subjectId: number, opts: { mode?: "nuevo" | "existente"; fileId?: number } = {}) {
  const exam = activeExam(subjectId);
  if (opts.mode === "existente") {
    const profile = getProfile(subjectId) ?? buildProfile(subjectId);
    const model = profile.exams.find((e) => e.fileId === opts.fileId) ?? profile.exams[0];
    if (!model) throw new Error("No hay parciales en el material para practicar un examen existente.");
    const mockId = run("INSERT INTO mocks(subject_id, exam_id, title, mode, structure, duration_min, source_file_id) VALUES (?,?,?,?,?,?,?)", [
      subjectId,
      exam?.id ?? null,
      `Práctica del parcial «${model.file}»`,
      "existente",
      JSON.stringify({ basis: `Ejercicios literales de ${model.file}`, items: model.items.map((i) => ({ type: i.type, points: i.points })) }),
      model.durationMin ?? 90,
      model.fileId,
    ]).id;
    for (const it of model.items) insertExisting(subjectId, it.topicId, existingFromExam(subjectId, it), { mockId, origin: "simulacro" });
    return mockId;
  }
  const st = planStructure(subjectId);
  if (!st.items.length) throw new Error("La materia no tiene temas con ejercicios. Agregá temas en el mapa antes de armar un simulacro.");
  const n = (get<{ n: number }>("SELECT count(*) n FROM mocks WHERE subject_id = ?", [subjectId])?.n ?? 0) + 1;
  const mockId = run("INSERT INTO mocks(subject_id, exam_id, title, mode, structure, duration_min) VALUES (?,?,?,?,?,?)", [
    subjectId,
    exam?.id ?? null,
    `Simulacro ${n}`,
    "nuevo",
    JSON.stringify(st),
    st.durationMin,
  ]).id;
  try {
    for (const it of st.items) {
      await createExercise(subjectId, { topicId: it.topicId, kind: it.type === "teoria" ? "teoria" : "numerico", mockId, origin: "simulacro", points: it.points });
    }
  } catch (e) {
    run("DELETE FROM mocks WHERE id = ?", [mockId]);
    throw e;
  }
  return mockId;
}

export function mockView(mockId: number) {
  const m = get<any>("SELECT * FROM mocks WHERE id = ?", [mockId]);
  if (!m) throw new Error("Simulacro inexistente");
  const exercises = all<any>("SELECT * FROM exercises WHERE mock_id = ? ORDER BY id", [mockId]).map(publicView);
  const started = parseDbDate(m.started_at);
  const endsAt = new Date(started.getTime() + m.duration_min * 60000);
  return {
    id: m.id,
    title: m.title,
    mode: m.mode,
    status: m.status,
    structure: json(m.structure, {}),
    durationMin: m.duration_min,
    startedAt: started.toISOString(),
    endsAt: endsAt.toISOString(),
    submittedAt: m.submitted_at ? parseDbDate(m.submitted_at).toISOString() : null,
    score: m.score,
    result: json(m.result, null),
    exercises,
  };
}

/**
 * Práctica de un parcial existente sin API key: al terminar el tiempo se muestran las
 * resoluciones del material para que te autoevalúes. Después ya no se pueden cambiar respuestas.
 */
export function finishForSelfGrading(mockId: number) {
  const m = get<any>("SELECT * FROM mocks WHERE id = ?", [mockId]);
  if (!m) throw new Error("Simulacro inexistente");
  if (m.status === "en_curso") run("UPDATE mocks SET status = 'autoevaluando' WHERE id = ?", [mockId]);
  return all<any>("SELECT id, spec FROM exercises WHERE mock_id = ? ORDER BY id", [mockId]).map((e) => {
    const spec = json<any>(e.spec, {});
    return { exerciseId: e.id, resolution: spec.resolution ?? null, resolutionSource: spec.resolutionSource ?? null, source: spec.source ?? null };
  });
}

/** Entrega el simulacro completo: corrige cada ejercicio y calcula el puntaje ponderado. */
export async function submitMock(mockId: number, answers: Record<string, SubmitInput>) {
  const m = get<any>("SELECT * FROM mocks WHERE id = ?", [mockId]);
  if (!m) throw new Error("Simulacro inexistente");
  if (m.status === "entregado") throw new Error("Este simulacro ya fue entregado.");
  // Cerramos primero, así se habilitan las soluciones y ya no se pueden pedir pistas.
  const late = Date.now() > parseDbDate(m.started_at).getTime() + m.duration_min * 60000 + 60000;
  run("UPDATE mocks SET status = 'corrigiendo' WHERE id = ?", [mockId]);
  const exs = all<any>("SELECT id, spec FROM exercises WHERE mock_id = ? ORDER BY id", [mockId]);
  const results: any[] = [];
  let pts = 0;
  let total = 0;
  for (const e of exs) {
    const spec = json<any>(e.spec, {});
    const points = spec.points ?? 10;
    const { photoPath: _ignored, ...ans } = (answers[e.id] ?? {}) as SubmitInput;
    const r = await submit(e.id, { ...ans, mode: "examen" });
    pts += points * r.grade.score;
    total += points;
    results.push({ exerciseId: e.id, title: spec.title, points, earned: Math.round(points * r.grade.score * 10) / 10, grade: r.grade, solution: r.solution, exercise: publicView(getExercise(e.id)) });
  }
  const score = total ? pts / total : 0;
  const result = { results, earned: Math.round(pts * 10) / 10, total, late };
  run("UPDATE mocks SET status = 'entregado', submitted_at = datetime('now'), score = ?, result = ? WHERE id = ?", [score, JSON.stringify(result), mockId]);
  return mockView(mockId);
}

export function listMocks(subjectId: number) {
  return all<any>("SELECT id, title, mode, status, duration_min, started_at, submitted_at, score FROM mocks WHERE subject_id = ? ORDER BY id DESC", [subjectId]);
}
