import React, { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Plus, List, Network, Dumbbell, BookOpen, Trash2, Link2, Sparkles, CheckCircle2 } from "lucide-react";
import { api, useApi, useOnChange, emitChange, relTime, pct } from "../api";
import { useSid } from "../App";
import { Loading, ErrorBox, StatusBadge, Modal, useToast, Sparkline, Bar, toneFor, Empty, STATUS_LABEL, SourceCard } from "../ui";

const NODE_W = 188;
const NODE_H = 60;
const GAP_X = 26;
const GAP_Y = 54;

function layout(topics: any[], edges: { from_id: number; to_id: number }[]) {
  const ids = topics.map((t) => t.id);
  const preds = new Map<number, number[]>(ids.map((i) => [i, []]));
  for (const e of edges) if (preds.has(e.to_id) && preds.has(e.from_id)) preds.get(e.to_id)!.push(e.from_id);
  const depth = new Map<number, number>();
  const visit = (id: number, stack: Set<number>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (stack.has(id)) return 0;
    stack.add(id);
    const d = Math.max(-1, ...preds.get(id)!.map((p) => visit(p, stack))) + 1;
    stack.delete(id);
    depth.set(id, d);
    return d;
  };
  ids.forEach((i) => visit(i, new Set()));
  const rows = new Map<number, any[]>();
  for (const t of topics) rows.set(depth.get(t.id)!, [...(rows.get(depth.get(t.id)!) ?? []), t]);
  const maxRow = Math.max(0, ...[...rows.values()].map((r) => r.length));
  const width = Math.max(1, maxRow) * (NODE_W + GAP_X) + GAP_X;
  const pos = new Map<number, { x: number; y: number }>();
  [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([d, row]) => {
      // Ordenamos por el promedio de x de los predecesores para cruzar menos flechas.
      row.sort((a, b) => {
        const ax = avg(preds.get(a.id)!.map((p) => pos.get(p)?.x ?? 0));
        const bx = avg(preds.get(b.id)!.map((p) => pos.get(p)?.x ?? 0));
        return ax - bx || a.name.localeCompare(b.name);
      });
      const rowW = row.length * (NODE_W + GAP_X) - GAP_X;
      row.forEach((t, i) => pos.set(t.id, { x: (width - rowW) / 2 + i * (NODE_W + GAP_X), y: GAP_X + d * (NODE_H + GAP_Y) }));
    });
  const height = GAP_X * 2 + rows.size * (NODE_H + GAP_Y) - GAP_Y;
  return { pos, width, height };
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const COLORS: Record<string, [string, string]> = {
  sin_estudiar: ["var(--text-3)", "var(--bg-sunk)"],
  debil: ["var(--bad)", "var(--bad-soft)"],
  medio: ["var(--warn)", "var(--warn-soft)"],
  fuerte: ["var(--ok)", "var(--ok-soft)"],
};

function wrap(s: string, n = 24): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > n && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.length > 2 ? [lines[0], lines.slice(1).join(" ").slice(0, n - 1) + "…"] : lines;
}

