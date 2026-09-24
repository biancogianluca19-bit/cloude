import React from "react";
import { Link } from "react-router-dom";
import { useApi, useOnChange, pct, fmtDate } from "../api";
import { useSid } from "../App";
import { Loading, ErrorBox, ScoreRing, Bar, toneFor, Callout } from "../ui";

function EvolutionChart({ points, threshold }: { points: { date: string; avg: number; n: number }[]; threshold: number }) {
  if (points.length < 2) return <p className="muted small">Hacen falta al menos dos días de práctica para ver la evolución.</p>;
  const W = 640;
  const H = 180;
  const P = { l: 34, r: 12, t: 12, b: 26 };
  const x = (i: number) => P.l + (i / (points.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - v) * (H - P.t - P.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.avg).toFixed(1)}`).join(" ");
  const area = `${d} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Evolución del puntaje promedio por día">
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="var(--border)" />
          <text x={P.l - 6} y={y(v) + 4} fontSize="10" textAnchor="end" fill="var(--text-3)">
            {v * 100}%
          </text>
        </g>
      ))}
      <line x1={P.l} x2={W - P.r} y1={y(threshold)} y2={y(threshold)} stroke="var(--warn)" strokeDasharray="4 4" />
      <text x={W - P.r} y={y(threshold) - 5} fontSize="10" textAnchor="end" fill="var(--warn)">
        para aprobar {Math.round(threshold * 100)}%
      </text>
      <path d={area} fill="var(--accent)" opacity="0.08" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={p.date}>
          <circle cx={x(i)} cy={y(p.avg)} r="3.5" fill="var(--bg-elev)" stroke="var(--accent)" strokeWidth="2">
            <title>
              {p.date}: {Math.round(p.avg * 100)}% en {p.n} ejercicio(s)
            </title>
          </circle>
          {(i === 0 || i === points.length - 1 || points.length < 8) && (
            <text x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="var(--text-3)">
              {p.date.slice(5).split("-").reverse().join("/")}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function VerdictPage() {
  const sid = useSid();
  const v = useApi<any>(`/api/subjects/${sid}/verdict`);
  const r = useApi<any>(`/api/subjects/${sid}/readiness`);
  useOnChange(() => {
    v.reload();
    r.reload();
  });
  if ((v.loading && !v.data) || (r.loading && !r.data)) return <div className="content"><Loading lines={5} /></div>;
  if (v.error || r.error) return <div className="content"><ErrorBox error={v.error ?? r.error!} /></div>;
  const d = v.data;
  const rd = r.data;
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>¿Estoy para aprobar?</h1>
          <p className="sub">Solo tus resultados. Sin promesas.</p>
        </div>
      </div>
      <div className="grid g2">
        <div className="card pad col gap-16">
          <div className="row gap-24">
            <ScoreRing value={rd.score / 100} size="lg" label={String(rd.score)} />
            <div className="col gap-6">
              <h2>Readiness {rd.score}/100</h2>
              <p className="small muted">{rd.caveat}</p>
            </div>
          </div>
          <div className="tiny mono faint">{rd.formula}</div>
          <div>
            {rd.factors.map((f: any) => (
              <div key={f.key} className="factor">
                <div className="col gap-4">
                  <div className="row between small">
                    <span style={{ fontWeight: 560 }}>
                      {f.label} <span className="faint tiny">· peso {Math.round(f.weight * 100)}%</span>
                    </span>
                    <span className="num">{pct(f.value)}</span>
                  </div>
                  <Bar value={f.value} tone={toneFor(f.value)} />
                  <span className="tiny faint">{f.detail}</span>
                </div>
                <div className="col" style={{ alignItems: "flex-end", justifyContent: "center", gap: 0 }}>
                  <span className="num" style={{ fontWeight: 650 }}>+{f.contribution}</span>
                  <span className="tiny faint">puntos</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="col gap-16">
          <div className="card pad col gap-6">
            <h3>Lo que dicen tus datos</h3>
            <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              {d.statements.map((s: string, i: number) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
          <div className="grid g2">
            <div className="card pad stat">
              <span className="l">Últimos 3 simulacros</span>
              <span className="v">{d.avgLast3 === null ? "—" : pct(d.avgLast3)}</span>
            </div>
            <div className="card pad stat">
              <span className="l">Ejercicios bien (14 días)</span>
              <span className="v">{d.correctPct === null ? "—" : pct(d.correctPct)}</span>
              <span className="tiny faint">{d.recentCount} ejercicio(s)</span>
            </div>
          </div>
          <Callout kind="info">
            {d.disclaimer}
          </Callout>
        </div>
      </div>
      <div className="card pad mt-16">
        <h3 className="mb-8">Evolución</h3>
        <EvolutionChart points={d.evolution} threshold={d.threshold} />
      </div>
      <div className="grid g3 mt-16">
        <div className="card pad col gap-6">
          <h3>Simulacros</h3>
          {d.mocks.length ? (
            d.mocks
              .slice()
              .reverse()
              .map((m: any) => (
                <Link key={m.id} to={`/m/${sid}/simulacro/${m.id}`} className="row between small">
                  <span>
                    {m.title} <span className="faint">· {fmtDate(m.submitted_at, { day: "numeric", month: "short" })}</span>
                  </span>
                  <span className={`badge ${toneFor(m.score) ?? ""}`}>{pct(m.score)}</span>
                </Link>
              ))
          ) : (
            <span className="small muted">Ninguno todavía.</span>
          )}
        </div>
        <div className="card pad col gap-6">
          <h3>Temas débiles</h3>
          {d.weak.length ? d.weak.map((t: any) => <Link key={t.id} to={`/m/${sid}/tema/${t.id}`} className="small">{t.name} <span className="faint">· {pct(t.effective)}</span></Link>) : <span className="small muted">Ninguno.</span>}
        </div>
        <div className="card pad col gap-6">
          <h3>Sin practicar</h3>
          {d.unpracticed.length ? d.unpracticed.map((t: any) => <Link key={t.id} to={`/m/${sid}/tema/${t.id}`} className="small">{t.name}</Link>) : <span className="small muted">Practicaste todos los temas del examen.</span>}
        </div>
      </div>
    </div>
  );
}
