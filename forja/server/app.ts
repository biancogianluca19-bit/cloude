import express, { type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { all, get, run, json, getSetting, setSetting, tx } from "./db.ts";
import { storeUpload, processFile, decideAlert, deleteFile, addManualText, KIND_LABELS, type FileKind } from "./ingest/pipeline.ts";
import { buildProfile, getProfile, aiEnrichProfile } from "./profile/professor.ts";
import { generateFlashcards, dueCards } from "./learning/flashcards.ts";
import { suggestTopics, addLibraryTopics, createTopic, topicsOf, edgesOf, assignTopics } from "./learning/topics.ts";
import { TOPICS, templatesFor } from "./exercises/library.ts";
import { computeMastery, STATUS_LABEL } from "./learning/mastery.ts";
import { errorMemory } from "./learning/errors.ts";
import { activeExam, buildPlan, readiness, nextActions } from "./learning/plan.ts";
import { dashboard, verdict } from "./learning/insights.ts";
import { createExercise, getExercise, publicView, hint, submit, excelFile, submitExcel, solutionOf } from "./exercises/service.ts";
import { createMock, mockView, submitMock, listMocks, planStructure, finishForSelfGrading } from "./exercises/mocks.ts";
import { reviewCard } from "./learning/srs.ts";
import { ask, history } from "./ai/tutor.ts";
import { startSession, sessionState, nextTask, endSession } from "./learning/session.ts";
import { gradePhoto, savePhoto, photoPathFromToken } from "./ai/photo.ts";
import { aiAvailable, model, testConnection, DEFAULT_MODEL } from "./ai/llm.ts";
import { invalidateIndex, search } from "./retrieval/search.ts";
import { requireAuth, login, logout, authRequired, isAuthed } from "./auth.ts";
import { BLOB_MODE, syncBefore, markDirty, enterRequest, leaveRequest, persistFile, ensureLocalFile, takeIncoming, INCOMING_PREFIX, storageInfo } from "./storage.ts";
import { getDb } from "./db.ts";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024, files: 30 } });

type H = (req: Request, res: Response) => unknown | Promise<unknown>;
const h = (fn: H) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const out = await fn(req, res);
    if (!res.headersSent) res.json(out ?? { ok: true });
  } catch (e) {
    next(e);
  }
};

const id = (req: Request, k = "id") => {
  const n = Number(req.params[k]);
  if (!Number.isInteger(n) || n <= 0) throw Object.assign(new Error("Id inválido"), { status: 400 });
  return n;
};

function subjectOr404(sid: number) {
  const s = get<any>("SELECT * FROM subjects WHERE id = ?", [sid]);
  if (!s) throw Object.assign(new Error("Materia inexistente"), { status: 404 });
  return s;
}

/** Multer decodifica los nombres como latin1; los pasamos a UTF-8 para no romper acentos. */
function fixName(n: string) {
  const b = Buffer.from(n, "latin1").toString("utf8");
  return b.includes("�") ? n : b;
}

export async function refreshSubject(subjectId: number) {
  // Si la materia todavía no tiene temas, se agregan los temas de la biblioteca con evidencia clara.
  if (!get("SELECT 1 FROM topics WHERE subject_id = ?", [subjectId])) {
    const sug = suggestTopics(subjectId).filter((s) => s.source === "biblioteca" && s.hits >= 2);
    if (sug.length) addLibraryTopics(subjectId, sug.map((s) => s.key!));
  } else assignTopics(subjectId);
  invalidateIndex(subjectId);
  buildProfile(subjectId);
  generateFlashcards(subjectId);
}

