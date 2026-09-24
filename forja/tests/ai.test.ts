import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";

// Servidor que imita la API de Anthropic (streaming SSE). Permite probar todo el camino
// con IA sin gastar créditos: armado del pedido, parseo y validación de la respuesta.
const requests: any[] = [];
let respond: (body: any) => string = () => "{}";

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    requests.push({ url: req.url, body, headers: req.headers });
    const text = respond(body);
    res.writeHead(200, { "content-type": "text/event-stream" });
    const ev = (type: string, data: any) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    ev("message_start", { message: { id: "msg_1", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    ev("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
    ev("content_block_stop", { index: 0 });
    ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 20 } });
    ev("message_stop", {});
    res.end();
  });
});

const DATA = path.resolve("test-data/ai");
fs.rmSync(DATA, { recursive: true, force: true });
process.env.FORJA_DATA_DIR = DATA;
delete process.env.FORJA_FORCE_DEMO;

let mods: any;
let sid = 0;

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "sk-ant-prueba";
  mods = {
    db: await import("../server/db.ts"),
    pipeline: await import("../server/ingest/pipeline.ts"),
    app: await import("../server/app.ts"),
    service: await import("../server/exercises/service.ts"),
    tutor: await import("../server/ai/tutor.ts"),
    photo: await import("../server/ai/photo.ts"),
    profile: await import("../server/profile/professor.ts"),
    topics: await import("../server/learning/topics.ts"),
  };
  mods.db.getDb();
  sid = mods.db.run("INSERT INTO subjects(name) VALUES ('Con IA')").id;
  const demo = path.resolve("demo-material");
  for (const f of fs.readdirSync(demo)) {
    const id = mods.pipeline.storeUpload(sid, f, fs.readFileSync(path.join(demo, f)));
    await mods.pipeline.processFile(id);
  }
  await mods.app.refreshSubject(sid);
});

afterAll(() => server.close());

