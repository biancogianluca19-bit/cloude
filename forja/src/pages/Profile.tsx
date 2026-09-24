import React, { useState } from "react";
import { GraduationCap, BookMarked, RefreshCw, Sparkles, ChevronDown, ChevronRight } from "lucide-react";
import { api, useApi, relTime } from "../api";
import { useSid } from "../App";
import { Loading, ErrorBox, Callout, SourceCard, useToast, Spinner } from "../ui";

const SECTIONS: [string, string, string][] = [
  ["examStyle", "Estilo de parciales", "Cantidad de ejercicios, duración, reparto teoría/práctica y temas que toma."],
  ["recurring", "Preguntas y ejercicios recurrentes", "Lo que aparece en más de un parcial."],
  ["grading", "Criterios de corrección", "Tomados de parciales corregidos y comentarios del corrector."],
  ["terminology", "Terminología que usa", "Qué palabras elige cuando hay sinónimos."],
  ["formulas", "Fórmulas tal como las escribe", "Líneas con fórmulas en su material."],
  ["excelFormulas", "Fórmulas de Excel de la cátedra", "Celdas con fórmula en sus planillas."],
  ["methods", "Métodos y procedimientos", "Métodos preferidos y pasos de sus resoluciones."],
  ["detail", "Nivel de detalle que pide", "Consignas sobre justificar, mostrar cálculos, redondear."],
  ["ai", "Observaciones del análisis con IA", "Solo las que citan textualmente un fragmento real."],
];

