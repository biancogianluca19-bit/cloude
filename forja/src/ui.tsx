import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, FileText } from "lucide-react";
import { Link } from "react-router-dom";

// ---------------------------------------------------------------- Toasts
type Toast = { id: number; text: string; kind?: "bad" };
const ToastCtx = createContext<(text: string, kind?: "bad") => void>(() => {});
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind?: "bad") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === "bad" ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind ?? ""}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------- Modal
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true">
        {title !== undefined && (
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="btn ghost icon" onClick={onClose} aria-label="Cerrar">
              <X />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Pequeños componentes
export function Spinner({ label }: { label?: string }) {
  return (
    <span className="row gap-6 muted small">
      <span className="spinner" />
      {label}
    </span>
  );
}

export function Loading({ lines = 3 }: { lines?: number }) {
  return (
    <div className="col" style={{ gap: 10 }}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: i === 0 ? 28 : 64, width: i === 0 ? "40%" : "100%" }} />
      ))}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="callout bad">
      <AlertTriangle />
      <div className="grow">
        {error}
        {onRetry && (
          <button className="btn sm ghost" onClick={onRetry} style={{ marginLeft: 8 }}>
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}

export function Callout({ kind = "info", children }: { kind?: "info" | "warn" | "bad" | "ok"; children: React.ReactNode }) {
  const Icon = kind === "ok" ? CheckCircle2 : kind === "info" ? Info : AlertTriangle;
  return (
    <div className={`callout ${kind}`}>
      <Icon />
      <div className="grow">{children}</div>
    </div>
  );
}

export function Bar({ value, tone }: { value: number; tone?: "ok" | "warn" | "bad" }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setW(Math.max(0, Math.min(1, value))));
    return () => cancelAnimationFrame(t);
  }, [value]);
  return (
    <div className={`bar ${tone ?? ""}`}>
      <span style={{ width: `${w * 100}%` }} />
    </div>
  );
}

export function toneFor(v: number | null | undefined): "ok" | "warn" | "bad" | undefined {
  if (v === null || v === undefined) return undefined;
  return v >= 0.72 ? "ok" : v >= 0.45 ? "warn" : "bad";
}

export function ScoreRing({ value, size, label }: { value: number; size?: "lg"; label?: string }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const target = Math.round(value * 100);
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      setP(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const c = value >= 0.72 ? "var(--ok)" : value >= 0.45 ? "var(--warn)" : "var(--bad)";
  return (
    <div className={`score-ring ${size ?? ""}`} style={{ ["--p" as any]: p, ["--c" as any]: c }} aria-label={label ?? `${p}%`}>
      <span>{label ?? p}</span>
    </div>
  );
}

export const STATUS_LABEL: Record<string, string> = { sin_estudiar: "Sin estudiar", debil: "Débil", medio: "Medio", fuerte: "Fuerte" };

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge st-badge st-${status}`}>
      <span className="dot st-dot" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Empty({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      <div className="small">{children}</div>
    </div>
  );
}

export function Sparkline({ values, width = 120, height = 32 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span className="faint tiny">sin datos suficientes</span>;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 4) + 2, height - 3 - v * (height - 6)]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="var(--accent)" />
    </svg>
  );
}

// ---------------------------------------------------------------- Fuentes
export interface Source {
  n?: number;
  chunkId?: number;
  file: string;
  location: string;
  quote?: string;
}

export function SourceCard({ s, subjectId }: { s: Source; subjectId?: number | string }) {
  return (
    <div className="source">
      <FileText size={16} style={{ flex: "none", marginTop: 2, color: "var(--text-3)" }} />
      <div className="grow">
        <div className="row wrap gap-6">
          {s.n !== undefined && <span className="cite">{s.n}</span>}
          <span className="src-file">{s.file}</span>
          <span className="faint">· {s.location}</span>
          {subjectId && s.chunkId ? (
            <Link to={`/m/${subjectId}/material?chunk=${s.chunkId}`} className="tiny" style={{ color: "var(--accent-text)", marginLeft: "auto" }}>
              ver en el material
            </Link>
          ) : null}
        </div>
        {s.quote && <div className="quote">«{s.quote}»</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Texto enriquecido (markdown mínimo + citas [n])
function inline(text: string, onCite?: (n: number) => void): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_|\[\d+\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k++}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("_")) out.push(<em key={k++} className="muted">{t.slice(1, -1)}</em>);
    else {
      const n = Number(t.slice(1, -1));
      out.push(
        <button key={k++} className="cite" onClick={() => onCite?.(n)} title="Ver fuente">
          {n}
        </button>,
      );
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Rich({ text, onCite }: { text: string; onCite?: (n: number) => void }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div className="prose">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-•*]\s+/, ""), onCite)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
          return (
            <ol key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""), onCite)}</li>
              ))}
            </ol>
          );
        }
        if (lines.length > 2 && lines.every((l) => l.startsWith("  "))) return <pre key={i}>{inline(lines.map((l) => l.slice(2)).join("\n"), onCite)}</pre>;
        if (/^#{1,3}\s/.test(b)) return <h3 key={i} style={{ marginTop: 8 }}>{inline(b.replace(/^#{1,3}\s/, ""), onCite)}</h3>;
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <React.Fragment key={j}>
                {j > 0 && <br />}
                {inline(l, onCite)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Zona de carga
export function DropZone({ onFiles, accept, multiple = true, children, capture }: { onFiles: (f: File[]) => void; accept?: string; multiple?: boolean; children: React.ReactNode; capture?: boolean }) {
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`dropzone ${over ? "over" : ""}`}
      onClick={() => ref.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const fs = [...e.dataTransfer.files];
        if (fs.length) onFiles(fs);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && ref.current?.click()}
    >
      <input
        ref={ref}
        type="file"
        hidden
        multiple={multiple}
        accept={accept}
        {...(capture ? { capture: "environment" } : {})}
        onChange={(e) => {
          const fs = [...(e.target.files ?? [])];
          if (fs.length) onFiles(fs);
          e.target.value = "";
        }}
      />
      {children}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd>{children}</kbd>;
}

export function useIsMobile() {
  const [m, setM] = useState(() => window.matchMedia("(max-width: 860px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const f = () => setM(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return m;
}
