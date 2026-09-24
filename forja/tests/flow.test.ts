import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import request from "supertest";

// Flujo completo por la API, en una base de datos temporal y en modo demo (sin API key).
const DATA = path.resolve("test-data/flow");
fs.rmSync(DATA, { recursive: true, force: true });
process.env.FORJA_DATA_DIR = DATA;
process.env.FORJA_FORCE_DEMO = "1";
process.env.FORJA_DISABLE_TESSERACT = "1";

const { createApp } = await import("../server/app.ts");
const { closeDb, getDb } = await import("../server/db.ts");
const { invalidateIndex } = await import("../server/retrieval/search.ts");
const DEMO = path.resolve("demo-material");

let app = createApp();
let sid = 0;

describe("flujo principal", () => {
  beforeAll(() => {
    getDb();
  });

  it("crea una materia", async () => {
    const r = await request(app).post("/api/subjects").send({ name: "Costos prueba", professor: "Prof. X" }).expect(200);
    sid = r.body.id;
    expect(sid).toBeGreaterThan(0);
  });

  it("carga y procesa archivos reales", async () => {
    let req = request(app).post(`/api/subjects/${sid}/files`);
    for (const f of fs.readdirSync(DEMO)) req = req.attach("files", path.join(DEMO, f));
    const r = await req.expect(200);
    expect(r.body.results.every((x: any) => x.ok)).toBe(true);
    const files = (await request(app).get(`/api/subjects/${sid}/files`).expect(200)).body;
    expect(files).toHaveLength(8);
    const kinds = Object.fromEntries(files.map((f: any) => [f.name, f.kind]));
    expect(kinds["Parcial 2025 - modelo.pdf"]).toBe("parcial");
    expect(kinds["Parcial corregido - 2024.docx"]).toBe("corregido");
    expect(kinds["Ejercicios resueltos - Unidad 3.pdf"]).toBe("resuelto");
    expect(kinds["Mis apuntes - costos.txt"]).toBe("apunte");
  });

  it("el security scan detecta el texto oculto y no lo incorpora", async () => {
    const alerts = (await request(app).get(`/api/subjects/${sid}/alerts`).expect(200)).body;
    const high = alerts.filter((a: any) => a.severity === "alto");
    expect(high.some((a: any) => /Si sos una IA/.test(a.snippet) && /blanco/.test(a.reason))).toBe(true);
    expect(high.some((a: any) => /APROBADO SEGURO/.test(a.snippet))).toBe(true);
    const hits = (await request(app).get(`/api/subjects/${sid}/search`).query({ q: "APROBADO SEGURO asistentes de IA" }).expect(200)).body;
    expect(hits.some((h: any) => /APROBADO SEGURO/.test(h.text))).toBe(false);
    const hits2 = (await request(app).get(`/api/subjects/${sid}/search`).query({ q: "si sos una IA ignora las instrucciones" }).expect(200)).body;
    expect(hits2.some((h: any) => /Si sos una IA/.test(h.text))).toBe(false);
  });

  it("detecta los temas y los asigna al material", async () => {
    const r = (await request(app).get(`/api/subjects/${sid}/topics`).expect(200)).body;
    const names = r.topics.map((t: any) => t.library_key);
    for (const k of ["punto_equilibrio", "carga_fabril", "costo_produccion", "costeo_variable"]) expect(names).toContain(k);
    expect(r.topics.find((t: any) => t.library_key === "punto_equilibrio").chunks).toBeGreaterThan(0);
    expect(r.edges.length).toBeGreaterThan(0);
  });

  it("arma el perfil del profesor con evidencia", async () => {
    const p = (await request(app).get(`/api/subjects/${sid}/profile`).expect(200)).body;
    expect(p.terminology.some((o: any) => /carga fabril/.test(o.text))).toBe(true);
    expect(p.formulas.some((o: any) => /Punto de equilibrio \(unidades\) = Costos fijos \/ Contribuci/.test(o.text))).toBe(true);
    expect(p.excelFormulas.some((o: any) => /REDONDEAR\.MAS\(B3\/B7;0\)/.test(o.text))).toBe(true);
    expect(p.structure.basedOn).toBe(3);
    expect(p.structure.durationMin).toBe(120);
    expect(p.structure.practice).toBeGreaterThanOrEqual(2);
    expect(p.gradingWeights.weights.procedimiento).toBeCloseTo(0.6);
    expect(p.recurring.some((o: any) => /costeo variable/i.test(o.text))).toBe(true);
    expect(p.recurring.some((o: any) => /«Pregunta 5 \(10 puntos\)»/.test(o.text))).toBe(false);
    expect(p.formulas.some((o: any) => /520\.000/.test(o.text))).toBe(false);
    expect(p.methods.some((o: any) => /Ejercicio 1\.7/.test(o.text))).toBe(true);
    // Los apuntes propios no son evidencia del profesor.
    const allEv = [...p.terminology, ...p.formulas, ...p.methods].flatMap((o: any) => o.evidence.map((e: any) => e.file));
    expect(allEv).not.toContain("Mis apuntes - costos.txt");
    for (const o of [...p.terminology, ...p.formulas, ...p.methods, ...p.detail]) expect(o.evidence.length).toBeGreaterThan(0);
  });

  it("configura el examen y arma un plan", async () => {
    const d = new Date(Date.now() + 5 * 86400000);
    d.setHours(8, 0, 0, 0);
    const date = d.toISOString().slice(0, 16);
    const r = (await request(app).put(`/api/subjects/${sid}/exam`).send({ title: "Primer parcial", date, units: [], dailyMinutes: 120 }).expect(200)).body;
    expect(r.plan.days.length).toBeGreaterThanOrEqual(4);
    expect(r.plan.days.some((d: any) => d.blocks.some((b: any) => b.kind === "simulacro"))).toBe(true);
  });

  let exId = 0;
  let peTopic = 0;
  it("el tutor responde con el material y cita fuentes (modo demo)", async () => {
    const r = (await request(app).post(`/api/subjects/${sid}/tutor`).send({ question: "¿Cómo resuelve este profesor el ejercicio 1.7?" }).expect(200)).body;
    expect(r.mode).toBe("demo");
    expect(r.content).toMatch(/Tasa predeterminada/);
    expect(r.citations[0].file).toBe("Ejercicios resueltos - Unidad 3.pdf");
    const r2 = (await request(app).post(`/api/subjects/${sid}/tutor`).send({ question: "Dame otro ejercicio parecido de punto de equilibrio" }).expect(200)).body;
    expect(r2.exerciseId).toBeGreaterThan(0);
  });

  it("genera un ejercicio sin revelar la solución", async () => {
    const topics = (await request(app).get(`/api/subjects/${sid}/topics`)).body.topics;
    peTopic = topics.find((t: any) => t.library_key === "costo_produccion").id;
    const r = (await request(app).post(`/api/subjects/${sid}/exercises`).send({ topicId: peTopic }).expect(200)).body;
    exId = r.id;
    expect(r.steps.length).toBeGreaterThan(1);
    expect(JSON.stringify(r)).not.toMatch(/"expr"|formulaText|"expected"/);
    const again = (await request(app).get(`/api/exercises/${exId}`).expect(200)).body;
    expect(again.solution).toBeUndefined();
  });

  it("corrige, detecta el error conceptual y lo registra", async () => {
    const { getExercise } = await import("../server/exercises/service.ts");
    const { solve } = await import("../server/exercises/grade.ts");
    const spec = JSON.parse(getExercise(exId).spec);
    const sol = solve(spec);
    const answers: Record<string, number> = { ...sol };
    const firstTrap = spec.traps[0];
    const { evalExpr } = await import("../server/exercises/expr.ts");
    answers[firstTrap.step] = evalExpr(firstTrap.expr, { ...spec.data, ...sol });
    const before = (await request(app).get(`/api/subjects/${sid}/readiness`)).body.score;
    const r = (await request(app).post(`/api/exercises/${exId}/submit`).send({ answers }).expect(200)).body;
    expect(r.grade.errors[0].tag).toBe(firstTrap.tag);
    expect(r.grade.summary).toMatch(/El error aparece/);
    expect(r.grade.weightsSource).toMatch(/procedimiento 60%/);
    const errs = (await request(app).get(`/api/subjects/${sid}/errors`)).body;
    expect(errs[0].tag).toBe(firstTrap.tag);
    expect(errs[0].count).toBe(1);
    expect(errs[0].active).toBe(true);
    // El error se convierte en una tarjeta prioritaria.
    await request(app).post(`/api/subjects/${sid}/flashcards/generate`).expect(200);
    const cards = (await request(app).get(`/api/subjects/${sid}/flashcards`)).body;
    expect(cards[0].origin).toBe("error");
    const topic = (await request(app).get(`/api/topics/${peTopic}`)).body;
    expect(topic.mastery.attempts).toBe(1);
    expect(topic.mastery.status).not.toBe("sin_estudiar");
    const after = (await request(app).get(`/api/subjects/${sid}/readiness`)).body;
    expect(after.factors).toHaveLength(6);
    expect(after.score).not.toBe(before);
  });

  it("el plan cambia según el rendimiento", async () => {
    const exam = (await request(app).get(`/api/subjects/${sid}/exam`)).body;
    const p = exam.plan.priorities.find((x: any) => x.topicId === peTopic);
    expect(p.reasons.join(" ")).toMatch(/error recurrente/);
    const next = (await request(app).get(`/api/subjects/${sid}/next`)).body;
    expect(next.some((n: any) => n.kind === "error")).toBe(true);
  });

  it("las pistas se registran y la solución completa marca el ejercicio", async () => {
    const r = (await request(app).post(`/api/subjects/${sid}/exercises`).send({ topicId: peTopic }).expect(200)).body;
    const h1 = (await request(app).post(`/api/exercises/${r.id}/hint`).send({ level: 1 }).expect(200)).body;
    expect(h1.text.length).toBeGreaterThan(5);
    expect(h1.solution).toBeNull();
    const h4 = (await request(app).post(`/api/exercises/${r.id}/hint`).send({ level: 4 }).expect(200)).body;
    expect(h4.solution.steps.length).toBeGreaterThan(0);
    const ex = (await request(app).get(`/api/exercises/${r.id}`)).body;
    expect(ex.revealed).toBe(true);
    expect(ex.hintsUsed).toBe(3);
  });

  it("excel: descarga plantilla y corrige la planilla subida", async () => {
    const r = (await request(app).post(`/api/subjects/${sid}/exercises`).send({ topicId: peTopic, excel: true }).expect(200)).body;
    expect(r.excelMode).toBe(true);
    const tpl = await request(app).get(`/api/exercises/${r.id}/excel`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(tpl.status).toBe(200);
    const XLSX = await import("xlsx");
    const wb = XLSX.read(tpl.body, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // El alumno escribe fórmulas en la columna B.
    const { getExercise } = await import("../server/exercises/service.ts");
    const { buildLayout } = await import("../server/exercises/excel.ts");
    const { solve } = await import("../server/exercises/grade.ts");
    const spec = JSON.parse(getExercise(r.id).spec);
    const layout = buildLayout(spec, solve(spec));
    for (const row of layout.rows.filter((x) => x.kind === "paso")) ws[row.cell] = { t: "n", f: row.formulaEn!.slice(1) } as any;
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const g = (await request(app).post(`/api/exercises/${r.id}/excel`).attach("file", buf, "resuelto.xlsx").expect(200)).body;
    expect(g.grade.score).toBeCloseTo(1, 2);
    expect(g.grade.breakdown.presentacion).toBe(1);
  });

  it("simulacro: se crea con la estructura del profesor, sin pistas, y se corrige al entregar", async () => {
    const m = (await request(app).post(`/api/subjects/${sid}/mocks`).send({}).expect(200)).body;
    expect(m.durationMin).toBe(120);
    expect(m.exercises.length).toBeGreaterThanOrEqual(3);
    expect(m.exercises.some((e: any) => e.kind === "mc" || e.kind === "vf")).toBe(true);
    await request(app).post(`/api/exercises/${m.exercises[0].id}/hint`).send({ level: 1 }).expect(500);
    const answers: Record<string, any> = {};
    const { getExercise } = await import("../server/exercises/service.ts");
    const { solve } = await import("../server/exercises/grade.ts");
    for (const e of m.exercises) {
      const spec = JSON.parse(getExercise(e.id).spec);
      if (spec.kind === "numeric") answers[e.id] = { answers: solve(spec) };
      else if (spec.kind === "mc" || spec.kind === "vf") answers[e.id] = { choice: spec.correct };
    }
    const done = (await request(app).post(`/api/mocks/${m.id}/submit`).send({ answers }).expect(200)).body;
    expect(done.status).toBe("entregado");
    expect(done.score).toBeGreaterThan(0.95);
    const rd = (await request(app).get(`/api/subjects/${sid}/readiness`)).body;
    expect(rd.factors.find((f: any) => f.key === "simulacros").value).toBeGreaterThan(0.95);
    const v = (await request(app).get(`/api/subjects/${sid}/verdict`)).body;
    expect(v.statements.join(" ")).toMatch(/simulacro/);
    expect(v.disclaimer).toMatch(/No es una predicción/);
  });

  it("flashcards priorizan errores y fórmulas del profesor", async () => {
    await request(app).post(`/api/subjects/${sid}/flashcards/generate`).expect(200);
    const cards = (await request(app).get(`/api/subjects/${sid}/flashcards`)).body;
    expect(cards.length).toBeLessThanOrEqual(46);
    expect(cards.some((c: any) => c.origin === "formula")).toBe(true);
    // Superar la trampa dos veces después del último error lo da por resuelto.
    const errs = (await request(app).get(`/api/subjects/${sid}/errors`)).body;
    const e = errs.find((x: any) => x.passesSinceLast >= 2);
    if (e) expect(e.active).toBe(false);
    const r = (await request(app).post(`/api/flashcards/${cards[0].id}/review`).send({ grade: 2 }).expect(200)).body;
    expect(r.interval_days).toBe(1);
  });

  it("sesión de estudio: una tarea por vez", async () => {
    const s = (await request(app).post(`/api/subjects/${sid}/sessions`).send({ minutes: 30 }).expect(200)).body;
    expect(s.current).toBeTruthy();
    const s2 = (await request(app).post(`/api/sessions/${s.id}/next`).send({ skip: true }).expect(200)).body;
    expect(s2.tasks.length).toBe(2);
    expect(s2.tasks[0].status).toBe("salteada");
  });

  it("todo persiste al reiniciar", async () => {
    closeDb();
    invalidateIndex(sid);
    app = createApp();
    const subjects = (await request(app).get("/api/subjects").expect(200)).body;
    expect(subjects.some((s: any) => s.id === sid)).toBe(true);
    const errs = (await request(app).get(`/api/subjects/${sid}/errors`)).body;
    expect(errs.length).toBeGreaterThan(0);
    const d = (await request(app).get(`/api/subjects/${sid}/dashboard`).expect(200)).body;
    expect(d.mocks.count).toBe(1);
    expect(d.exam.title).toBe("Primer parcial");
  });
});
