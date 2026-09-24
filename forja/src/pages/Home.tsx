import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, BookOpen, CalendarClock, FolderOpen } from "lucide-react";
import { api, useApi, fmtDate } from "../api";
import { Modal, Loading, ErrorBox, Callout, useToast, Empty } from "../ui";

export function HomePage() {
  const { data, error, loading, reload } = useApi<any[]>("/api/subjects");
  const status = useApi<any>("/api/status");
  const [open, setOpen] = useState(false);
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Tus materias</h1>
          <p className="sub">Cada materia tiene su propio material, su perfil de profesor y tu progreso. Nada se mezcla entre materias.</p>
        </div>
        <button className="btn primary" onClick={() => setOpen(true)}>
          <Plus /> Nueva materia
        </button>
      </div>
      {status.data && !status.data.ai && (
        <div className="mb-8" style={{ marginBottom: 18 }}>
          <Callout kind="warn">
            FORJA está en <strong>modo demo</strong>: todo funciona (carga de archivos, perfil, ejercicios, corrección, plan, simulacros), pero el tutor responde con frases del material y no lee escritura a mano.{" "}
            <Link to="/ajustes" style={{ textDecoration: "underline" }}>
              Configurar API key
            </Link>
          </Callout>
        </div>
      )}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : !data?.length ? (
        <div className="card">
          <Empty icon={<BookOpen />} title="Todavía no hay materias">
            Creá una materia y cargá su material para empezar.
          </Empty>
        </div>
      ) : (
        <div className="grid g-auto">
          {data.map((s) => (
            <Link key={s.id} to={`/m/${s.id}`} className="card pad interactive col" style={{ gap: 12 }}>
              <div className="row between">
                <div className="grow">
                  <h2 style={{ fontSize: 16.5 }}>{s.name}</h2>
                  <div className="muted small">{s.professor || "Sin profesor cargado"}</div>
                </div>
                <div className="stat" style={{ alignItems: "flex-end" }}>
                  <span className="v" style={{ fontSize: 22 }}>{s.readiness}</span>
                  <span className="l">readiness</span>
                </div>
              </div>
              <div className="row wrap gap-6">
                {s.exam ? (
                  <span className="badge accent">
                    <CalendarClock /> {s.exam.title} · {fmtDate(s.exam.date, { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                ) : (
                  <span className="badge">Sin fecha de examen</span>
                )}
                <span className="badge">
                  <FolderOpen /> {s.files} archivo(s)
                </span>
                {s.is_demo ? <span className="badge info">Demo</span> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
      <NewSubject open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function NewSubject({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState({ name: "", professor: "", description: "", pass: 60 });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await api.post("/api/subjects", { name: f.name, professor: f.professor, description: f.description, passThreshold: f.pass / 100 });
      onClose();
      nav(`/m/${s.id}/material?nueva=1`);
    } catch (err: any) {
      toast(err.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Nueva materia">
      <form className="col gap-16" onSubmit={submit}>
        <div className="field">
          <label htmlFor="n">Nombre</label>
          <input id="n" className="input" autoFocus required placeholder="Sistemas de Costos" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="p">Profesor/a</label>
          <input id="p" className="input" placeholder="Nombre de quien corrige" value={f.professor} onChange={(e) => setF({ ...f, professor: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="d">Descripción (opcional)</label>
          <input id="d" className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="t">Nota para aprobar (% del puntaje)</label>
          <input id="t" className="input num" type="number" min={1} max={100} value={f.pass} onChange={(e) => setF({ ...f, pass: Number(e.target.value) })} style={{ width: 110 }} />
          <span className="hint-text">Se usa como referencia en «¿Estoy para aprobar?». En muchas facultades un 4 equivale al 60%.</span>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy || !f.name.trim()}>
            Crear y cargar material
          </button>
        </div>
      </form>
    </Modal>
  );
}
