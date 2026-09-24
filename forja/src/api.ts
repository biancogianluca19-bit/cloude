import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parse(res: Response) {
  const ct = res.headers.get("content-type") ?? "";
  const body = ct.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError((body && body.error) || `Error ${res.status}`, res.status);
  return body;
}

export const api = {
  get: <T = any>(url: string): Promise<T> => fetch(url).then(parse),
  post: <T = any>(url: string, body?: unknown): Promise<T> =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).then(parse),
  put: <T = any>(url: string, body?: unknown): Promise<T> =>
    fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).then(parse),
  patch: <T = any>(url: string, body?: unknown): Promise<T> =>
    fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).then(parse),
  del: <T = any>(url: string): Promise<T> => fetch(url, { method: "DELETE" }).then(parse),
  upload: <T = any>(url: string, form: FormData): Promise<T> => fetch(url, { method: "POST", body: form }).then(parse),
};

/** Datos de la API con recarga. Mantiene el valor anterior mientras recarga (sin parpadeos). */
export function useApi<T = any>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await api.get<T>(url);
      if (n === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e: any) {
      if (n === seq.current) setError(e.message);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);
  return { data, error, loading, reload: load, setData };
}

// Bus de eventos mínimo: cuando algo cambia el estado de aprendizaje, las vistas se refrescan.
type Fn = () => void;
const listeners = new Set<Fn>();
export function emitChange() {
  listeners.forEach((f) => f());
}
export function useOnChange(fn: Fn) {
  useEffect(() => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, [fn]);
}

export function pct(v: number | null | undefined, d = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return (v * 100).toFixed(d) + "%";
}

export function relTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") || iso.includes("Z") ? iso : iso.replace(" ", "T") + "Z");
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "recién";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  const days = Math.round(s / 86400);
  return days === 1 ? "ayer" : `hace ${days} días`;
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", opts);
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}