export function createApp() {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json({ limit: "5mb" }));

  // ------------------------------------------------------------ Acceso
  app.get("/api/auth", (req, res) => res.json({ required: authRequired(), ok: isAuthed(req) }));
  app.post("/api/login", login);
  app.post("/api/logout", logout);
  app.use(requireAuth);

  // Subida directa del navegador al store (archivos grandes). La valida el propio handler:
  // pedir un token exige sesión; el aviso de "subida terminada" viene firmado por Vercel Blob.
  app.post("/api/blob/upload", async (req, res, next) => {
    try {
      if (!BLOB_MODE) return res.status(400).json({ error: "La subida directa solo existe en la versión publicada." });
      if (req.body?.type === "blob.generate-client-token" && !isAuthed(req)) return res.status(401).json({ error: "Iniciá sesión." });
      const { handleUpload } = await import("@vercel/blob/client");
      const out = await handleUpload({
        body: req.body,
        request: req,
        onBeforeGenerateToken: async (pathname) => {
          if (!pathname.startsWith(INCOMING_PREFIX)) throw new Error("Ruta inválida");
          return { addRandomSuffix: true, maximumSizeInBytes: 200 * 1024 * 1024 };
        },
        onUploadCompleted: async () => {},
      });
      res.json(out);
    } catch (e) {
      next(e);
    }
  });

  // ------------------------------------------------------------ Persistencia (Vercel)
  // Antes de cada pedido la base local se pone al día; si el pedido la cambió, se guarda.
  app.use("/api", async (req, res, next) => {
    try {
      await syncBefore(req.method !== "GET");
      const before = BLOB_MODE ? Number((getDb().prepare("SELECT total_changes() n").get() as any).n) : 0;
      if (BLOB_MODE) enterRequest();
      let left = false;
      const leave = () => {
        if (!left && BLOB_MODE) leaveRequest();
        left = true;
      };
      res.on("close", leave);
      if (BLOB_MODE)
        res.on("finish", () => {
          try {
            // Solo se guarda si el pedido realmente cambió la base.
            const after = Number((getDb().prepare("SELECT total_changes() n").get() as any).n);
            if (after !== before) markDirty();
          } catch {
            markDirty();
          }
          leave();
        });
      next();
    } catch (e) {
      next(e);
    }
  });

  // ------------------------------------------------------------ Estado y ajustes
  app.get("/api/status", h(() => ({ ai: aiAvailable(), model: model(), demo: !aiAvailable(), keySource: process.env.ANTHROPIC_API_KEY ? "entorno" : getSetting("anthropic_api_key") ? "ajustes" : null, storage: storageInfo().mode, auth: authRequired() })));
  app.put(
    "/api/settings",
    h((req) => {
      const { apiKey, model: m } = req.body ?? {};
      if (apiKey !== undefined) setSetting("anthropic_api_key", apiKey ? String(apiKey).trim() : null);
      if (m !== undefined) setSetting("model", m ? String(m).trim() : null);
      return { ai: aiAvailable(), model: model(), defaultModel: DEFAULT_MODEL };
    }),
  );
  app.post("/api/settings/test", h(() => testConnection()));
  app.get("/api/library", h(() => TOPICS.map((t) => ({ key: t.key, name: t.name, area: t.area, unit: t.unit, description: t.description, templates: templatesFor(t.key).length }))));
  app.get("/api/kinds", h(() => KIND_LABELS));

  // ------------------------------------------------------------ Materias
  app.get(
    "/api/subjects",
    h(() =>
      all<any>("SELECT * FROM subjects ORDER BY created_at DESC").map((s) => {
        const exam = activeExam(s.id);
        const files = get<{ n: number }>("SELECT count(*) n FROM files WHERE subject_id = ?", [s.id])!.n;
        return { ...s, exam, files, readiness: readiness(s.id, exam).score };
      }),
    ),
  );
  app.post(
    "/api/subjects",
    h((req) => {
      const { name, professor, description, passThreshold } = req.body ?? {};
      if (!name || !String(name).trim()) throw Object.assign(new Error("La materia necesita un nombre."), { status: 400 });
      const r = run("INSERT INTO subjects(name, professor, description, pass_threshold) VALUES (?,?,?,?)", [String(name).trim(), professor ?? "", description ?? "", passThreshold ?? 0.6]);
      return get("SELECT * FROM subjects WHERE id = ?", [r.id]);
    }),
  );
  app.get("/api/subjects/:id", h((req) => subjectOr404(id(req))));
  app.patch(
    "/api/subjects/:id",
    h((req) => {
      const sid = id(req);
      subjectOr404(sid);
      const b = req.body ?? {};
      for (const [k, col] of [["name", "name"], ["professor", "professor"], ["description", "description"], ["passThreshold", "pass_threshold"]] as const) {
        if (b[k] !== undefined) run(`UPDATE subjects SET ${col} = ? WHERE id = ?`, [b[k], sid]);
      }
      return subjectOr404(sid);
    }),
  );
  app.delete(
    "/api/subjects/:id",
    h((req) => {
      const sid = id(req);
      const files = all<{ path: string }>("SELECT path FROM files WHERE subject_id = ?", [sid]);
      run("DELETE FROM subjects WHERE id = ?", [sid]);
      for (const f of files) fs.rmSync(f.path, { force: true });
      invalidateIndex(sid);
      return { ok: true };
    }),
  );

  // ------------------------------------------------------------ Archivos
  app.get(
    "/api/subjects/:id/files",
    h((req) =>
      all<any>(
        `SELECT f.id, f.name, f.ext, f.size, f.kind, f.status, f.error, f.extractor, f.units, f.created_at,
          (SELECT count(*) FROM chunks c WHERE c.file_id = f.id) chunks,
          (SELECT count(*) FROM chunks c WHERE c.file_id = f.id AND c.quarantined = 1) quarantined,
          (SELECT count(*) FROM security_alerts a WHERE a.file_id = f.id AND a.severity != 'bajo') alerts,
          (SELECT count(*) FROM security_alerts a WHERE a.file_id = f.id AND a.decision = 'pendiente') pending
         FROM files f WHERE f.subject_id = ? ORDER BY f.created_at DESC, f.id DESC`,
        [id(req)],
      ),
    ),
  );
  app.post(
    "/api/subjects/:id/files",
    upload.array("files", 30),
    h(async (req) => {
      const sid = id(req);
      subjectOr404(sid);
      const files = (req.files as Express.Multer.File[]) ?? [];
      if (!files.length) throw Object.assign(new Error("No llegó ningún archivo."), { status: 400 });
      const results: any[] = [];
      for (const f of files) {
        const name = fixName(f.originalname);
        try {
          const fid = storeUpload(sid, name, f.buffer, f.mimetype);
          await persistFile(get<any>("SELECT path FROM files WHERE id = ?", [fid])!.path);
          const r = await processFile(fid);
          results.push({ name, ok: true, ...r });
        } catch (e: any) {
          results.push({ name, ok: false, error: e.message });
        }
      }
      await refreshSubject(sid);
      return { results };
    }),
  );
  // Archivos subidos directo al store desde el navegador.
  app.post(
    "/api/subjects/:id/files/incoming",
    h(async (req) => {
      const sid = id(req);
      subjectOr404(sid);
      const items: { pathname: string; name: string }[] = req.body?.items ?? [];
      if (!items.length) throw Object.assign(new Error("No llegó ningún archivo."), { status: 400 });
      const results: any[] = [];
      for (const it of items) {
        try {
          const buf = await takeIncoming(String(it.pathname));
          const fid = storeUpload(sid, String(it.name), buf);
          await persistFile(get<any>("SELECT path FROM files WHERE id = ?", [fid])!.path);
          results.push({ name: it.name, ok: true, ...(await processFile(fid)) });
        } catch (e: any) {
          results.push({ name: it.name, ok: false, error: e.message });
        }
      }
      await refreshSubject(sid);
      return { results };
    }),
  );

  app.get(
    "/api/files/:id",
    h((req) => {
      const f = get<any>("SELECT * FROM files WHERE id = ?", [id(req)]);
      if (!f) throw Object.assign(new Error("Archivo inexistente"), { status: 404 });
      const chunks = all<any>("SELECT c.id, c.location, c.heading, c.text, c.quarantined, t.name topic FROM chunks c LEFT JOIN topics t ON t.id = c.topic_id WHERE c.file_id = ? ORDER BY c.ord", [f.id]);
      const alerts = all<any>("SELECT * FROM security_alerts WHERE file_id = ? ORDER BY CASE severity WHEN 'alto' THEN 0 WHEN 'medio' THEN 1 ELSE 2 END, id", [f.id]);
      const cells = all<any>("SELECT sheet, cell, formula, value, label FROM excel_cells WHERE file_id = ?", [f.id]);
      const { path: _p, ...rest } = f;
      return { ...rest, chunks, alerts, cells };
    }),
  );
  app.get("/api/files/:id/raw", async (req, res, next) => {
    try {
      const f = get<any>("SELECT * FROM files WHERE id = ?", [id(req)]);
      if (!f || !(await ensureLocalFile(f.path))) return res.status(404).json({ error: "No encontrado" });
      res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`);
      res.sendFile(path.resolve(f.path));
    } catch (e) {
      next(e);
    }
  });
  app.patch(
    "/api/files/:id",
    h(async (req) => {
      const fid = id(req);
      const f = get<any>("SELECT * FROM files WHERE id = ?", [fid]);
      if (!f) throw Object.assign(new Error("Archivo inexistente"), { status: 404 });
      const kind = req.body?.kind as FileKind;
      if (!(kind in KIND_LABELS)) throw Object.assign(new Error("Tipo inválido"), { status: 400 });
      run("UPDATE files SET kind = ? WHERE id = ?", [kind, fid]);
      invalidateIndex(f.subject_id);
      buildProfile(f.subject_id);
      generateFlashcards(f.subject_id);
      return { ok: true };
    }),
  );
  app.post(
    "/api/files/:id/reprocess",
    h(async (req) => {
      const fid = id(req);
      const f = get<any>("SELECT subject_id FROM files WHERE id = ?", [fid]);
      const r = await processFile(fid);
      await refreshSubject(f.subject_id);
      return r;
    }),
  );
  app.post(
    "/api/files/:id/transcription",
    h(async (req) => {
      const fid = id(req);
      const text = String(req.body?.text ?? "").trim();
      if (text.length < 5) throw Object.assign(new Error("La transcripción está vacía."), { status: 400 });
      await addManualText(fid, text);
      const f = get<any>("SELECT subject_id FROM files WHERE id = ?", [fid]);
      await refreshSubject(f.subject_id);
      return { ok: true };
    }),
  );
  app.delete(
    "/api/files/:id",
    h(async (req) => {
      const fid = id(req);
      const f = get<any>("SELECT subject_id FROM files WHERE id = ?", [fid]);
      deleteFile(fid);
      if (f) await refreshSubject(f.subject_id);
      return { ok: true };
    }),
  );
  app.get(
    "/api/subjects/:id/alerts",
    h((req) => all<any>("SELECT a.*, f.name file FROM security_alerts a JOIN files f ON f.id = a.file_id WHERE a.subject_id = ? ORDER BY a.decision = 'pendiente' DESC, CASE a.severity WHEN 'alto' THEN 0 WHEN 'medio' THEN 1 ELSE 2 END, a.id", [id(req)])),
  );
  app.post(
    "/api/alerts/:id/decision",
    h(async (req) => {
      const d = req.body?.decision;
      if (d !== "incluir" && d !== "excluir") throw Object.assign(new Error("Decisión inválida"), { status: 400 });
      decideAlert(id(req), d);
      const a = get<any>("SELECT subject_id FROM security_alerts WHERE id = ?", [id(req)]);
      buildProfile(a.subject_id);
      return { ok: true };
    }),
  );
  app.get(
    "/api/subjects/:id/search",
    h((req) => search(id(req), String(req.query.q ?? ""), { k: 10 })),
  );

  // ------------------------------------------------------------ Temas y mapa
  app.get(
    "/api/subjects/:id/topics",
    h((req) => {
      const sid = id(req);
      const mastery = computeMastery(sid);
      const counts = all<{ topic_id: number; n: number }>("SELECT topic_id, count(*) n FROM chunks WHERE subject_id = ? AND topic_id IS NOT NULL AND quarantined = 0 GROUP BY topic_id", [sid]);
      return {
        topics: topicsOf(sid).map((t) => ({
          ...t,
          mastery: mastery.find((m) => m.topicId === t.id),
          chunks: counts.find((c) => c.topic_id === t.id)?.n ?? 0,
          templates: t.library_key ? templatesFor(t.library_key).length : 0,
        })),
        edges: edgesOf(sid),
        suggestions: suggestTopics(sid),
        statusLabels: STATUS_LABEL,
      };
    }),
  );
  app.post(
    "/api/subjects/:id/topics",
    h(async (req) => {
      const sid = id(req);
      const b = req.body ?? {};
      if (Array.isArray(b.libraryKeys)) addLibraryTopics(sid, b.libraryKeys);
      else {
        if (!b.name) throw Object.assign(new Error("El tema necesita un nombre."), { status: 400 });
        createTopic(sid, { name: b.name, unit: b.unit, keywords: b.keywords, libraryKey: b.libraryKey || undefined, origin: b.origin });
        assignTopics(sid);
      }
      invalidateIndex(sid);
      buildProfile(sid);
      generateFlashcards(sid);
      return { ok: true };
    }),
  );
  app.patch(
    "/api/topics/:id",
    h((req) => {
      const tid = id(req);
      const t = get<any>("SELECT * FROM topics WHERE id = ?", [tid]);
      if (!t) throw Object.assign(new Error("Tema inexistente"), { status: 404 });
      const b = req.body ?? {};
      if (b.name !== undefined) run("UPDATE topics SET name = ? WHERE id = ?", [b.name, tid]);
      if (b.unit !== undefined) run("UPDATE topics SET unit = ? WHERE id = ?", [b.unit, tid]);
      if (b.keywords !== undefined) run("UPDATE topics SET keywords = ? WHERE id = ?", [JSON.stringify(b.keywords), tid]);
      if (b.libraryKey !== undefined) run("UPDATE topics SET library_key = ? WHERE id = ?", [b.libraryKey || null, tid]);
      assignTopics(t.subject_id);
      invalidateIndex(t.subject_id);
      return { ok: true };
    }),
  );
  app.delete(
    "/api/topics/:id",
    h((req) => {
      const t = get<any>("SELECT subject_id FROM topics WHERE id = ?", [id(req)]);
      run("UPDATE chunks SET topic_id = NULL WHERE topic_id = ?", [id(req)]);
      run("DELETE FROM topics WHERE id = ?", [id(req)]);
      if (t) {
        assignTopics(t.subject_id);
        invalidateIndex(t.subject_id);
      }
      return { ok: true };
    }),
  );
  app.post(
    "/api/subjects/:id/edges",
    h((req) => {
      const { from, to, remove } = req.body ?? {};
      if (remove) run("DELETE FROM topic_edges WHERE from_id = ? AND to_id = ?", [from, to]);
      else if (from !== to) run("INSERT OR IGNORE INTO topic_edges(subject_id, from_id, to_id) VALUES (?,?,?)", [id(req), from, to]);
      return { ok: true };
    }),
  );
  app.get(
    "/api/topics/:id",
    h((req) => {
      const tid = id(req);
      const t = get<any>("SELECT * FROM topics WHERE id = ?", [tid]);
      if (!t) throw Object.assign(new Error("Tema inexistente"), { status: 404 });
      const m = computeMastery(t.subject_id).find((x) => x.topicId === tid);
      const chunks = all<any>("SELECT c.id, c.location, c.text, f.name file, f.kind FROM chunks c JOIN files f ON f.id = c.file_id WHERE c.topic_id = ? AND c.quarantined = 0 ORDER BY f.kind, c.ord LIMIT 30", [tid]);
      const attempts = all<any>("SELECT a.id, a.score, a.created_at, a.hints_used, a.revealed, a.mode, e.spec FROM attempts a JOIN exercises e ON e.id = a.exercise_id WHERE a.topic_id = ? ORDER BY a.id DESC LIMIT 20", [tid]).map((a) => ({
        ...a,
        title: json<any>(a.spec, {}).title,
        spec: undefined,
      }));
      const errs = errorMemory(t.subject_id).filter((e) => e.topics.some((x) => x.id === tid));
      return { topic: { ...t, keywords: json(t.keywords, []) }, mastery: m, chunks, attempts, errors: errs, templates: t.library_key ? templatesFor(t.library_key).map((x) => ({ key: x.key, title: x.title })) : [] };
    }),
  );
  app.post(
    "/api/topics/:id/read",
    h((req) => {
      const tid = id(req);
      const t = get<any>("SELECT subject_id FROM topics WHERE id = ?", [tid]);
      const ids: number[] = req.body?.chunkIds ?? [];
      for (const c of ids) run("INSERT INTO reading_events(subject_id, topic_id, chunk_id) VALUES (?,?,?)", [t.subject_id, tid, c]);
      return { ok: true };
    }),
  );

  // ------------------------------------------------------------ Perfil del profesor
  app.get("/api/subjects/:id/profile", h((req) => getProfile(id(req)) ?? buildProfile(id(req))));
  app.post("/api/subjects/:id/profile/rebuild", h((req) => buildProfile(id(req))));
  app.post(
    "/api/subjects/:id/profile/ai",
    h(async (req) => {
      const r = await aiEnrichProfile(id(req));
      return { ...r, profile: getProfile(id(req)) };
    }),
  );

  // ------------------------------------------------------------ Examen y plan
  app.get(
    "/api/subjects/:id/exam",
    h((req) => {
      const sid = id(req);
      const exam = activeExam(sid);
      return { exam: exam ? { ...exam, units: json(exam.units, []), topic_ids: json(exam.topic_ids, []) } : null, plan: exam ? buildPlan(sid, exam) : null };
    }),
  );
  app.put(
    "/api/subjects/:id/exam",
    h((req) => {
      const sid = id(req);
      subjectOr404(sid);
      const { title, date, topicIds, units, dailyMinutes } = req.body ?? {};
      if (!date || Number.isNaN(new Date(date).getTime())) throw Object.assign(new Error("Poné una fecha válida para el examen."), { status: 400 });
      let tids: number[] = Array.isArray(topicIds) ? topicIds.map(Number) : [];
      if (!tids.length && Array.isArray(units) && units.length) tids = all<{ id: number }>(`SELECT id FROM topics WHERE subject_id = ? AND unit IN (${units.map(() => "?").join(",")})`, [sid, ...units]).map((t) => t.id);
      tx(() => {
        run("UPDATE exams SET active = 0 WHERE subject_id = ?", [sid]);
        run("INSERT INTO exams(subject_id, title, date, units, topic_ids, daily_minutes) VALUES (?,?,?,?,?,?)", [
          sid,
          title || "Parcial",
          date,
          JSON.stringify(units ?? []),
          JSON.stringify(tids),
          Number(dailyMinutes) || 90,
        ]);
      });
      generateFlashcards(sid);
      const exam = activeExam(sid)!;
      return { exam, plan: buildPlan(sid, exam) };
    }),
  );
  app.delete("/api/subjects/:id/exam", h((req) => run("UPDATE exams SET active = 0 WHERE subject_id = ?", [id(req)])));

  // ------------------------------------------------------------ Dashboard e indicadores
  app.get("/api/subjects/:id/dashboard", h((req) => dashboard(id(req))));
  app.get("/api/subjects/:id/readiness", h((req) => readiness(id(req), activeExam(id(req)))));
  app.get("/api/subjects/:id/verdict", h((req) => verdict(id(req))));
  app.get("/api/subjects/:id/errors", h((req) => errorMemory(id(req))));
  app.get("/api/subjects/:id/next", h((req) => nextActions(id(req))));

  // ------------------------------------------------------------ Ejercicios
  app.get(
    "/api/subjects/:id/exercises",
    h((req) =>
      all<any>(
        `SELECT e.id, e.kind, e.source, e.origin, e.created_at, e.hints_used, e.revealed, t.name topic, e.spec,
          (SELECT score FROM attempts a WHERE a.exercise_id = e.id ORDER BY a.id DESC LIMIT 1) score
         FROM exercises e LEFT JOIN topics t ON t.id = e.topic_id WHERE e.subject_id = ? AND e.mock_id IS NULL ORDER BY e.id DESC LIMIT 60`,
        [id(req)],
      ).map((e) => ({ ...e, title: json<any>(e.spec, {}).title, spec: undefined })),
    ),
  );
  app.post(
    "/api/subjects/:id/exercises",
    h(async (req) => {
      const b = req.body ?? {};
      const eid = await createExercise(id(req), { topicId: b.topicId ?? null, errorTag: b.errorTag, excel: b.excel, kind: b.kind, useAi: b.useAi, origin: b.origin ?? "practica" });
      return publicView(getExercise(eid));
    }),
  );
  app.get(
    "/api/exercises/:id",
    h((req) => {
      const row = getExercise(id(req));
      const view: any = publicView(row);
      const last = get<any>("SELECT * FROM attempts WHERE exercise_id = ? ORDER BY id DESC LIMIT 1", [row.id]);
      const mock = row.mock_id ? get<any>("SELECT status FROM mocks WHERE id = ?", [row.mock_id]) : null;
      const locked = mock && mock.status !== "entregado";
      if (!locked && (last || row.revealed)) view.solution = solutionOf(json(row.spec, null as any));
      if (!locked && last) view.lastAttempt = { ...last, feedback: json(last.feedback, null), answers: json(last.answers, {}), photo: !!last.photo_path };
      return view;
    }),
  );
  app.post("/api/exercises/:id/hint", h((req) => hint(id(req), Number(req.body?.level ?? 1) as any)));
  app.post(
    "/api/exercises/:id/submit",
    h(async (req) => {
      const row = getExercise(id(req));
      if (row.mock_id) {
        const m = get<any>("SELECT status FROM mocks WHERE id = ?", [row.mock_id]);
        if (m?.status === "en_curso") throw Object.assign(new Error("En un simulacro se entrega todo junto al final."), { status: 400 });
      }
      const { photoPath: _ignored, photoToken, ...body } = req.body ?? {};
      const photoPath = photoPathFromToken(photoToken);
      const r = await submit(row.id, { ...body, ...(photoPath ? { photoPath, input: "foto" } : {}) });
      return { ...r, exercise: publicView(getExercise(row.id)) };
    }),
  );
  app.post(
    "/api/exercises/:id/photo",
    upload.single("photo"),
    h(async (req) => {
      const eid = id(req);
      const f = req.file;
      if (!f) throw Object.assign(new Error("No llegó la foto."), { status: 400 });
      const p = savePhoto(eid, fixName(f.originalname), f.buffer);
      await persistFile(p);
      return gradePhoto(eid, p);
    }),
  );
  app.get("/api/photo-token/:token", async (req, res) => {
    const p = photoPathFromToken(req.params.token);
    if (!p || !(await ensureLocalFile(p))) return res.status(404).end();
    res.sendFile(path.resolve(p));
  });
  app.get("/api/photos/:attempt", async (req, res) => {
    const a = get<any>("SELECT photo_path FROM attempts WHERE id = ?", [Number(req.params.attempt)]);
    if (!a?.photo_path || !(await ensureLocalFile(a.photo_path))) return res.status(404).end();
    res.sendFile(path.resolve(a.photo_path));
  });
  app.get("/api/exercises/:id/excel", (req, res, next) => {
    try {
      const { name, buffer } = excelFile(id(req), req.query.solution === "1");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  });
  app.post(
    "/api/exercises/:id/excel",
    upload.single("file"),
    h(async (req) => {
      if (!req.file) throw Object.assign(new Error("No llegó la planilla."), { status: 400 });
      const r = await submitExcel(id(req), req.file.buffer);
      return { ...r, exercise: publicView(getExercise(id(req))) };
    }),
  );

  // ------------------------------------------------------------ Simulacros
  app.get("/api/subjects/:id/mocks", h((req) => ({ mocks: listMocks(id(req)), structure: planStructure(id(req)), exams: (getProfile(id(req))?.exams ?? []).map((e) => ({ fileId: e.fileId, file: e.file, items: e.items.length, durationMin: e.durationMin })) })));
  app.post(
    "/api/subjects/:id/mocks",
    h(async (req) => {
      const mid = await createMock(id(req), { mode: req.body?.mode, fileId: req.body?.fileId });
      return mockView(mid);
    }),
  );
  app.get("/api/mocks/:id", h((req) => mockView(id(req))));
  app.post("/api/mocks/:id/finish", h((req) => finishForSelfGrading(id(req))));
  app.post("/api/mocks/:id/submit", h((req) => submitMock(id(req), req.body?.answers ?? {})));

  // ------------------------------------------------------------ Tarjetas
  app.get(
    "/api/subjects/:id/flashcards",
    h((req) => {
      const sid = id(req);
      if (req.query.due === "1") return dueCards(sid, 30);
      return all<any>("SELECT f.*, t.name topic_name FROM flashcards f LEFT JOIN topics t ON t.id = f.topic_id WHERE f.subject_id = ? ORDER BY f.priority DESC", [sid]);
    }),
  );
  app.post("/api/subjects/:id/flashcards/generate", h((req) => generateFlashcards(id(req))));
  app.post(
    "/api/flashcards/:id/review",
    h((req) => {
      const g = Number(req.body?.grade);
      if (![0, 1, 2, 3].includes(g)) throw Object.assign(new Error("Nota inválida"), { status: 400 });
      return reviewCard(id(req), g as 0 | 1 | 2 | 3);
    }),
  );
  app.delete("/api/flashcards/:id", h((req) => run("DELETE FROM flashcards WHERE id = ?", [id(req)])));

  // ------------------------------------------------------------ Tutor
  app.get("/api/subjects/:id/tutor", h((req) => history(id(req))));
  app.post("/api/subjects/:id/tutor", h((req) => ask(id(req), String(req.body?.question ?? ""))));
  app.delete("/api/subjects/:id/tutor", h((req) => run("DELETE FROM tutor_messages WHERE subject_id = ?", [id(req)])));

  // ------------------------------------------------------------ Sesiones de estudio
  app.post(
    "/api/subjects/:id/sessions",
    h(async (req) => {
      const sessionId = startSession(id(req), Number(req.body?.minutes ?? 45));
      return nextTask(sessionId);
    }),
  );
  app.get("/api/subjects/:id/sessions", h((req) => all<any>("SELECT id, minutes, started_at, ended_at FROM study_sessions WHERE subject_id = ? ORDER BY id DESC LIMIT 10", [id(req)])));
  app.get("/api/sessions/:id", h((req) => sessionState(id(req))));
  app.post("/api/sessions/:id/next", h((req) => nextTask(id(req), !!req.body?.skip)));
  app.post("/api/sessions/:id/end", h((req) => endSession(id(req))));

  // ------------------------------------------------------------ Material de ejemplo
  app.get("/api/demo-files", h(async () => (await import("./demo/seed.ts")).demoFiles()));
  app.post(
    "/api/subjects/:id/demo-files",
    h(async (req) => {
      subjectOr404(id(req));
      return { results: await (await import("./demo/seed.ts")).loadDemoFiles(id(req)) };
    }),
  );

  // ------------------------------------------------------------ Errores y estáticos
  app.use("/api", (_req, res) => res.status(404).json({ error: "Ruta inexistente" }));
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status ?? (err instanceof multer.MulterError ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message ?? String(err) });
  });
  return app;
}