export function ProfilePage() {
  const sid = useSid();
  const toast = useToast();
  const { data: p, error, loading, reload, setData } = useApi<any>(`/api/subjects/${sid}/profile`);
  const status = useApi<any>("/api/status");
  const topics = useApi<any>(`/api/subjects/${sid}/topics`);
  const lib = useApi<any[]>("/api/library");
  const [busy, setBusy] = useState(false);
  if (loading && !p) return <div className="content"><Loading /></div>;
  if (error) return <div className="content"><ErrorBox error={error} onRetry={reload} /></div>;

  const rebuild = async () => {
    setBusy(true);
    try {
      setData(await api.post(`/api/subjects/${sid}/profile/rebuild`));
      toast("Perfil recalculado");
    } finally {
      setBusy(false);
    }
  };
  const enrich = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/api/subjects/${sid}/profile/ai`);
      setData(r.profile);
      toast(`${r.added} observación(es) con evidencia · ${r.discarded} descartada(s) por no poder verificarse`);
    } catch (e: any) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const general = (topics.data?.topics ?? []).filter((t: any) => t.library_key);

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Perfil del profesor</h1>
          <p className="sub">Cómo enseña, resuelve y evalúa, según su material. Cada observación muestra de qué archivo sale. Sin evidencia, no hay observación.</p>
        </div>
        <div className="row">
          {busy && <Spinner />}
          <button className="btn" onClick={rebuild} disabled={busy}>
            <RefreshCw /> Recalcular
          </button>
          <button className="btn primary" onClick={enrich} disabled={busy || !status.data?.ai} title={status.data?.ai ? "" : "Necesita API key"}>
            <Sparkles /> Analizar con IA
          </button>
        </div>
      </div>

      <div className="row wrap gap-6 small muted" style={{ marginBottom: 14 }}>
        Basado en {p.sourceFiles.length} archivo(s) de la cátedra: {p.sourceFiles.map((f: any) => f.name).join(" · ") || "ninguno"}. Actualizado {relTime(p.generatedAt)}.
      </div>
      {p.gaps.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Callout kind="warn">
            <strong>Lo que todavía no se puede saber:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {p.gaps.map((g: string) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </Callout>
        </div>
      )}

      {p.structure && (
        <div className="grid g3" style={{ marginBottom: 16 }}>
          <div className="card pad stat">
            <span className="l">Duración típica</span>
            <span className="v">{p.structure.durationMin ? `${p.structure.durationMin} min` : "—"}</span>
          </div>
          <div className="card pad stat">
            <span className="l">Ejercicios por parcial</span>
            <span className="v">
              {p.structure.practice} <span className="faint" style={{ fontSize: 15 }}>prácticos</span> + {p.structure.theory} <span className="faint" style={{ fontSize: 15 }}>teóricos</span>
            </span>
          </div>
          <div className="card pad stat">
            <span className="l">Peso de la teoría</span>
            <span className="v">{Math.round(p.structure.theoryShare * 100)}%</span>
          </div>
        </div>
      )}
      {p.gradingWeights && (
        <div style={{ marginBottom: 16 }}>
          <Callout kind="ok">
            <strong>Criterio de corrección que usa FORJA para esta materia:</strong> {p.gradingWeights.source}
          </Callout>
        </div>
      )}

      <div className="row gap-6 mb-8 mt-24">
        <GraduationCap size={18} />
        <h2>Método observado del profesor</h2>
      </div>
      <div className="col">
        {SECTIONS.map(([key, title, desc]) => (
          <Section key={key} title={title} desc={desc} items={p[key] ?? []} sid={sid} />
        ))}
        {p.exams?.length > 0 && (
          <div className="card">
            <div className="card-head">
              <h3>Parciales analizados</h3>
            </div>
            <div className="card-body col">
              {p.exams.map((e: any) => (
                <div key={e.fileId} className="source" style={{ flexDirection: "column", gap: 6 }}>
                  <div className="row between wrap">
                    <span className="src-file">{e.file}</span>
                    <span className="faint small">
                      {e.items.length} ítems{e.durationMin ? ` · ${e.durationMin} min` : ""}
                    </span>
                  </div>
                  <div className="chips">
                    {e.items.map((i: any, k: number) => (
                      <span key={k} className={`badge ${i.type === "teoria" ? "info" : ""}`}>
                        {i.n} · {i.type === "teoria" ? "teoría" : "práctica"}
                        {i.points ? ` · ${i.points} pts` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="row gap-6 mb-8 mt-24">
        <BookMarked size={18} />
        <h2>Conocimiento académico general</h2>
      </div>
      <p className="muted small" style={{ marginBottom: 10 }}>
        Temas de la biblioteca de FORJA vinculados a esta materia. Es conocimiento estándar de Administración, <strong>no atribuido al profesor</strong>. Los ejercicios lo indican con la etiqueta «Método general» cuando no hay evidencia del método del profesor.
      </p>
      <div className="grid g-auto">
        {general.map((t: any) => {
          const l = lib.data?.find((x) => x.key === t.library_key);
          return (
            <div key={t.id} className="card pad col gap-6">
              <div className="row between">
                <h3>{t.name}</h3>
                <span className="badge">general</span>
              </div>
              <p className="small muted">{l?.description}</p>
              <span className="tiny faint">{t.templates} plantilla(s) de ejercicios</span>
            </div>
          );
        })}
        {!general.length && <p className="muted small">Ningún tema vinculado a la biblioteca.</p>}
      </div>
    </div>
  );
}

function Section({ title, desc, items, sid }: { title: string; desc: string; items: any[]; sid: number }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length) return null;
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          <p className="tiny faint">{desc}</p>
        </div>
        <span className="badge">{items.length}</span>
      </div>
      <div className="list" style={{ paddingTop: 8 }}>
        {items.map((o, i) => (
          <div key={i}>
            <button className="list-item" onClick={() => setOpen(open === i ? null : i)} style={{ alignItems: "flex-start" }}>
              {open === i ? <ChevronDown size={15} style={{ marginTop: 3, flex: "none" }} /> : <ChevronRight size={15} style={{ marginTop: 3, flex: "none" }} />}
              <span className="grow small" style={{ fontFamily: /formul/i.test(title) ? "var(--mono)" : undefined }}>
                {o.text}
              </span>
              <span className="tiny faint" style={{ whiteSpace: "nowrap" }}>
                {o.origin === "ia" && <span className="badge accent" style={{ marginRight: 6 }}>IA</span>}
                {o.evidence.length} fuente(s)
              </span>
            </button>
            {open === i && (
              <div className="col" style={{ padding: "0 18px 14px 44px" }}>
                {o.evidence.map((e: any, k: number) => (
                  <SourceCard key={k} s={e} subjectId={sid} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
