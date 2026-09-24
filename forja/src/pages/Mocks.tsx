import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FileCheck2, Clock, Play, History, BookOpen } from "lucide-react";
import { api, useApi, emitChange, relTime, pct } from "../api";
import { useSid } from "../App";
import { Loading, ErrorBox, useToast, Callout, ScoreRing, Modal, SourceCard, toneFor, Empty } from "../ui";
import { ExerciseView, GradeView, SolutionView } from "../components/Exercise";

export function MocksPage() {
  const sid = useSid();
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<any>(`/api/subjects/${sid}/mocks`);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<string>("");
  if (loading && !data) return <div className="content"><Loading /></div>;
  if (error) return <div className="content"><ErrorBox error={error} onRetry={reload} /></div>;
  const create = async (body: any) => {
    setBusy(true);
    try {
      const m = await api.post(`/api/subjects/${sid}/mocks`, body);
      nav(`/m/${sid}/simulacro/${m.id}`);
    } catch (e: any) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const st = data.structure;
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Simulacros</h1>
          <p className="sub">Parciales nuevos con la estructura, la dificultad y el reparto teoría/práctica de los modelos de tu profesor. Con tiempo, sin pistas y sin respuestas hasta entregar.</p>
        </div>
      </div>
      <div className="grid g2">
        <div className="card pad col gap-16">
          <div className="row gap-6">
            <FileCheck2 size={18} />
            <h2>Simulacro nuevo</h2>
          </div>
          <p className="small muted">{st.basis}</p>
          <div className="row wrap gap-6">
            <span className="badge">
              <Clock /> {st.durationMin} min
            </span>
            <span className="badge">{st.items.filter((i: any) => i.type === "practica").length} práctico(s)</span>
            <span className="badge info">{st.items.filter((i: any) => i.type === "teoria").length} teórico(s)</span>
            {st.generic && <span className="badge warn">estructura genérica</span>}
          </div>
          <p className="tiny faint">Los ejercicios son nuevos: no copian preguntas del material. Los temas salen de lo que toma el profesor y de tus puntos débiles.</p>
          <button className="btn primary lg" disabled={busy} onClick={() => create({ mode: "nuevo" })}>
            {busy ? <span className="spinner" /> : <Play />} Empezar ahora
          </button>
        </div>
        <div className="card pad col gap-16">
          <div className="row gap-6">
            <BookOpen size={18} />
            <h2>Practicar un parcial existente</h2>
          </div>
          <p className="small muted">Las consignas literales de un parcial de tu material, con su tiempo. Al terminar, se compara con la resolución del material (o se corrige con IA si hay API key).</p>
          {data.exams.length ? (
            <>
              <select className="input" value={file} onChange={(e) => setFile(e.target.value)}>
                {data.exams.map((e: any) => (
                  <option key={e.fileId} value={e.fileId}>
                    {e.file} · {e.items} ítems
                  </option>
                ))}
              </select>
              <button className="btn" disabled={busy} onClick={() => create({ mode: "existente", fileId: Number(file || data.exams[0].fileId) })}>
                Practicar este parcial
              </button>
            </>
          ) : (
            <span className="muted small">No hay parciales en el material.</span>
          )}
        </div>
      </div>
      <div className="row gap-6 mt-24 mb-8">
        <History size={17} />
        <h2>Anteriores</h2>
      </div>
      <div className="card list">
        {data.mocks.map((m: any) => (
          <Link key={m.id} to={`/m/${sid}/simulacro/${m.id}`} className="list-item">
            <div className="grow">
              <div className="small" style={{ fontWeight: 540 }}>{m.title}</div>
              <div className="tiny faint">
                {m.mode === "existente" ? "parcial existente" : "nuevo"} · {m.duration_min} min · {relTime(m.started_at)}
              </div>
            </div>
            {m.status === "entregado" ? <span className={`badge ${toneFor(m.score) ?? ""}`}>{pct(m.score)}</span> : <span className="badge warn">En curso</span>}
          </Link>
        ))}
        {!data.mocks.length && <Empty title="Todavía no hiciste simulacros" />}
      </div>
    </div>
  );
}

