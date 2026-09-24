import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bug, CheckCircle2, Dumbbell } from "lucide-react";
import { api, useApi, useOnChange, relTime } from "../api";
import { useSid } from "../App";
import { Loading, ErrorBox, Empty, useToast } from "../ui";

export function ErrorsPage() {
  const sid = useSid();
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<any[]>(`/api/subjects/${sid}/errors`);
  useOnChange(reload);
  const [busy, setBusy] = useState(false);
  if (loading && !data) return <div className="content"><Loading /></div>;
  if (error) return <div className="content"><ErrorBox error={error} onRetry={reload} /></div>;
  const active = data!.filter((e) => e.active);
  const solved = data!.filter((e) => !e.active);
  const practice = async (tag: string) => {
    setBusy(true);
    try {
      const ex = await api.post(`/api/subjects/${sid}/exercises`, { errorTag: tag });
      nav(`/m/${sid}/ejercicio/${ex.id}`);
    } catch (e: any) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const Row = ({ e }: { e: any }) => (
    <div className="card pad col gap-6">
      <div className="row between wrap gap-6">
        <div className="row gap-6">
          {e.active ? <Bug size={17} color="var(--bad)" /> : <CheckCircle2 size={17} color="var(--ok)" />}
          <h3>{e.label}</h3>
        </div>
        {e.active && (
          <button className="btn sm primary" disabled={busy} onClick={() => practice(e.tag)}>
            <Dumbbell /> Ejercicio con esta trampa
          </button>
        )}
      </div>
      <div className="row wrap gap-6 small">
        <span className="badge bad">
          Detectado {e.count} {e.count === 1 ? "vez" : "veces"}
        </span>
        <span className="badge">Última aparición: {relTime(e.lastSeen)}</span>
        {e.passesSinceLast > 0 && <span className="badge ok">Superado {e.passesSinceLast} vez/veces después</span>}
        {e.topics.map((t: any) => (
          <Link key={t.id} to={`/m/${sid}/tema/${t.id}`} className="badge">
            {t.name}
          </Link>
        ))}
      </div>
      {e.details.length > 0 && (
        <ul className="small muted" style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          {e.details.map((d: string, i: number) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <h1>Memoria de errores</h1>
          <p className="sub">Errores conceptuales detectados en tus correcciones. Un error deja de estar activo cuando evitás esa misma trampa dos veces seguidas. FORJA los usa para armarte ejercicios y tarjetas.</p>
        </div>
      </div>
      {!data!.length ? (
        <div className="card">
          <Empty icon={<Bug />} title="Sin errores registrados">
            Aparecen cuando una corrección detecta un error conceptual (no solo un número mal).
          </Empty>
        </div>
      ) : (
        <div className="col gap-16">
          {active.length > 0 && <h2>Activos ({active.length})</h2>}
          {active.map((e) => (
            <Row key={e.tag} e={e} />
          ))}
          {solved.length > 0 && <h2 className="mt-16">Superados ({solved.length})</h2>}
          {solved.map((e) => (
            <Row key={e.tag} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}
