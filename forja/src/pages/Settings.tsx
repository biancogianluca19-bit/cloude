import React, { useState } from "react";
import { KeyRound, PlugZap } from "lucide-react";
import { api, useApi } from "../api";
import { Callout, useToast, Spinner } from "../ui";
import { useTheme } from "../App";

export function SettingsPage() {
  const status = useApi<any>("/api/status");
  const toast = useToast();
  const { theme, toggle } = useTheme();
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);

  const save = async (body: any) => {
    setBusy(true);
    try {
      await api.put("/api/settings", body);
      await status.reload();
      setKey("");
      toast("Guardado");
    } catch (e: any) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const runTest = async () => {
    setBusy(true);
    setTest(null);
    try {
      setTest(await api.post("/api/settings/test"));
    } catch (e: any) {
      setTest({ ok: false, message: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="content narrow">
      <div className="page-head">
        <div>
          <h1>Ajustes</h1>
          <p className="sub">Conexión con el modelo de lenguaje y preferencias.</p>
        </div>
      </div>
      <div className="card pad col gap-16">
        <div className="row gap-6">
          <KeyRound size={18} />
          <h2>Modelo de lenguaje (Claude)</h2>
          {status.data && <span className={`badge ${status.data.ai ? "ok" : "warn"}`}>{status.data.ai ? "Conectado" : "Modo demo"}</span>}
        </div>
        <p className="muted small">
          Con una API key de Anthropic, FORJA explica con sus palabras, genera ejercicios nuevos desde tu material, lee fotos de hojas manuscritas y corrige respuestas abiertas. Sin clave, todo lo demás funciona igual: la corrección numérica, el plan y el readiness no dependen de la IA.
        </p>
        {status.data?.keySource === "entorno" ? (
          <Callout kind="info">La clave viene de la variable de entorno ANTHROPIC_API_KEY del servidor.</Callout>
        ) : (
          <div className="field">
            <label htmlFor="k">API key {status.data?.keySource === "ajustes" && <span className="faint">(hay una guardada)</span>}</label>
            <div className="row">
              <input id="k" className="input" type="password" autoComplete="off" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
              <button className="btn primary" disabled={busy || !key.trim()} onClick={() => save({ apiKey: key })}>
                Guardar
              </button>
            </div>
            <span className="hint-text">
              {status.data?.storage === "blob"
                ? "Se guarda en la base de FORJA, dentro de tu almacenamiento privado de Vercel. Solo se usa para hablar con Anthropic."
                : "Se guarda en la base de datos local de FORJA, en tu computadora. No se envía a ningún otro servicio."}
            </span>
            {status.data?.keySource === "ajustes" && (
              <button className="btn sm danger" style={{ alignSelf: "flex-start" }} onClick={() => save({ apiKey: "" })}>
                Borrar la clave guardada
              </button>
            )}
          </div>
        )}
        <div className="field">
          <label htmlFor="m">Modelo</label>
          <div className="row">
            <input id="m" className="input" placeholder={status.data?.model ?? "claude-opus-5"} value={model} onChange={(e) => setModel(e.target.value)} />
            <button className="btn" disabled={busy || !model.trim()} onClick={() => save({ model })}>
              Cambiar
            </button>
          </div>
          <span className="hint-text">Actual: {status.data?.model}. Si no sabés, dejalo como está.</span>
        </div>
        <div className="row">
          <button className="btn" onClick={runTest} disabled={busy || !status.data?.ai}>
            <PlugZap /> Probar conexión
          </button>
          {busy && <Spinner />}
        </div>
        {test && <Callout kind={test.ok ? "ok" : "bad"}>{test.message}</Callout>}
      </div>
      <div className="card pad mt-16 row between">
        <div>
          <h3>Tema</h3>
          <p className="muted small">Actual: {theme === "dark" ? "oscuro" : "claro"}.</p>
        </div>
        <button className="btn" onClick={toggle}>
          Cambiar a {theme === "dark" ? "claro" : "oscuro"}
        </button>
      </div>
      {status.data?.storage === "blob" && <CloudUsage />}
      {status.data?.auth && (
        <div className="card pad mt-16 row between">
          <div>
            <h3>Sesión</h3>
            <p className="muted small">La sesión dura 60 días en este dispositivo.</p>
          </div>
          <button
            className="btn"
            onClick={async () => {
              await api.post("/api/logout");
              window.location.reload();
            }}
          >
            Cerrar sesión
          </button>
        </div>
      )}
      <div className="card pad mt-16">
        <h3>Usar FORJA desde el celular</h3>
        <p className="muted small mt-8">
          {status.data?.storage === "blob"
            ? "Esta es la versión publicada: abrí la misma dirección desde el celular e iniciá sesión. Desde el menú del navegador podés agregarla a la pantalla de inicio."
            : "Con el servidor corriendo en tu computadora, abrí en el celular la dirección que muestra la terminal al iniciar (por ejemplo http://192.168.0.10:3717), conectado a la misma red wifi. Desde el menú del navegador podés agregarla a la pantalla de inicio."}
        </p>
      </div>
    </div>
  );
}

function CloudUsage() {
  const info = useApi<any>("/api/status/storage");
  const u = info.data?.usage;
  const q = info.data?.quota;
  if (!u || !q) return null;
  const rows = [
    { label: "Guardados (operaciones avanzadas)", used: u.advanced, max: q.advanced },
    { label: "Consultas (operaciones simples)", used: u.simple, max: q.simple },
  ];
  return (
    <div className="card pad mt-16 col gap-16">
      <h3>Almacenamiento en la nube</h3>
      <p className="muted small">
        El plan gratuito de Vercel Blob incluye un cupo por mes. Si se pasa, el almacenamiento queda bloqueado 30 días. FORJA agrupa los cambios para gastar poco. Cifras aproximadas de este mes calendario.
      </p>
      {rows.map((r) => {
        const pct = Math.min(100, Math.round((r.used / r.max) * 100));
        return (
          <div key={r.label} className="col gap-6">
            <div className="row between small">
              <span>{r.label}</span>
              <span className="mono">
                {r.used.toLocaleString("es-AR")} / {r.max.toLocaleString("es-AR")}
              </span>
            </div>
            <div className="meter">
              <div className={pct >= 80 ? "bad" : pct >= 60 ? "warn" : ""} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      {info.data.saving && <Callout kind="warn">Modo ahorro activo: los cambios se suben cada uno o dos minutos para no agotar el cupo.</Callout>}
    </div>
  );
}
