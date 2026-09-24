import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Timer, SkipForward, Square, ArrowRight, CheckCircle2, BookOpen } from "lucide-react";
import { api, useApi, emitChange, pct } from "../api";
import { useSid } from "../App";
import { Loading, useToast, SourceCard, Spinner, toneFor, Callout } from "../ui";
import { ExerciseView, GradeView } from "../components/Exercise";
import { Reviewer } from "./Flashcards";
import { ACTION_ICON } from "./Today";

export function StudyPage() {
  const sid = useSid();
  const toast = useToast();
  const [params] = useSearchParams();
  const sessions = useApi<any[]>(`/api/subjects/${sid}/sessions`);
  const [s, setS] = useState<any>(null);
  const [minutes, setMinutes] = useState(Number(params.get("min")) || 45);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  // Retomar una sesión abierta.
  useEffect(() => {
    const open = sessions.data?.find((x) => !x.ended_at);
    if (open && !s) api.get(`/api/sessions/${open.id}`).then((v) => (v.remainingMin > 0 ? setS(v) : null));
  }, [sessions.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setBusy(true);
    try {
      setS(await api.post(`/api/subjects/${sid}/sessions`, { minutes }));
    } catch (e: any) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const next = useCallback(
    async (skip = false) => {
      if (!s) return;
      setBusy(true);
      try {
        const v = await api.post(`/api/sessions/${s.id}/next`, { skip });
        setS(v);
        emitChange();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e: any) {
        toast(e.message, "bad");
      } finally {
        setBusy(false);
      }
    },
    [s, toast],
  );
  const end = async () => {
    setS(await api.post(`/api/sessions/${s.id}/end`));
    emitChange();
  };

  if (!s) {
    return (
      <div className="content narrow">
        <div className="page-head">
          <div>
            <h1>Sesión de estudio</h1>
            <p className="sub">Decime cuánto tiempo tenés. FORJA decide qué hacer según el examen, tu nivel, tus errores y el material que falta, y te da una tarea por vez.</p>
          </div>
        </div>
        <div className="card pad col gap-16">
          <div className="label">¿Cuánto tiempo tenés?</div>
          <div className="row wrap gap-6">
            {[15, 30, 45, 60, 90, 120].map((m) => (
              <button key={m} className={`btn ${minutes === m ? "primary" : ""}`} onClick={() => setMinutes(m)}>
                {m} min
              </button>
            ))}
            <input className="input num" type="number" min={10} max={240} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} style={{ width: 90 }} aria-label="Minutos" />
          </div>
          <button className="btn primary lg" onClick={start} disabled={busy}>
            {busy ? <span className="spinner" /> : <Timer />} Empezar {minutes} minutos
          </button>
        </div>
      </div>
    );
  }

  const elapsed = (now - new Date(s.startedAt).getTime()) / 60000;
  const left = Math.max(0, Math.round(s.minutes - elapsed));
  const cur = s.current;
  const done = s.tasks.filter((t: any) => t.status === "hecha");

  if (!cur) {
    return (
      <div className="content narrow">
        <div className="page-head">
          <div>
            <h1>Sesión terminada</h1>
            <p className="sub">
              {done.length} tarea(s) en {Math.round(Math.min(elapsed, s.minutes))} minutos{s.summary.avg !== null ? ` · promedio en ejercicios ${pct(s.summary.avg)}` : ""}.
            </p>
          </div>
        </div>
        <TaskList tasks={s.tasks} />
        <div className="row mt-16">
          <button className="btn primary" onClick={() => setS(null)}>
            Nueva sesión
          </button>
          <Link to={`/m/${sid}`} className="btn">
            Volver a Hoy
          </Link>
        </div>
      </div>
    );
  }

  const Icon = ACTION_ICON[cur.kind] ?? Timer;
  return (
    <div className="content narrow">
      <div className="sticky-bar row between">
        <div className="row gap-6">
          <Timer size={17} />
          <span className="timer" style={{ fontSize: 17 }}>
            {left} min
          </span>
          <span className="tiny faint">de {s.minutes} · {done.length} tarea(s) hechas</span>
        </div>
        <div className="row gap-6">
          <button className="btn sm" onClick={() => next(true)} disabled={busy}>
            <SkipForward /> Saltar
          </button>
          <button className="btn sm ghost" onClick={end} disabled={busy}>
            <Square /> Terminar
          </button>
        </div>
      </div>
      {left === 0 && (
        <div style={{ marginBottom: 12 }}>
          <Callout kind="warn">Se terminó el tiempo que marcaste. Terminá esta tarea o cerrá la sesión.</Callout>
        </div>
      )}
      <div className="row gap-6 mb-8" style={{ alignItems: "flex-start" }}>
        <div className="step-n" style={{ width: 34, height: 34, borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent-text)" }}>
          <Icon size={17} />
        </div>
        <div className="grow">
          <span className="tiny faint">
            Tarea {s.tasks.length} · ~{cur.minutes} min
          </span>
          <h1 style={{ fontSize: 21 }}>{cur.title}</h1>
          <p className="small muted">{cur.detail}</p>
        </div>
      </div>
      <div className="mt-16">
        <TaskBody key={s.tasks.length} task={cur} sid={sid} onNext={() => next(false)} busy={busy} />
      </div>
      {s.tasks.length > 1 && (
        <details className="mt-24">
          <summary className="small muted" style={{ cursor: "pointer" }}>Tareas anteriores</summary>
          <TaskList tasks={s.tasks.slice(0, -1)} />
        </details>
      )}
    </div>
  );
}

function TaskList({ tasks }: { tasks: any[] }) {
  return (
    <div className="card list mt-8">
      {tasks.map((t, i) => (
        <div key={i} className="list-item small">
          {t.status === "hecha" ? <CheckCircle2 size={15} color="var(--ok)" /> : <SkipForward size={15} color="var(--text-3)" />}
          <span className="grow">{t.title}</span>
          {typeof t.score === "number" && <span className={`badge ${toneFor(t.score) ?? ""}`}>{pct(t.score)}</span>}
          {t.status === "salteada" && <span className="badge">salteada</span>}
        </div>
      ))}
    </div>
  );
}

function TaskBody({ task, sid, onNext, busy }: { task: any; sid: number; onNext: () => void; busy: boolean }) {
  const ex = useApi<any>(task.exerciseId ? `/api/exercises/${task.exerciseId}` : null);
  const cards = useApi<any[]>(task.kind === "tarjetas" ? `/api/subjects/${sid}/flashcards` : null);
  const topic = useApi<any>(task.kind === "leer" && task.topicId ? `/api/topics/${task.topicId}` : null);
  const [result, setResult] = useState<any>(null);
  const [cardsDone, setCardsDone] = useState(false);

  if (task.kind === "tarjetas") {
    if (!cards.data) return <Loading />;
    const list = cards.data.filter((c) => task.cardIds?.includes(c.id));
    return (
      <div className="col gap-16">
        {!cardsDone ? <Reviewer cards={list} compact onDone={() => setCardsDone(true)} /> : <Callout kind="ok">Repaso terminado.</Callout>}
        <button className="btn primary" onClick={onNext} disabled={busy} style={{ alignSelf: "flex-end" }}>
          Siguiente tarea <ArrowRight />
        </button>
      </div>
    );
  }
  if (task.kind === "leer") {
    if (!topic.data) return <Loading />;
    const chunks = topic.data.chunks.filter((c: any) => task.chunkIds?.includes(c.id));
    return (
      <div className="col gap-16">
        {chunks.map((c: any) => (
          <div key={c.id} className="card pad col gap-6">
            <SourceCard s={{ file: c.file, location: c.location, chunkId: c.id }} subjectId={sid} />
            <div className="small" style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{c.text}</div>
          </div>
        ))}
        <button className="btn primary" onClick={onNext} disabled={busy} style={{ alignSelf: "flex-end" }}>
          <BookOpen /> Listo, lo leí
        </button>
      </div>
    );
  }
  if (!ex.data) return ex.error ? <Callout kind="bad">{ex.error}</Callout> : <Spinner label="Armando el ejercicio…" />;
  return result ? (
    <div className="col gap-16">
      <GradeView r={result} ex={ex.data} sid={sid} />
      <button className="btn primary lg" onClick={onNext} disabled={busy} style={{ alignSelf: "flex-end" }}>
        Siguiente tarea <ArrowRight />
      </button>
    </div>
  ) : (
    <>
      <h2 className="mb-8">{ex.data.title}</h2>
      <ExerciseView ex={ex.data} sid={sid} onGraded={setResult} />
    </>
  );
}
