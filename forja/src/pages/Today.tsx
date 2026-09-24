import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarClock, ShieldAlert, Upload, Target, Bug, Layers, BookOpen, FileCheck2, Dumbbell, Timer } from "lucide-react";
import { api, useApi, useOnChange, fmtDate, fmtTime, relTime, pct } from "../api";
import { useSid } from "../App";
import { Loading, ErrorBox, ScoreRing, Callout, useToast, Empty } from "../ui";

export const ACTION_ICON: Record<string, any> = { tarjetas: Layers, error: Bug, tema: Target, leer: BookOpen, simulacro: FileCheck2 };

export function useStartAction() {
  const nav = useNavigate();
  const toast = useToast();
  const sid = useSid();
  const [busy, setBusy] = useState(false);
  const start = useCallback(
    async (a: any) => {
      try {
        setBusy(true);
        if (a.kind === "tarjetas") return nav(`/m/${sid}/tarjetas?repasar=1`);
        if (a.kind === "simulacro") return nav(`/m/${sid}/simulacros`);
        if (a.kind === "leer") return nav(`/m/${sid}/tema/${a.topicId}?leer=1`);
        const ex = await api.post(`/api/subjects/${sid}/exercises`, a.kind === "error" ? { errorTag: a.errorTag } : { topicId: a.topicId });
        nav(`/m/${sid}/ejercicio/${ex.id}`);
      } catch (e: any) {
        toast(e.message, "bad");
      } finally {
        setBusy(false);
      }
    },
    [nav, sid, toast],
  );
  return { start, busy };
}

function useCountdown(date?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!date) return null;
  const ms = new Date(date).getTime() - now;
  if (ms <= 0) return { text: "Ya pasó", past: true, days: 0, hours: 0 };
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return { text: days ? `${days} d ${hours} h` : `${hours} h ${mins} min`, past: false, days, hours };
}

