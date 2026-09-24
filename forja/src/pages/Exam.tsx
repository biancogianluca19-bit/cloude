import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, TrendingUp, TrendingDown, Layers, FileCheck2, Target, RotateCcw } from "lucide-react";
import { api, useApi, useOnChange, emitChange, fmtDate, fmtTime } from "../api";
import { useSid } from "../App";
import { Loading, useToast, StatusBadge, Callout } from "../ui";

const BLOCK_ICON: Record<string, any> = { tema: Target, simulacro: FileCheck2, repaso: RotateCcw, tarjetas: Layers };

export function ExamPage() {
  const sid = useSid();
  const toast = useToast();
  const exam = useApi<any>(`/api/subjects/${sid}/exam`);
  const topics = useApi<any>(`/api/subjects/${sid}/topics`);
  useOnChange(exam.reload);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ title: "Primer parcial", date: "", time: "08:00", minutes: 90, topicIds: [] as number[] });

  useEffect(() => {
    const e = exam.data?.exam;
    if (e) {
      const [d, t] = e.date.split("T");
      setF({ title: e.title, date: d, time: (t ?? "08:00").slice(0, 5), minutes: e.daily_minutes, topicIds: e.topic_ids ?? [] });
    } else if (exam.data && !e) setEdit(true);
  }, [exam.data]);

  const units = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const t of topics.data?.topics ?? []) m.set(t.unit || "Sin unidad", [...(m.get(t.unit || "Sin unidad") ?? []), t]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "es", { numeric: true }));
  }, [topics.data]);

  if (exam.loading && !exam.data) return <div className="content"><Loading /></div>;
  const plan = exam.data?.plan;

  const save = async () => {
    if (!f.date) return toast("Elegí la fecha del examen", "bad");
    try {
      await api.put(`/api/subjects/${sid}/exam`, { title: f.title, date: `${f.date}T${f.time}`, topicIds: f.topicIds, dailyMinutes: f.minutes });
      toast("Examen guardado: plan actualizado");
      setEdit(false);
      exam.reload();
      emitChange();
    } catch (e: any) {
      toast(e.message, "bad");
    }
  };
  const toggleTopic = (id: number) => setF((x) => ({ ...x, topicIds: x.topicIds.includes(id) ? x.topicIds.filter((y) => y !== id) : [...x.topicIds, id] }));
  const toggleUnit = (ts: any[]) => {
    const ids = ts.map((t) => t.id);
    const all = ids.every((i) => f.topicIds.includes(i));
    setF((x) => ({ ...x, topicIds: all ? x.topicIds.filter((i) => !ids.includes(i)) : [...new Set([...x.topicIds, ...ids])] }));
  };

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Examen y plan</h1>
          <p className="sub">El plan se recalcula cada vez que practicás: los temas que dominás reciben menos tiempo y los que fallás, más.</p>
        </div>
        {!edit && exam.data?.exam && (
          <button className="btn" onClick={() => setEdit(true)}>
            <CalendarClock /> Cambiar examen
          </button>
        )}
      </div>

      {edit && (
        <div className="card pad col gap-16" style={{ marginBottom: 20 }}>
          <h2>¿Cuándo rendís?</h2>
          <div className="grid g3">
            <div className="field">
              <label>Nombre</label>
              <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </div>
            <div className="field">
              <label>Fecha</label>
              <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            </div>
            <div className="field">
              <label>Hora</label>
              <input className="input" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Minutos por día que podés estudiar esta materia</label>
            <input className="input num" type="number" min={15} max={600} step={15} style={{ width: 120 }} value={f.minutes} onChange={(e) => setF({ ...f, minutes: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>¿Qué entra? {f.topicIds.length ? `(${f.topicIds.length} temas)` : "(si no marcás nada, entran todos)"}</label>
            {!units.length && <span className="muted small">No hay temas todavía. Cargá material o agregalos en el mapa.</span>}
            <div className="col gap-6">
              {units.map(([u, ts]) => (
                <div key={u} className="row wrap gap-6" style={{ alignItems: "flex-start" }}>
                  <button className={`btn sm ${ts.every((t: any) => f.topicIds.includes(t.id)) ? "primary" : ""}`} style={{ minWidth: 96 }} onClick={() => toggleUnit(ts)}>
                    {u}
                  </button>
                  <div className="chips grow">
                    {ts.map((t: any) => (
                      <button key={t.id} className="chip" style={f.topicIds.includes(t.id) ? { borderColor: "var(--accent)", color: "var(--accent-text)", background: "var(--accent-soft)" } : undefined} onClick={() => toggleTopic(t.id)}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="row">
            <button className="btn primary" onClick={save}>
              Guardar y armar plan
            </button>
            {exam.data?.exam && (
              <button className="btn ghost" onClick={() => setEdit(false)}>
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {plan && (
        <>
          <div className="grid g3" style={{ marginBottom: 16 }}>
            <div className="card pad stat">
              <span className="l">{plan.exam.title}</span>
              <span className="v" style={{ fontSize: 19 }}>
                {fmtDate(plan.exam.date, { weekday: "long", day: "numeric", month: "long" })} · {fmtTime(plan.exam.date)}
              </span>
            </div>
            <div className="card pad stat">
              <span className="l">Tiempo que queda</span>
              <span className="v">{plan.daysLeft >= 1 ? `${Math.floor(plan.daysLeft)} días ${Math.floor((plan.daysLeft % 1) * 24)} h` : `${Math.floor(plan.hoursLeft)} h`}</span>
            </div>
            <div className="card pad stat">
              <span className="l">Tiempo de estudio planificado</span>
              <span className="v">{Math.round(plan.totalMinutes / 60)} h</span>
            </div>
          </div>

          {plan.changes.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-head">
                <h3>Cambios desde tu última práctica</h3>
              </div>
              <div className="list" style={{ paddingTop: 6 }}>
                {plan.changes.map((c: any, i: number) => (
                  <div key={i} className="list-item small">
                    {c.direction === "sube" ? <TrendingUp size={16} color="var(--bad)" /> : <TrendingDown size={16} color="var(--ok)" />}
                    <strong>{c.topic}</strong>
                    <span className="muted grow">{c.why}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 14 }} data-grid="plan">
            <div className="col">
              <h2>Día por día</h2>
              {plan.days.map((d: any, i: number) => (
                <div key={d.date} className="card" style={i === 0 ? { borderColor: "color-mix(in srgb, var(--accent) 40%, var(--border))" } : undefined}>
                  <div className="card-head">
                    <h3 style={{ textTransform: "capitalize" }}>{d.label}</h3>
                    <span className="faint small num">{d.minutes} min</span>
                  </div>
                  <div className="card-body col gap-6">
                    {d.blocks.map((b: any, k: number) => {
                      const I = BLOCK_ICON[b.kind] ?? Target;
                      const inner = (
                        <>
                          <I size={16} style={{ color: "var(--text-3)", flex: "none", marginTop: 2 }} />
                          <div className="grow">
                            <div className="small" style={{ fontWeight: 560 }}>{b.title}</div>
                            <div className="tiny faint">{b.why}</div>
                          </div>
                          <span className="tiny num faint">{b.minutes}′</span>
                        </>
                      );
                      return b.topicId ? (
                        <Link key={k} to={`/m/${sid}/tema/${b.topicId}`} className="row" style={{ alignItems: "flex-start" }}>
                          {inner}
                        </Link>
                      ) : (
                        <div key={k} className="row" style={{ alignItems: "flex-start" }}>
                          {inner}
                        </div>
                      );
                    })}
                    {!d.blocks.length && <span className="small faint">Día libre.</span>}
                  </div>
                </div>
              ))}
              {!plan.days.length && <Callout kind="info">El examen es hoy. Hacé un repaso liviano de tus errores recurrentes y de las tarjetas.</Callout>}
            </div>
            <div className="col">
              <h2>Prioridad de cada tema</h2>
              <div className="card list">
                {plan.priorities.map((p: any) => (
                  <Link key={p.topicId} to={`/m/${sid}/tema/${p.topicId}`} className="list-item" style={{ alignItems: "flex-start" }}>
                    <div className="grow">
                      <div className="row between gap-6">
                        <span className="small" style={{ fontWeight: 560 }}>{p.name}</span>
                        <StatusBadge status={p.status} />
                      </div>
                      <div className="tiny faint mt-8">{p.reasons.join(" · ")}</div>
                    </div>
                  </Link>
                ))}
              </div>
              <p className="tiny faint">Prioridad = importancia del tema en los parciales × (1 − dominio), más un extra por errores recurrentes, por no haberlo practicado o por olvido.</p>
            </div>
          </div>
          <style>{`@media (max-width: 860px){[data-grid="plan"]{grid-template-columns:1fr !important}}`}</style>
        </>
      )}
    </div>
  );
}
