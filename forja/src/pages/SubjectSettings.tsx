import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, useApi } from "../api";
import { useSid } from "../App";
import { Loading, useToast } from "../ui";

export function SubjectSettingsPage() {
  const sid = useSid();
  const nav = useNavigate();
  const toast = useToast();
  const { data, reload } = useApi<any>(`/api/subjects/${sid}`);
  const [f, setF] = useState<any>(null);
  useEffect(() => {
    if (data) setF({ name: data.name, professor: data.professor, description: data.description, pass: Math.round((data.pass_threshold ?? 0.6) * 100) });
  }, [data]);
  if (!f) return <div className="content"><Loading /></div>;
  const save = async () => {
    try {
      await api.patch(`/api/subjects/${sid}`, { name: f.name, professor: f.professor, description: f.description, passThreshold: f.pass / 100 });
      toast("Materia actualizada");
      reload();
    } catch (e: any) {
      toast(e.message, "bad");
    }
  };
  const remove = async () => {
    if (!confirm(`¿Borrar «${data.name}» con todo su material y progreso? No se puede deshacer.`)) return;
    await api.del(`/api/subjects/${sid}`);
    nav("/");
  };
  return (
    <div className="content narrow">
      <div className="page-head">
        <h1>Datos de la materia</h1>
      </div>
      <div className="card pad col gap-16">
        {(["name", "professor", "description"] as const).map((k) => (
          <div className="field" key={k}>
            <label>{{ name: "Nombre", professor: "Profesor/a", description: "Descripción" }[k]}</label>
            <input className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </div>
        ))}
        <div className="field">
          <label>Nota para aprobar (%)</label>
          <input className="input num" type="number" min={1} max={100} style={{ width: 110 }} value={f.pass} onChange={(e) => setF({ ...f, pass: Number(e.target.value) })} />
        </div>
        <div className="row">
          <button className="btn primary" onClick={save}>
            Guardar
          </button>
        </div>
      </div>
      <div className="card pad mt-16 row between">
        <div>
          <h3>Borrar materia</h3>
          <p className="muted small">Elimina archivos, ejercicios, resultados y tarjetas de esta materia.</p>
        </div>
        <button className="btn danger" onClick={remove}>
          Borrar
        </button>
      </div>
    </div>
  );
}