export function MapPage() {
  const sid = useSid();
  const nav = useNavigate();
  const { data, error, loading, reload } = useApi<any>(`/api/subjects/${sid}/topics`);
  useOnChange(reload);
  const [view, setView] = useState<"mapa" | "lista">(() => (window.matchMedia("(max-width: 860px)").matches ? "lista" : "mapa"));
  const [edit, setEdit] = useState(false);
  const lay = useMemo(() => (data ? layout(data.topics, data.edges) : null), [data]);
  if (loading && !data) return <div className="content"><Loading /></div>;
  if (error) return <div className="content"><ErrorBox error={error} onRetry={reload} /></div>;
  const topics = data.topics;
  const counts = Object.fromEntries(Object.keys(STATUS_LABEL).map((k) => [k, topics.filter((t: any) => (t.mastery?.status ?? "sin_estudiar") === k).length]));

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Mapa de temas</h1>
          <p className="sub">Cada tema muestra tu dominio calculado con tus respuestas: sin estudiar, débil, medio o fuerte. Las flechas indican qué conviene saber antes.</p>
        </div>
        <div className="row">
          <div className="seg">
            <button className={view === "mapa" ? "active" : ""} onClick={() => setView("mapa")}>
              <Network size={14} style={{ verticalAlign: -2 }} /> Mapa
            </button>
            <button className={view === "lista" ? "active" : ""} onClick={() => setView("lista")}>
              <List size={14} style={{ verticalAlign: -2 }} /> Lista
            </button>
          </div>
          <button className="btn" onClick={() => setEdit(true)}>
            <Plus /> Temas
          </button>
        </div>
      </div>
      <div className="row wrap gap-6" style={{ marginBottom: 12 }}>
        {Object.entries(STATUS_LABEL).map(([k, l]) => (
          <span key={k} className={`badge st-badge st-${k}`}>
            <span className="dot st-dot" /> {l}: {counts[k]}
          </span>
        ))}
      </div>
      {!topics.length ? (
        <div className="card">
          <Empty icon={<Network />} title="Sin temas todavía">
            {data.suggestions.length ? "FORJA encontró temas en tu material. " : "Cargá material o creá temas a mano. "}
            <button className="btn sm primary" onClick={() => setEdit(true)} style={{ marginLeft: 6 }}>
              Agregar temas
            </button>
          </Empty>
        </div>
      ) : view === "mapa" && lay ? (
        <div className="map-wrap">
          <svg width={lay.width} height={lay.height} style={{ display: "block", minWidth: "100%" }} role="img" aria-label="Mapa de temas">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-strong)" />
              </marker>
            </defs>
            {data.edges.map((e: any, i: number) => {
              const a = lay.pos.get(e.from_id);
              const b = lay.pos.get(e.to_id);
              if (!a || !b) return null;
              const x1 = a.x + NODE_W / 2;
              const y1 = a.y + NODE_H;
              const x2 = b.x + NODE_W / 2;
              const y2 = b.y - 3;
              const my = (y1 + y2) / 2;
              return <path key={i} d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`} fill="none" stroke="var(--border-strong)" strokeWidth="1.5" markerEnd="url(#arrow)" />;
            })}
            {topics.map((t: any) => {
              const p = lay.pos.get(t.id)!;
              const st = t.mastery?.status ?? "sin_estudiar";
              const [c, soft] = COLORS[st];
              const lines = wrap(t.name);
              return (
                <g key={t.id} className="map-node" transform={`translate(${p.x},${p.y})`} onClick={() => nav(`/m/${sid}/tema/${t.id}`)} role="link" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && nav(`/m/${sid}/tema/${t.id}`)}>
                  <rect className="node-bg" width={NODE_W} height={NODE_H} rx="11" fill="var(--bg-elev)" stroke={c} strokeWidth="1.4" />
                  <rect width="5" height={NODE_H - 16} x="8" y="8" rx="2.5" fill={c} />
                  {lines.map((l, i) => (
                    <text key={i} x="22" y={lines.length === 1 ? 26 : 20 + i * 15} fontSize="12.5" fontWeight="600" fill="var(--text)">
                      {l}
                    </text>
                  ))}
                  <text x="22" y={NODE_H - 10} fontSize="11" fill="var(--text-2)">
                    {STATUS_LABEL[st]}
                    {t.mastery?.attempts ? ` · ${Math.round(t.mastery.effective * 100)}% · ${t.mastery.attempts} ej.` : ""}
                  </text>
                  <rect x={NODE_W - 44} y={NODE_H - 19} width="34" height="5" rx="2.5" fill={soft} />
                  <rect x={NODE_W - 44} y={NODE_H - 19} width={34 * (t.mastery?.effective ?? 0)} height="5" rx="2.5" fill={c} />
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <TopicList topics={topics} sid={sid} />
      )}
      <EditTopics open={edit} onClose={() => setEdit(false)} data={data} sid={sid} onChanged={() => { reload(); emitChange(); }} />
    </div>
  );
}

function TopicList({ topics, sid }: { topics: any[]; sid: number }) {
  const units = new Map<string, any[]>();
  for (const t of topics) units.set(t.unit || "Sin unidad", [...(units.get(t.unit || "Sin unidad") ?? []), t]);
  return (
    <div className="col gap-16">
      {[...units.entries()].map(([u, ts]) => (
        <div key={u} className="card">
          <div className="card-head">
            <h3>{u}</h3>
          </div>
          <div className="list" style={{ paddingTop: 6 }}>
            {ts.map((t) => (
              <Link key={t.id} to={`/m/${sid}/tema/${t.id}`} className="list-item">
                <div className="grow col gap-4">
                  <div className="row between gap-6">
                    <span className="small" style={{ fontWeight: 560 }}>{t.name}</span>
                    <StatusBadge status={t.mastery?.status ?? "sin_estudiar"} />
                  </div>
                  <Bar value={t.mastery?.effective ?? 0} tone={toneFor(t.mastery?.attempts ? t.mastery.effective : null)} />
                  <span className="tiny faint">
                    {t.mastery?.attempts ?? 0} ejercicio(s) · {t.chunks} fragmento(s) del material
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EditTopics({ open, onClose, data, sid, onChanged }: { open: boolean; onClose: () => void; data: any; sid: number; onChanged: () => void }) {
  const toast = useToast();
  const lib = useApi<any[]>(open ? "/api/library" : null);
  const [f, setF] = useState({ name: "", unit: "", keywords: "", libraryKey: "" });
  const [edge, setEdge] = useState({ from: "", to: "" });
  const add = async (body: any, msg: string) => {
    try {
      await api.post(`/api/subjects/${sid}/topics`, body);
      toast(msg);
      onChanged();
    } catch (e: any) {
      toast(e.message, "bad");
    }
  };
  const used = new Set(data.topics.map((t: any) => t.library_key));
  return (
    <Modal open={open} onClose={onClose} title="Temas de la materia" wide>
      <div className="col gap-24">
        {data.suggestions.length > 0 && (
          <div className="col gap-6">
            <div className="row gap-6">
              <Sparkles size={16} />
              <h3>Detectados en tu material</h3>
            </div>
            {data.suggestions.map((s: any, i: number) => (
              <div key={i} className="source row between">
                <div className="grow">
                  <div className="small" style={{ fontWeight: 560 }}>
                    {s.name} <span className="faint">· {s.unit}</span>
                  </div>
                  <div className="tiny faint">
                    {s.source === "biblioteca" ? `${s.hits} fragmento(s) · con ejercicios` : "título de unidad en el material"} · {s.evidence.join(" · ")}
                  </div>
                </div>
                <button
                  className="btn sm"
                  onClick={() => (s.key ? add({ libraryKeys: [s.key] }, "Tema agregado") : add({ name: s.name, unit: s.unit, keywords: s.keywords, origin: "detectado" }, "Tema agregado"))}
                >
                  <Plus /> Agregar
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="col gap-6">
          <h3>Nuevo tema</h3>
          <div className="grid g2">
            <input className="input" placeholder="Nombre (p. ej. Reserva legal)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input className="input" placeholder="Unidad (p. ej. Unidad 2)" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
          </div>
          <input className="input" placeholder="Palabras clave separadas por coma (sirven para asignar el material)" value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} />
          <select className="input" value={f.libraryKey} onChange={(e) => setF({ ...f, libraryKey: e.target.value })}>
            <option value="">Sin ejercicios de la biblioteca (solo teoría del material o IA)</option>
            {(lib.data ?? []).map((l) => (
              <option key={l.key} value={l.key} disabled={used.has(l.key)}>
                Vincular a: {l.name} ({l.area}, {l.templates} plantilla/s)
              </option>
            ))}
          </select>
          <button
            className="btn primary"
            style={{ alignSelf: "flex-start" }}
            disabled={!f.name.trim()}
            onClick={() => {
              add({ name: f.name, unit: f.unit, keywords: f.keywords ? f.keywords.split(",").map((x) => x.trim()).filter(Boolean) : undefined, libraryKey: f.libraryKey || undefined }, "Tema creado");
              setF({ name: "", unit: "", keywords: "", libraryKey: "" });
            }}
          >
            Crear tema
          </button>
        </div>
        {data.topics.length > 1 && (
          <div className="col gap-6">
            <div className="row gap-6">
              <Link2 size={16} />
              <h3>Conectar temas</h3>
            </div>
            <div className="row wrap">
              <select className="input grow" value={edge.from} onChange={(e) => setEdge({ ...edge, from: e.target.value })}>
                <option value="">Primero hay que saber…</option>
                {data.topics.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select className="input grow" value={edge.to} onChange={(e) => setEdge({ ...edge, to: e.target.value })}>
                <option value="">…para entender</option>
                {data.topics.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                className="btn"
                disabled={!edge.from || !edge.to || edge.from === edge.to}
                onClick={async () => {
                  await api.post(`/api/subjects/${sid}/edges`, { from: Number(edge.from), to: Number(edge.to) });
                  toast("Conexión agregada");
                  onChanged();
                }}
              >
                Conectar
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function TopicPage() {
  const sid = useSid();
  const { tid } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const { data, error, loading, reload } = useApi<any>(`/api/topics/${tid}`);
  useOnChange(reload);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [kw, setKw] = useState("");
  const [read, setRead] = useState(false);
  const practice = useCallback(
    async (body: any) => {
      setBusy(true);
      try {
        const ex = await api.post(`/api/subjects/${sid}/exercises`, body);
        nav(`/m/${sid}/ejercicio/${ex.id}`);
      } catch (e: any) {
        toast(e.message, "bad");
      } finally {
        setBusy(false);
      }
    },
    [nav, sid, toast],
  );
  if (loading && !data) return <div className="content"><Loading /></div>;
  if (error) return <div className="content"><ErrorBox error={error} onRetry={reload} /></div>;
  const t = data.topic;
  const m = data.mastery;
  const markRead = async () => {
    await api.post(`/api/topics/${t.id}/read`, { chunkIds: data.chunks.slice(0, 6).map((c: any) => c.id) });
    setRead(true);
    toast("Marcado como leído: cuenta para la cobertura");
    emitChange();
  };
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <div className="row gap-6 mb-8">
            <span className="badge">{t.unit || "Sin unidad"}</span>
            {m && <StatusBadge status={m.status} />}
            {t.library_key && <span className="badge">con ejercicios</span>}
          </div>
          <h1>{t.name}</h1>
          {t.description && <p className="sub">{t.description}</p>}
        </div>
        <div className="row wrap">
          <button className="btn primary" disabled={busy} onClick={() => practice({ topicId: t.id })}>
            <Dumbbell /> Practicar
          </button>
          <button className="btn" disabled={busy} onClick={() => practice({ topicId: t.id, kind: "teoria" })}>
            Pregunta teórica
          </button>
        </div>
      </div>
      {m && (
        <div className="grid g3" style={{ marginBottom: 16 }}>
          <div className="card pad stat">
            <span className="l">Dominio (con olvido)</span>
            <span className="v">{m.attempts || m.evidence ? pct(m.effective) : "—"}</span>
            <Bar value={m.effective} tone={toneFor(m.attempts ? m.effective : null)} />
          </div>
          <div className="card pad stat">
            <span className="l">Ejercicios</span>
            <span className="v">
              {m.correct}
              <span className="faint" style={{ fontSize: 16 }}>/{m.attempts} bien</span>
            </span>
            <span className="tiny faint">Última práctica: {m.lastPracticed ? relTime(m.lastPracticed) : "nunca"}</span>
          </div>
          <div className="card pad stat">
            <span className="l">Evolución</span>
            <Sparkline values={m.trend} width={180} />
            <span className="tiny faint">Retención estimada {pct(m.retention)}</span>
          </div>
        </div>
      )}
      <p className="tiny faint" style={{ marginBottom: 16 }}>
        Dominio = promedio ponderado de tus resultados (los recientes pesan más, las pistas y la solución vista restan), con un punto de partida conservador. Después se ajusta por olvido según los días sin practicar.
      </p>

      {data.errors.length > 0 && (
        <div className="card pad col gap-6" style={{ marginBottom: 16 }}>
          <h3>Tus errores en este tema</h3>
          {data.errors.map((e: any) => (
            <div key={e.tag} className="row between wrap small">
              <span>
                {e.label} <span className="faint">· {e.count} vez/veces{e.active ? "" : " · superado"}</span>
              </span>
              {e.active && (
                <button className="btn sm" onClick={() => practice({ errorTag: e.tag })}>
                  Practicar este error
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid g2">
        <div className="col">
          <div className="row between">
            <h2>Material del tema</h2>
            {data.chunks.length > 0 && (
              <button className="btn sm" onClick={markRead} disabled={read}>
                {read ? <CheckCircle2 /> : <BookOpen />} {read ? "Leído" : "Marcar como leído"}
              </button>
            )}
          </div>
          {params.get("leer") && data.chunks.length > 0 && !read && <p className="small muted">Leé estos fragmentos y marcalos como leídos: cuenta para la cobertura del temario.</p>}
          {data.chunks.map((c: any) => (
            <div key={c.id} className="card pad col gap-6">
              <SourceCard s={{ file: c.file, location: c.location, chunkId: c.id }} subjectId={sid} />
              <div className="small" style={{ whiteSpace: "pre-wrap" }}>{c.text}</div>
            </div>
          ))}
          {!data.chunks.length && <p className="muted small">Ningún fragmento del material quedó asignado a este tema. Revisá las palabras clave.</p>}
        </div>
        <div className="col">
          <h2>Intentos</h2>
          <div className="card list">
            {data.attempts.map((a: any) => (
              <div key={a.id} className="list-item small">
                <span className="grow">{a.title}</span>
                <span className="tiny faint">{relTime(a.created_at)}</span>
                <span className={`badge ${toneFor(a.score) ?? ""}`}>{pct(a.score)}</span>
              </div>
            ))}
            {!data.attempts.length && <div className="card-body muted small">Sin intentos todavía.</div>}
          </div>
          <div className="card pad col gap-6">
            <div className="row between">
              <h3>Palabras clave</h3>
              <button className="btn sm ghost" onClick={() => { setKw(t.keywords.join(", ")); setEditing(!editing); }}>
                Editar
              </button>
            </div>
            {editing ? (
              <>
                <textarea className="input" value={kw} onChange={(e) => setKw(e.target.value)} />
                <button
                  className="btn sm primary"
                  style={{ alignSelf: "flex-start" }}
                  onClick={async () => {
                    await api.patch(`/api/topics/${t.id}`, { keywords: kw.split(",").map((x) => x.trim()).filter(Boolean) });
                    setEditing(false);
                    toast("Guardado: se reasignó el material");
                    reload();
                  }}
                >
                  Guardar
                </button>
              </>
            ) : (
              <div className="chips">
                {t.keywords.map((k: string) => (
                  <span key={k} className="badge">
                    {k}
                  </span>
                ))}
              </div>
            )}
            <button
              className="btn sm ghost danger"
              style={{ alignSelf: "flex-start" }}
              onClick={async () => {
                if (!confirm("¿Borrar este tema? Tus intentos quedan guardados sin tema.")) return;
                await api.del(`/api/topics/${t.id}`);
                emitChange();
                nav(`/m/${sid}/mapa`);
              }}
            >
              <Trash2 /> Borrar tema
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