export function TodayPage() {
  const sid = useSid();
  const { data, error, loading, reload } = useApi<any>(`/api/subjects/${sid}/dashboard`);
  useOnChange(reload);
  const { start, busy } = useStartAction();
  const cd = useCountdown(data?.exam?.date);
  if (loading && !data) return <div className="content"><Loading lines={4} /></div>;
  if (error) return <div className="content"><ErrorBox error={error} onRetry={reload} /></div>;
  const d = data!;
  const top = d.next[0];
  const TopIcon = top ? ACTION_ICON[top.kind] ?? Target : Target;

  return (
    <div className="content">
      <div className="page-head">
        <div>
          {d.exam ? (
            <>
              <div className="row gap-6 muted small">
                <CalendarClock size={15} /> {fmtDate(d.exam.date)} · {fmtTime(d.exam.date)}
              </div>
              <h1 style={{ marginTop: 6 }}>
                {d.exam.title} de {d.subject.name.replace(/\s*\(demo\)$/, "")}
              </h1>
            </>
          ) : (
            <h1>{d.subject.name}</h1>
          )}
          {d.subject.professor && <p className="sub">{d.subject.professor}</p>}
        </div>
        {cd && (
          <div className="stat" style={{ alignItems: "flex-end" }}>
            <span className="v num" style={{ color: cd.days < 2 && !cd.past ? "var(--bad)" : undefined }}>{cd.text}</span>
            <span className="l">{cd.past ? "" : "para el examen"}</span>
          </div>
        )}
      </div>

      {d.files.review > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Callout kind="bad">
            <div className="row between wrap">
              <span>
                <ShieldAlert size={15} style={{ verticalAlign: -2 }} /> {d.files.review} archivo(s) tienen contenido sospechoso sin revisar. Ese contenido no se usa hasta que decidas.
              </span>
              <Link to={`/m/${sid}/material`} className="btn sm">
                Revisar
              </Link>
            </div>
          </Callout>
        </div>
      )}
      {!d.files.count && (
        <div className="card pad" style={{ marginBottom: 14 }}>
          <Empty icon={<Upload />} title="Cargá el material de la materia">
            PDF, PowerPoint, Word, Excel, fotos de parciales o apuntes.{" "}
            <Link to={`/m/${sid}/material`} className="btn sm primary" style={{ marginLeft: 8 }}>
              Cargar archivos
            </Link>
          </Empty>
        </div>
      )}
      {!d.exam && d.files.count > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Callout kind="info">
            <div className="row between wrap">
              <span>Decime cuándo rendís y qué unidades entran: FORJA arma el plan día por día.</span>
              <Link to={`/m/${sid}/examen`} className="btn sm primary">
                Configurar examen
              </Link>
            </div>
          </Callout>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr)", gap: 14 }} data-grid="hero">
        <div className="card pad col" style={{ gap: 14, borderColor: "color-mix(in srgb, var(--accent) 35%, var(--border))" }}>
          <div className="row between">
            <span className="label" style={{ color: "var(--accent-text)" }}>Qué estudiar ahora</span>
            <Link to={`/m/${sid}/estudiar`} className="btn sm ghost">
              <Timer /> Sesión con tiempo
            </Link>
          </div>
          {top ? (
            <>
              <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
                <div className="step-n" style={{ width: 38, height: 38, borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent-text)" }}>
                  <TopIcon size={19} />
                </div>
                <div className="grow">
                  <h2>{top.title}</h2>
                  <p className="muted small mt-8">{top.detail}</p>
                </div>
              </div>
              <div className="row wrap">
                <button className="btn primary lg" onClick={() => start(top)} disabled={busy}>
                  Empezar <ArrowRight />
                </button>
                <span className="faint small">~{top.minutes} min</span>
              </div>
              {d.next.length > 1 && (
                <div className="col gap-4" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <span className="faint tiny">Después</span>
                  {d.next.slice(1).map((a: any, i: number) => {
                    const I = ACTION_ICON[a.kind] ?? Target;
                    return (
                      <button key={i} className="row small" style={{ border: 0, background: "none", padding: "5px 0", cursor: "pointer", textAlign: "left", color: "var(--text-2)" }} onClick={() => start(a)}>
                        <I size={15} /> <span className="grow">{a.title}</span> <ArrowRight size={14} />
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <p className="muted">Sin tareas pendientes. Agregá temas en el mapa o cargá material.</p>
          )}
        </div>

        <Link to={`/m/${sid}/aprobar`} className="card pad interactive row" style={{ gap: 18 }}>
          <ScoreRing value={d.readiness.score / 100} label={String(d.readiness.score)} size="lg" />
          <div className="col gap-6 grow">
            <span className="label">Readiness</span>
            {d.readiness.factors
              .slice()
              .sort((a: any, b: any) => b.weight * (1 - b.value) - a.weight * (1 - a.value))
              .slice(0, 3)
              .map((f: any) => (
                <div key={f.key} className="small row between">
                  <span className="muted">{f.label}</span>
                  <span className="num">{Math.round(f.value * 100)}%</span>
                </div>
              ))}
            <span className="tiny faint">Ver cómo se calcula →</span>
          </div>
        </Link>
      </div>

      <div className="grid g3 mt-16">
        <Link to={`/m/${sid}/mapa`} className="card pad interactive stat">
          <span className="l">Temas estudiados</span>
          <span className="v">
            {d.coverage.studied}
            <span className="faint" style={{ fontSize: 16 }}>/{d.coverage.total}</span>
          </span>
        </Link>
        <Link to={`/m/${sid}/simulacros`} className="card pad interactive stat">
          <span className="l">Simulacros</span>
          <span className="v">
            {d.mocks.count}
            {d.mocks.avg !== null && <span className="faint" style={{ fontSize: 15, marginLeft: 8 }}>promedio {pct(d.mocks.avg)}</span>}
          </span>
        </Link>
        <Link to={`/m/${sid}/errores`} className="card pad interactive stat">
          <span className="l">Errores recurrentes activos</span>
          <span className="v" style={{ color: d.errors.length ? "var(--bad)" : undefined }}>{d.errors.length}</span>
        </Link>
      </div>

      <div className="grid g2 mt-16">
        <div className="card">
          <div className="card-head">
            <h3>Temas</h3>
            <Link to={`/m/${sid}/mapa`} className="btn sm ghost">
              Mapa <ArrowRight />
            </Link>
          </div>
          <div className="card-body col gap-16">
            <TopicGroup title="Débiles" items={d.weak} tone="debil" sid={sid} empty="Ninguno por ahora." />
            <TopicGroup title="Fuertes" items={d.strong} tone="fuerte" sid={sid} empty="Todavía ninguno: hace falta práctica sostenida." />
            {d.unstudied.length > 0 && <TopicGroup title="Sin estudiar" items={d.unstudied} tone="sin_estudiar" sid={sid} />}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Errores recurrentes</h3>
            <Link to={`/m/${sid}/errores`} className="btn sm ghost">
              Todos <ArrowRight />
            </Link>
          </div>
          <div className="list" style={{ paddingTop: 6 }}>
            {d.errors.length ? (
              d.errors.map((e: any) => (
                <div key={e.tag} className="list-item">
                  <Bug size={15} style={{ color: "var(--bad)", flex: "none" }} />
                  <div className="grow">
                    <div className="small" style={{ fontWeight: 540 }}>{e.label}</div>
                    <div className="tiny faint">
                      {e.count} {e.count === 1 ? "vez" : "veces"} · última {relTime(e.lastSeen)}
                    </div>
                  </div>
                  <button className="btn sm" onClick={() => start({ kind: "error", errorTag: e.tag })}>
                    Practicar
                  </button>
                </div>
              ))
            ) : (
              <div className="card-body muted small">Sin errores conceptuales activos.</div>
            )}
          </div>
        </div>
      </div>
      <div className="row wrap mt-16">
        <Link to={`/m/${sid}/practicar`} className="btn">
          <Dumbbell /> Practicar un tema
        </Link>
        <Link to={`/m/${sid}/simulacros`} className="btn">
          <FileCheck2 /> Simulacro
        </Link>
        <Link to={`/m/${sid}/examen`} className="btn">
          <CalendarClock /> Plan hasta el examen
        </Link>
      </div>
      <style>{`@media (max-width: 860px){[data-grid="hero"]{grid-template-columns:1fr !important}}`}</style>
    </div>
  );
}

function TopicGroup({ title, items, tone, sid, empty }: { title: string; items: any[]; tone: string; sid: number; empty?: string }) {
  return (
    <div className="col gap-6">
      <span className="label">{title}</span>
      {items.length ? (
        <div className="chips">
          {items.map((t) => (
            <Link key={t.id} to={`/m/${sid}/tema/${t.id}`} className={`badge st-badge st-${tone}`} style={{ height: 26, padding: "0 10px" }}>
              <span className="dot st-dot" /> {t.name}
              {t.effective !== undefined && <span className="num" style={{ opacity: 0.8 }}>{Math.round(t.effective * 100)}%</span>}
            </Link>
          ))}
        </div>
      ) : (
        <span className="small faint">{empty}</span>
      )}
    </div>
  );
}
