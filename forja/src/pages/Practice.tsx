import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Dumbbell, Sparkles, FileSpreadsheet, Target, ArrowRight, History } from "lucide-react";
import { api, useApi, useOnChange, relTime, pct } from "../api";
import { useSid } from "../App";
import { Loading, ErrorBox, useToast, StatusBadge, Spinner, Empty, Bar, toneFor } from "../ui";
import { ExerciseView, GradeView, MethodBadge, SOURCE_LABEL } from "../components/Exercise";

export function PracticePage() {
  const sid = useSid();
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const topics = useApi<any>(`/api/subjects/${sid}/topics`);
  const history = useApi<any[]>(`/api/subjects/${sid}/exercises`);
  const status = useApi<any>("/api/status");
  const next = useApi<any[]>(`/api/subjects/${sid}/next`);
  useOnChange(useCallback(() => { topics.reload(); history.reload(); }, [topics.reload, history.reload]));
  const [opts, setOpts] = useState({ topicId: "", excel: false, ai: false, kind: "auto" });
  const [busy, setBusy] = useState(false);

  const create = async (body: any) => {
    setBusy(true);
    try {
      const ex = await api.post(`/api/subjects/${sid}/exercises`, body);
      nav(`/m/${sid}/ejercicio/${ex.id}`);
    } catch (e: any) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };

  // ?auto=1: ejercicio del tema con más prioridad.
  useEffect(() => {
    if (params.get("auto") && next.data) {
      const a = next.data.find((x) => x.kind === "tema" || x.kind === "error");
      if (a) create(a.kind === "error" ? { errorTag: a.errorTag } : { topicId: a.topicId });
    }
  }, [params, next.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = (topics.data?.topics ?? []).filter((t: any) => t.templates > 0 || t.chunks > 0);
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Practicar</h1>
          <p className="sub">Ejercicios nuevos con números distintos a los del material. Intentá primero sin ayuda: las pistas quedan registradas.</p>
        </div>
      </div>
      <div className="card pad col gap-16">
        <div className="row wrap gap-16" style={{ alignItems: "flex-end" }}>
          <div className="field grow" style={{ minWidth: 220 }}>
            <label>Tema</label>
            <select className="input" value={opts.topicId} onChange={(e) => setOpts({ ...opts, topicId: e.target.value })}>
              <option value="">El que más me conviene ahora</option>
              {list.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Tipo</label>
            <div className="seg">
              {[
                ["auto", "Práctico"],
                ["teoria", "Teórico"],
              ].map(([k, l]) => (
                <button key={k} className={opts.kind === k ? "active" : ""} onClick={() => setOpts({ ...opts, kind: k })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <label className="row gap-6 small" style={{ height: 36 }}>
            <input type="checkbox" checked={opts.excel} onChange={(e) => setOpts({ ...opts, excel: e.target.checked })} /> <FileSpreadsheet size={15} /> Resolver en Excel
          </label>
          {status.data?.ai && (
            <label className="row gap-6 small" style={{ height: 36 }} title="El modelo arma un ejercicio nuevo a partir de tus archivos; los números se validan con el motor de FORJA.">
              <input type="checkbox" checked={opts.ai} onChange={(e) => setOpts({ ...opts, ai: e.target.checked })} /> <Sparkles size={15} /> Generar con IA desde mi material
            </label>
          )}
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => {
              const top = next.data?.find((x) => x.kind === "tema");
              const topicId = opts.topicId ? Number(opts.topicId) : top?.topicId ?? list[0]?.id;
              create({ topicId, excel: opts.excel, useAi: opts.ai, kind: opts.kind === "teoria" ? "teoria" : "auto" });
            }}
          >
            {busy ? <span className="spinner" /> : <Dumbbell />} Nuevo ejercicio
          </button>
        </div>
      </div>

      <h2 className="mt-24 mb-8">Por tema</h2>
      {topics.loading && !topics.data ? (
        <Loading />
      ) : !list.length ? (
        <div className="card">
          <Empty icon={<Target />} title="No hay temas con ejercicios">
            Cargá material o agregá temas desde el <Link to={`/m/${sid}/mapa`} style={{ textDecoration: "underline" }}>mapa</Link>.
          </Empty>
        </div>
      ) : (
        <div className="grid g-auto">
          {list.map((t: any) => (
            <div key={t.id} className="card pad col gap-6">
              <div className="row between gap-6">
                <Link to={`/m/${sid}/tema/${t.id}`} style={{ fontWeight: 600 }}>
                  {t.name}
                </Link>
                <StatusBadge status={t.mastery?.status ?? "sin_estudiar"} />
              </div>
              <Bar value={t.mastery?.effective ?? 0} tone={toneFor(t.mastery?.attempts ? t.mastery.effective : null)} />
              <div className="row between">
                <span className="tiny faint">
                  {t.mastery?.attempts ?? 0} ejercicio(s) · {t.unit || "sin unidad"}
                </span>
                <button className="btn sm" disabled={busy} onClick={() => create({ topicId: t.id, excel: opts.excel, useAi: opts.ai })}>
                  Practicar <ArrowRight />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="row gap-6 mt-24 mb-8">
        <History size={17} />
        <h2>Historial</h2>
      </div>
      <div className="card list">
        {(history.data ?? []).map((e) => (
          <Link key={e.id} to={`/m/${sid}/ejercicio/${e.id}`} className="list-item">
            <div className="grow">
              <div className="small" style={{ fontWeight: 540 }}>{e.title}</div>
              <div className="tiny faint">
                {e.topic ?? "—"} · {SOURCE_LABEL[e.source] ?? e.source} · {relTime(e.created_at)}
                {e.hints_used ? ` · ${e.hints_used} pista(s)` : ""}
                {e.revealed ? " · vio la solución" : ""}
              </div>
            </div>
            {e.score === null ? <span className="badge">Sin entregar</span> : <span className={`badge ${toneFor(e.score) ?? ""}`}>{pct(e.score)}</span>}
          </Link>
        ))}
        {!history.data?.length && <div className="card-body muted small">Todavía no resolviste ejercicios.</div>}
      </div>
    </div>
  );
}

export function ExercisePage() {
  const sid = useSid();
  const nav = useNavigate();
  const toast = useToast();
  const { eid } = useParams();
  const { data: ex, error, loading, reload } = useApi<any>(`/api/exercises/${eid}`);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setResult(null), [eid]);

  if (loading && !ex) return <div className="content narrow"><Loading lines={4} /></div>;
  if (error) return <div className="content narrow"><ErrorBox error={error} onRetry={reload} /></div>;
  const shown = result ?? (ex.lastAttempt ? { grade: ex.lastAttempt.feedback, solution: ex.solution } : null);

  const another = async (body: any) => {
    setBusy(true);
    try {
      const n = await api.post(`/api/subjects/${sid}/exercises`, body);
      nav(`/m/${sid}/ejercicio/${n.id}`);
    } catch (e: any) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="content narrow">
      <div className="page-head" style={{ marginBottom: 14 }}>
        <div>
          <div className="row wrap gap-6 mb-8">
            {ex.topicName && (
              <Link to={`/m/${sid}/tema/${ex.topicId}`} className="badge">
                {ex.topicName}
              </Link>
            )}
            <span className="badge">{SOURCE_LABEL[ex.source] ?? ex.source}</span>
            <MethodBadge ex={ex} sid={sid} />
            {ex.excelMode && <span className="badge ok">Excel</span>}
          </div>
          <h1>{ex.title}</h1>
        </div>
        {busy && <Spinner />}
      </div>
      {ex.mockId && !shown ? (
        <p className="muted">Este ejercicio es parte de un simulacro. <Link to={`/m/${sid}/simulacro/${ex.mockId}`} style={{ textDecoration: "underline" }}>Ir al simulacro</Link></p>
      ) : shown ? (
        <>
          <GradeView
            r={shown}
            ex={ex}
            sid={sid}
            onAnother={ex.topicId ? () => another({ topicId: ex.topicId, excel: ex.excelMode }) : undefined}
            onErrorExercise={(tag) => another({ errorTag: tag })}
          />
          <details className="mt-16">
            <summary className="small muted" style={{ cursor: "pointer" }}>Ver el enunciado</summary>
            <div className="card pad mt-8 statement small">{ex.statement ?? ex.question}</div>
          </details>
        </>
      ) : (
        <ExerciseView key={ex.id} ex={ex} sid={sid} onGraded={(r) => { setResult(r); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      )}
    </div>
  );
}
