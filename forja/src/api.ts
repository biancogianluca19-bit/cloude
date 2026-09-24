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
  if (res.status === 401 && body && body.auth) window.dispatchEvent(new Event("forja-auth"));
  if (!res.ok) throw new ApiError((body && body.error) || (res.status === 413 ? "El archivo es demasiado grande para enviarlo así." : `Error ${res.status}`), res.status);
  return body;
}

/** Achica fotos antes de subirlas (las del celular pesan varios MB). */
export async function shrinkImage(file: File, max = 2000, quality = 0.85): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 900_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
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