function useTimer(endsAt: string | undefined, running: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!endsAt) return { left: 0, text: "" };
  const left = Math.max(0, new Date(endsAt).getTime() - now);
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return { left, text: `${h ? h + ":" : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` };
}

export function MockPage() {
  const sid = useSid();
  const { mid } = useParams();
  const toast = useToast();
  const { data: m, error, loading, reload, setData } = useApi<any>(`/api/mocks/${mid}`);
  const status = useApi<any>("/api/status");
  const key = `forja-mock-${mid}`;
  const [answers, setAnswers] = useState<Record<string, any>>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "{}");
    } catch {
      return {};
    }
  });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [review, setReview] = useState<any[] | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const running = m?.status === "en_curso";
  const timer = useTimer(m?.endsAt, running);
  const autoSent = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(answers));
    } catch {
      /* sin almacenamiento local */
    }
  }, [answers, key]);

  const needsSelf = m?.mode === "existente" && !status.data?.ai;

  const submit = useCallback(async () => {
    setBusy(true);
    setConfirm(false);
    try {
      if (needsSelf && !review) {
        setReview(await api.post(`/api/mocks/${mid}/finish`));
        reload();
        return;
      }
      const payload: Record<string, any> = {};
      for (const e of m.exercises) payload[e.id] = { ...(answers[e.id] ?? {}), ...(needsSelf ? { selfScore: (scores[e.id] ?? 0) / 100, input: "autoevaluado" } : {}) };
      const r = await api.post(`/api/mocks/${mid}/submit`, { answers: payload });
      setData(r);
      try {
        localStorage.removeItem(key);
      } catch {
        /* nada */
      }
      emitChange();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  }, [answers, m, mid, needsSelf, review, scores, key, reload, setData, toast]);

  // Al terminarse el tiempo se entrega solo (una vez).
  useEffect(() => {
    if (running && timer.left === 0 && m && !autoSent.current) {
      autoSent.current = true;
      toast("Se terminó el tiempo: entregando.");
      submit();
    }
  }, [running, timer.left, m, submit, toast]);

  // Si el alumno recarga durante la autoevaluación, recuperamos las resoluciones.
  useEffect(() => {
    if (m?.status === "autoevaluando" && !review) api.post(`/api/mocks/${mid}/finish`).then(setReview);
  }, [m?.status, mid, review]);

  if (loading && !m) return <div className="content narrow"><Loading lines={5} /></div>;
  if (error) return <div className="content narrow"><ErrorBox error={error} onRetry={reload} /></div>;
  const answered = m.exercises.filter((e: any) => {
    const a = answers[e.id];
    return a && ((a.answers && Object.values(a.answers).some((v: any) => String(v).trim())) || a.choice !== null && a.choice !== undefined || (a.text ?? "").trim());
  }).length;

  if (m.status === "entregado") return <MockResult m={m} sid={sid} />;

  return (
    <div className="content narrow">
      <div className="sticky-bar row between">
        <div className="col" style={{ gap: 0 }}>
          <strong>{m.title}</strong>
          <span className="tiny faint">
            {answered}/{m.exercises.length} respondidos · sin pistas
          </span>
        </div>
        <div className="row">
          {running && (
            <span className={`timer ${timer.left < 5 * 60000 ? "low" : ""}`} aria-live="off">
              {timer.text}
            </span>
          )}
          <button className="btn primary" onClick={() => (review ? submit() : setConfirm(true))} disabled={busy}>
            {busy ? <span className="spinner" /> : null} {review ? "Registrar autoevaluación" : "Entregar"}
          </button>
        </div>
      </div>
      <Callout kind="info">{m.structure.basis}</Callout>
      {review && (
        <div className="mt-16">
          <Callout kind="warn">Terminaste. Compará cada respuesta con la resolución del material y marcá qué tan bien estuvo. Sin API key esta es la única forma honesta de corregir un parcial existente.</Callout>
        </div>
      )}
      <div className="col gap-24 mt-16">
        {m.exercises.map((e: any, i: number) => {
          const rv = review?.find((x) => x.exerciseId === e.id);
          return (
            <section key={e.id} className="col gap-6">
              <div className="row between">
                <h2>
                  {i + 1}. {e.title}
                </h2>
                {e.points ? <span className="badge">{e.points} pts</span> : null}
              </div>
              {review ? (
                <div className="card pad col gap-16">
                  <div className="statement small">{e.statement ?? e.question}</div>
                  <div className="field">
                    <label>Tu respuesta</label>
                    <div className="small muted" style={{ whiteSpace: "pre-wrap" }}>{answers[e.id]?.text || "(sin respuesta escrita)"}</div>
                  </div>
                  <SolutionView sol={{ kind: "existing", resolution: rv?.resolution, resolutionSource: rv?.resolutionSource }} sid={sid} />
                  <div className="field">
                    <label>Autoevaluación: {scores[e.id] ?? 0}%</label>
                    <input type="range" min={0} max={100} step={10} value={scores[e.id] ?? 0} onChange={(ev) => setScores({ ...scores, [e.id]: Number(ev.target.value) })} />
                  </div>
                </div>
              ) : (
                <ExerciseView ex={e} sid={sid} examMode value={answers[e.id]} onChange={(v) => setAnswers((a) => ({ ...a, [e.id]: v }))} />
              )}
            </section>
          );
        })}
      </div>
      <div className="row mt-24" style={{ justifyContent: "flex-end" }}>
        <button className="btn primary lg" onClick={() => (review ? submit() : setConfirm(true))} disabled={busy}>
          {review ? "Registrar autoevaluación" : "Entregar simulacro"}
        </button>
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="¿Entregar?">
        <div className="col gap-16">
          {answered < m.exercises.length && (
            <Callout kind="warn">
              Te faltan {m.exercises.length - answered} ejercicio(s) sin responder.
            </Callout>
          )}
          <p className="muted">Después de entregar vas a ver la corrección completa y ya no vas a poder cambiar respuestas.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn ghost" onClick={() => setConfirm(false)}>
              Seguir
            </button>
            <button className="btn primary" onClick={submit}>
              Entregar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function MockResult({ m, sid }: { m: any; sid: number }) {
  const res = m.result;
  const byTopic = useMemo(() => {
    const t = new Map<string, { earned: number; total: number }>();
    for (const r of res.results) {
      const k = r.exercise.topicName ?? "Sin tema";
      const cur = t.get(k) ?? { earned: 0, total: 0 };
      t.set(k, { earned: cur.earned + r.earned, total: cur.total + r.points });
    }
    return [...t.entries()];
  }, [res]);
  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <h1>{m.title}: corrección</h1>
          <p className="sub">
            Entregado {relTime(m.submittedAt)}
            {res.late ? " · fuera de tiempo" : ""}
          </p>
        </div>
      </div>
      <div className="card pad row gap-24" style={{ flexWrap: "wrap" }}>
        <ScoreRing value={m.score} size="lg" />
        <div className="col grow" style={{ minWidth: 220 }}>
          <div className="stat">
            <span className="v">
              {res.earned} <span className="faint" style={{ fontSize: 16 }}>/ {res.total} puntos</span>
            </span>
            <span className="l">Puntaje del simulacro</span>
          </div>
          {byTopic.map(([t, v]) => (
            <div key={t} className="row between small">
              <span className="muted">{t}</span>
              <span className="num">
                {Math.round(v.earned * 10) / 10}/{v.total}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="col gap-24 mt-24">
        {res.results.map((r: any, i: number) => (
          <section key={r.exerciseId} className="col gap-6">
            <div className="row between">
              <h2>
                {i + 1}. {r.title}
              </h2>
              <span className={`badge ${toneFor(r.grade.score) ?? ""}`}>
                {r.earned}/{r.points} pts
              </span>
            </div>
            <details>
              <summary className="small muted" style={{ cursor: "pointer" }}>Enunciado</summary>
              <div className="card pad mt-8 statement small">{r.exercise.statement ?? r.exercise.question}</div>
              {r.exercise.source?.file && <SourceCard s={r.exercise.source} subjectId={sid} />}
            </details>
            <GradeView r={r} ex={r.exercise} sid={sid} />
          </section>
        ))}
      </div>
      <div className="row mt-24">
        <Link to={`/m/${sid}/aprobar`} className="btn primary">
          ¿Estoy para aprobar?
        </Link>
        <Link to={`/m/${sid}/errores`} className="btn">
          Ver errores
        </Link>
      </div>
    </div>
  );
}
