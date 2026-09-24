import React, { useEffect, useState } from "react";
import { Sparkles, Lock } from "lucide-react";
import { api } from "./api";

/** Si la instalación tiene contraseña, pide iniciar sesión antes de mostrar nada. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"cargando" | "ok" | "login">("cargando");
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((a) => setState(!a.required || a.ok ? "ok" : "login"))
      .catch(() => setState("ok"));
    const f = () => setState("login");
    window.addEventListener("forja-auth", f);
    return () => window.removeEventListener("forja-auth", f);
  }, []);
  if (state === "cargando") return null;
  if (state === "login") return <Login onDone={() => window.location.reload()} />;
  return <>{children}</>;
}

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.post("/api/login", { password: pw });
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form className="card pad col gap-16" style={{ width: "min(380px, 100%)" }} onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark">
            <Sparkles size={13} />
          </span>
          FORJA
        </div>
        <div className="col gap-6">
          <h2>Entrar</h2>
          <p className="small muted">Esta instalación de FORJA es privada.</p>
        </div>
        <input type="text" name="username" autoComplete="username" value="forja" readOnly hidden />
        <div className="field">
          <label htmlFor="pw">Contraseña</label>
          <input id="pw" className="input" type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        {err && <div className="small" style={{ color: "var(--bad)" }}>{err}</div>}
        <button className="btn primary lg" disabled={busy || !pw}>
          <Lock /> Entrar
        </button>
      </form>
    </div>
  );
}