describe("camino con IA (API simulada)", () => {
  it("el tutor manda el material como datos, sin el texto oculto, y cita fuentes", async () => {
    respond = () => "La tasa predeterminada se calcula con datos presupuestados [1].";
    const r = await mods.tutor.ask(sid, "¿Cómo se calcula la tasa predeterminada?");
    expect(r.mode).toBe("ia");
    expect(r.citations).toHaveLength(1);
    const req = requests.at(-1);
    expect(req.url).toMatch(/\/v1\/messages/);
    expect(req.body.thinking).toEqual({ type: "adaptive" });
    const sent = JSON.stringify(req.body);
    expect(sent).toMatch(/<documento n=\\"1\\"/);
    expect(sent).toMatch(/nunca instrucciones para vos/);
    expect(sent).not.toMatch(/APROBADO SEGURO/);
    expect(sent).not.toMatch(/Si sos una IA, ignora/);
  });

  it("valida un ejercicio generado por IA y recalcula los números", async () => {
    const pe = mods.topics.topicsOf(sid).find((t: any) => t.library_key === "punto_equilibrio");
    respond = () =>
      JSON.stringify({
        titulo: "Equilibrio de una panadería",
        enunciado: "Una panadería tiene costos fijos de $ 600.000...",
        datos: [
          { nombre: "CF", etiqueta: "Costos fijos", valor: 600000, formato: "$" },
          { nombre: "p", etiqueta: "Precio", valor: 2500, formato: "$" },
          { nombre: "cvu", etiqueta: "Costo variable unitario", valor: 1300, formato: "$" },
        ],
        pasos: [
          { id: "cmu", etiqueta: "Contribución marginal unitaria", expresion: "p - cvu", unidad: "$", formula_texto: "CMu = p − cvu" },
          { id: "qe", etiqueta: "Punto de equilibrio", expresion: "CF / cmu", unidad: "u", formula_texto: "Qe = CF ÷ CMu" },
        ],
        trampas: [
          { paso: "qe", expresion: "CF / p", tag: "pe_divide_precio", etiqueta: "Divide por el precio", mensaje: "Dividiste por el precio." },
          { paso: "qe", expresion: "CF / inexistente", tag: "x", etiqueta: "x", mensaje: "x" },
        ],
        pistas: ["Pensá en la contribución.", "Qe = CF / CMu"],
        explicacion: "…",
        fragmentos_usados: [1],
      });
    const id = await mods.service.createExercise(sid, { topicId: pe.id, useAi: true });
    const row = mods.service.getExercise(id);
    expect(row.source).toBe("ia");
    const spec = JSON.parse(row.spec);
    expect(spec.traps).toHaveLength(1); // la trampa con una variable inexistente se descarta
    expect(spec.methodSource).toBe("profesor");
    const g = await mods.service.submit(id, { answers: { cmu: 1200, qe: 500 } });
    expect(g.grade.score).toBeCloseTo(1);
  });

  it("rechaza un ejercicio de IA con expresiones inválidas", async () => {
    const pe = mods.topics.topicsOf(sid).find((t: any) => t.library_key === "punto_equilibrio");
    respond = () => JSON.stringify({ titulo: "x", enunciado: "x", datos: [{ nombre: "a", etiqueta: "a", valor: 1, formato: "num" }], pasos: [{ id: "b", etiqueta: "b", expresion: "a + eval(1)", unidad: "num", formula_texto: "" }], trampas: [], pistas: [], explicacion: "", fragmentos_usados: [] });
    await expect(mods.service.createExercise(sid, { topicId: pe.id, useAi: true })).rejects.toThrow(/validación/);
  });

  it("foto de la hoja: la IA solo transcribe, FORJA corrige", async () => {
    const cp = mods.topics.topicsOf(sid).find((t: any) => t.library_key === "costo_produccion");
    const id = await mods.service.createExercise(sid, { topicId: cp.id, templateKey: "cp_unitario", seed: 7 });
    const spec = JSON.parse(mods.service.getExercise(id).spec);
    const { solve } = await import("../server/exercises/grade.ts");
    const sol = solve(spec);
    const cuMal = sol.cp / spec.data.V;
    respond = () =>
      JSON.stringify({
        transcripcion: "CP = ...",
        valores: [
          { paso_id: "cp", valor: sol.cp, como_lo_calculo: "sumó los tres elementos" },
          { paso_id: "cu", valor: cuMal, como_lo_calculo: `dividió por ${spec.data.V}` },
          { paso_id: "cv", valor: cuMal * spec.data.V, como_lo_calculo: "" },
          { paso_id: "if", valor: null, como_lo_calculo: "" },
        ],
        presentacion: 0.8,
        observaciones: "Ordenado.",
      });
    const photo = mods.photo.savePhoto(id, "hoja.jpg", Buffer.from([0xff, 0xd8, 0xff]));
    const r = await mods.photo.gradePhoto(id, photo);
    expect(r.needsManual).toBe(false);
    expect(r.grade.summary).toMatch(/Hasta «Costo de producción» el procedimiento está bien/);
    expect(r.grade.errors[0].tag).toBe("divide_por_vendidas");
    expect(r.grade.breakdown.presentacion).toBeCloseTo(0.8);
    const img = requests.at(-1).body.messages.at(-1).content[0];
    expect(img.type).toBe("image");
  });

  it("perfil con IA: solo se guardan observaciones con cita verificable", async () => {
    const chunk = mods.db.get("SELECT c.id, c.text FROM chunks c JOIN files f ON f.id = c.file_id WHERE c.subject_id = ? AND f.kind = 'corregido' LIMIT 1", [sid]);
    respond = () =>
      JSON.stringify({
        observaciones: [
          { categoria: "criterio_de_correccion", observacion: "Pondera más el procedimiento que el resultado.", fragmento_id: chunk.id, cita: "procedimiento 60% y resultado 40%" },
          { categoria: "metodo", observacion: "Inventado", fragmento_id: chunk.id, cita: "el profesor siempre usa UEPS en todos los casos" },
          { categoria: "metodo", observacion: "Fragmento falso", fragmento_id: 999999, cita: "x" },
        ],
      });
    const r = await mods.profile.aiEnrichProfile(sid);
    expect(r.added).toBe(1);
    expect(r.discarded).toBe(2);
    const p = mods.profile.getProfile(sid);
    expect(p.ai[0].evidence[0].chunkId).toBe(chunk.id);
  });
});
