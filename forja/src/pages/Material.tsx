import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Upload, FileText, FileSpreadsheet, Presentation, Image as ImageIcon, ShieldAlert, ShieldCheck, Trash2, RefreshCw, Sparkles, EyeOff, Eye } from "lucide-react";
import { api, useApi, emitChange, relTime, shrinkImage } from "../api";
import { useSid } from "../App";
import { DropZone, Loading, ErrorBox, Modal, useToast, Spinner, Callout, Empty } from "../ui";

const ICONS: Record<string, any> = { pdf: FileText, doc: FileText, docx: FileText, txt: FileText, md: FileText, ppt: Presentation, pptx: Presentation, xls: FileSpreadsheet, xlsx: FileSpreadsheet, xlsm: FileSpreadsheet, csv: FileSpreadsheet };
const STATUS: Record<string, [string, string]> = {
  listo: ["Listo", "ok"],
  revisar: ["Revisar alertas", "bad"],
  procesando: ["Procesando", "info"],
  error: ["Error", "bad"],
  sin_texto: ["Sin texto", "warn"],
};
const ACCEPT = ".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.xlsm,.csv,.txt,.md,.png,.jpg,.jpeg,.webp,.gif";

export function MaterialPage() {
  const sid = useSid();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const files = useApi<any[]>(`/api/subjects/${sid}/files`);
  const alerts = useApi<any[]>(`/api/subjects/${sid}/alerts`);
  const kinds = useApi<Record<string, string>>("/api/kinds");
  const demo = useApi<string[]>("/api/demo-files");
  const status = useApi<any>("/api/status");
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<any[] | null>(null);
  const [openFile, setOpenFile] = useState<number | null>(null);
  const [focusChunk, setFocusChunk] = useState<number | null>(null);

  const reloadAll = useCallback(() => {
    files.reload();
    alerts.reload();
    emitChange();
  }, [files.reload, alerts.reload]);

  // ?chunk=ID abre el archivo que contiene ese fragmento.
  useEffect(() => {
    const c = Number(params.get("chunk"));
    if (!c || !files.data) return;
    (async () => {
      for (const f of files.data!) {
        const d = await api.get(`/api/files/${f.id}`);
        if (d.chunks.some((x: any) => x.id === c)) {
          setFocusChunk(c);
          setOpenFile(f.id);
          break;
        }
      }
    })();
  }, [params, files.data]);

  const upload = async (raw: File[]) => {
    setResults(null);
    try {
      const list = await Promise.all(raw.map((f) => shrinkImage(f)));
      let r: any;
      if (status.data?.storage === "blob") {
        // Versión publicada: cada archivo va directo al almacenamiento privado y después se procesa.
        const { upload: direct } = await import("@vercel/blob/client");
        const items: { pathname: string; name: string }[] = [];
        for (let i = 0; i < list.length; i++) {
          const f = list[i];
          setBusy(`Subiendo ${i + 1} de ${list.length}: ${f.name}…`);
          const b = await direct(`forja/entrantes/${f.name.replace(/[^\w.\-]+/g, "_")}`, f, {
            access: "private",
            handleUploadUrl: "/api/blob/upload",
            multipart: f.size > 8 * 1024 * 1024,
          });
          items.push({ pathname: b.pathname, name: f.name });
        }
        setBusy(`Procesando ${list.length} archivo(s): extracción, security scan, temas y perfil del profesor…`);
        r = await api.post(`/api/subjects/${sid}/files/incoming`, { items });
      } else {
        const fd = new FormData();
        list.forEach((f) => fd.append("files", f));
        setBusy(`Procesando ${list.length} archivo(s): extracción, security scan, temas y perfil del profesor…`);
        r = await api.upload(`/api/subjects/${sid}/files`, fd);
      }
      setResults(r.results);
      const bad = r.results.filter((x: any) => !x.ok).length;
      toast(bad ? `${r.results.length - bad} procesado(s), ${bad} con error` : `${r.results.length} archivo(s) procesado(s)`, bad ? "bad" : undefined);
      reloadAll();
    } catch (e: any) {
      toast(e.message, "bad");
    } finally {
      setBusy(null);
    }
  };
  const loadDemo = async () => {
    setBusy("Cargando el material de ejemplo con el mismo proceso que un archivo tuyo…");
    try {
      const r = await api.post(`/api/subjects/${sid}/demo-files`);
      setResults(r.results.map((x: any) => ({ ...x, ok: true })));
      reloadAll();
    } catch (e: any) {
      toast(e.message, "bad");
    } finally {
      setBusy(null);
    }
  };
  const pending = (alerts.data ?? []).filter((a) => a.decision === "pendiente");

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Material</h1>
          <p className="sub">Todo lo que cargues se procesa, se revisa en busca de instrucciones ocultas y queda con referencia al archivo y la página o diapositiva de origen.</p>
        </div>
      </div>
      {params.get("nueva") && !files.data?.length && (
        <div style={{ marginBottom: 14 }}>
          <Callout kind="info">Materia creada. Cargá todo lo que tengas: clases, apuntes de la cátedra, resueltos, parciales anteriores y parciales corregidos. Cuanto más parecido a lo que toma el profesor, mejor.</Callout>
        </div>
      )}
      <DropZone onFiles={upload} accept={ACCEPT}>
        {busy ? (
          <div className="col" style={{ alignItems: "center" }}>
            <span className="spinner" style={{ width: 22, height: 22 }} />
            <span className="muted small">{busy}</span>
          </div>
        ) : (
          <div className="col" style={{ alignItems: "center", gap: 6 }}>
            <Upload />
            <strong>Arrastrá archivos o tocá para elegir</strong>
            <span className="muted small">PDF · PowerPoint · Word · Excel · imágenes · TXT. Desde el celular podés sacar una foto.</span>
          </div>
        )}
      </DropZone>
      {!files.data?.length && demo.data && demo.data.length > 0 && !busy && (
        <div className="row mt-8" style={{ justifyContent: "center" }}>
          <button className="btn sm ghost" onClick={loadDemo}>
            <Sparkles /> Probar con los archivos de ejemplo ({demo.data.length})
          </button>
        </div>
      )}
      {results && (
        <div className="card mt-16">
          <div className="card-head">
            <h3>Resultado de la carga</h3>
            <button className="btn sm ghost" onClick={() => setResults(null)}>
              Cerrar
            </button>
          </div>
          <div className="list" style={{ paddingTop: 6 }}>
            {results.map((r, i) => (
              <div className="list-item small" key={i}>
                {r.ok ? (r.alerts ? <ShieldAlert size={15} color="var(--warn)" /> : <ShieldCheck size={15} color="var(--ok)" />) : <ShieldAlert size={15} color="var(--bad)" />}
                <span className="grow">{r.name}</span>
                {r.ok ? (
                  <span className="muted">
                    {r.chunks} fragmento(s){r.alerts ? ` · ${r.alerts} alerta(s)` : ""}
                    {r.quarantined ? ` · ${r.quarantined} en cuarentena` : ""}
                  </span>
                ) : (
                  <span style={{ color: "var(--bad)" }}>{r.error}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="card mt-24" style={{ borderColor: "color-mix(in srgb, var(--bad) 40%, var(--border))" }}>
          <div className="card-head">
            <div className="row gap-6">
              <ShieldAlert size={18} color="var(--bad)" />
              <h3>Security scan: {pending.length} alerta(s) para revisar</h3>
            </div>
          </div>
          <div className="card-body col">
            <p className="muted small">Este contenido parece dirigido a manipular un asistente de IA. FORJA no lo obedece y no lo usa hasta que decidas. Si lo incluís, entra solo como dato, nunca como instrucción.</p>
            {pending.map((a) => (
              <AlertRow key={a.id} a={a} onDone={reloadAll} />
            ))}
          </div>
        </div>
      )}

      <div className="row between mt-24 mb-8">
        <h2>Archivos {files.data ? <span className="faint">({files.data.length})</span> : null}</h2>
      </div>
      {files.loading && !files.data ? (
        <Loading />
      ) : files.error ? (
        <ErrorBox error={files.error} onRetry={files.reload} />
      ) : !files.data?.length ? (
        <div className="card">
          <Empty icon={<FileText />} title="Sin archivos todavía" />
        </div>
      ) : (
        <div className="card list">
          {files.data.map((f) => {
            const I = ICONS[f.ext] ?? ImageIcon;
            const [label, tone] = STATUS[f.status] ?? [f.status, ""];
            return (
              <div key={f.id} className="list-item" style={{ flexWrap: "wrap" }}>
                <I size={18} style={{ color: "var(--text-3)", flex: "none" }} />
                <button className="grow" style={{ border: 0, background: "none", textAlign: "left", cursor: "pointer", padding: 0, minWidth: 180 }} onClick={() => setOpenFile(f.id)}>
                  <div style={{ fontWeight: 540 }}>{f.name}</div>
                  <div className="tiny faint">
                    {f.chunks} fragmento(s) · {(f.size / 1024).toFixed(0)} KB · {relTime(f.created_at)}
                    {f.quarantined ? ` · ${f.quarantined} en cuarentena` : ""}
                  </div>
                </button>
                <select
                  className="input"
                  style={{ width: 220, height: 30, fontSize: 12.5 }}
                  value={f.kind}
                  onChange={async (e) => {
                    await api.patch(`/api/files/${f.id}`, { kind: e.target.value });
                    toast("Tipo actualizado: se recalculó el perfil del profesor");
                    reloadAll();
                  }}
                  aria-label="Tipo de material"
                >
                  {Object.entries(kinds.data ?? {}).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <span className={`badge ${tone}`}>{label}</span>
              </div>
            );
          })}
        </div>
      )}
      <p className="tiny faint mt-8">El tipo de cada archivo importa: solo el material de la cátedra cuenta como evidencia del método del profesor. Tus apuntes propios se usan para estudiar pero no para describir al profesor.</p>

      <FileModal id={openFile} focusChunk={focusChunk} onClose={() => { setOpenFile(null); setFocusChunk(null); if (params.get("chunk")) setParams({}); }} onChanged={reloadAll} />
    </div>
  );
}

function AlertRow({ a, onDone }: { a: any; onDone: () => void }) {
  const toast = useToast();
  const decide = async (decision: "incluir" | "excluir") => {
    await api.post(`/api/alerts/${a.id}/decision`, { decision });
    toast(decision === "excluir" ? "Contenido excluido del conocimiento de la materia" : "Contenido incluido como dato");
    onDone();
  };
  return (
    <div className="source" style={{ flexDirection: "column", gap: 8, background: "var(--bg)" }}>
      <div className="row wrap gap-6">
        <span className={`badge ${a.severity === "alto" ? "bad" : a.severity === "medio" ? "warn" : ""}`}>{a.severity}</span>
        {a.hidden ? (
          <span className="badge">
            <EyeOff /> oculto
          </span>
        ) : (
          <span className="badge">
            <Eye /> visible
          </span>
        )}
        <span className="src-file">{a.file}</span>
        <span className="faint">· {a.location}</span>
      </div>
      <div className="small">{a.reason}</div>
      <div className="mono tiny" style={{ background: "var(--bg-sunk)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {a.snippet}
      </div>
      {a.decision === "pendiente" ? (
        <div className="row wrap">
          <button className="btn sm" onClick={() => decide("excluir")}>
            Mantener excluido
          </button>
          <button className="btn sm ghost" onClick={() => decide("incluir")}>
            Incluir como dato
          </button>
        </div>
      ) : (
        <span className="tiny faint">Decisión: {a.decision}</span>
      )}
    </div>
  );
}

function FileModal({ id, onClose, onChanged, focusChunk }: { id: number | null; onClose: () => void; onChanged: () => void; focusChunk: number | null }) {
  const toast = useToast();
  const { data, reload } = useApi<any>(id ? `/api/files/${id}` : null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (focusChunk && data) setTimeout(() => document.getElementById(`chunk-${focusChunk}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
  }, [focusChunk, data]);
  if (!id) return null;
  const act = async (fn: () => Promise<any>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast(msg);
      reload();
      onChanged();
    } catch (e: any) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!id} onClose={onClose} title={data?.name ?? "Archivo"} wide>
      {!data ? (
        <Loading />
      ) : (
        <div className="col gap-16">
          <div className="row wrap gap-6 small">
            <span className="badge">{data.extractor ?? "—"}</span>
            <span className="badge">{data.units} unidad(es)</span>
            <span className="badge">{data.chunks.length} fragmento(s)</span>
            <a className="btn sm ghost" href={`/api/files/${data.id}/raw`} target="_blank" rel="noreferrer">
              Abrir original
            </a>
            <button className="btn sm ghost" disabled={busy} onClick={() => act(() => api.post(`/api/files/${data.id}/reprocess`), "Reprocesado")}>
              <RefreshCw /> Reprocesar
            </button>
            <button
              className="btn sm ghost danger"
              disabled={busy}
              onClick={() => confirm("¿Borrar este archivo y su contenido?") && act(() => api.del(`/api/files/${data.id}`), "Archivo borrado").then(onClose)}
            >
              <Trash2 /> Borrar
            </button>
            {busy && <Spinner />}
          </div>
          {data.error && <Callout kind={data.status === "error" ? "bad" : "warn"}>{data.error}</Callout>}
          {(data.status === "sin_texto" || /^(png|jpe?g|webp|gif)$/.test(data.ext)) && (
            <div className="col">
              {/^(png|jpe?g|webp|gif)$/.test(data.ext) && <img src={`/api/files/${data.id}/raw`} alt={data.name} style={{ maxWidth: "100%", maxHeight: 360, objectFit: "contain", borderRadius: 10, border: "1px solid var(--border)" }} />}
              <div className="field">
                <label>Transcripción manual</label>
                <textarea className="input" placeholder="Si el OCR no pudo leer la imagen, escribí acá el texto que se ve." value={text} onChange={(e) => setText(e.target.value)} />
              </div>
              <button className="btn" disabled={busy || text.trim().length < 5} onClick={() => act(() => api.post(`/api/files/${data.id}/transcription`, { text }), "Transcripción guardada")}>
                Guardar transcripción
              </button>
            </div>
          )}
          {data.alerts.length > 0 && (
            <div className="col">
              <h3>Security scan</h3>
              {data.alerts.map((a: any) => (
                <AlertRow key={a.id} a={{ ...a, file: data.name }} onDone={() => { reload(); onChanged(); }} />
              ))}
            </div>
          )}
          {data.cells.length > 0 && (
            <div className="col">
              <h3>Fórmulas de Excel encontradas</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Celda</th>
                      <th>Rótulo</th>
                      <th>Fórmula</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cells.map((c: any, i: number) => (
                      <tr key={i}>
                        <td className="mono">{c.sheet}!{c.cell}</td>
                        <td>{c.label}</td>
                        <td>
                          <span className="formula">{c.formula}</span>
                        </td>
                        <td className="mono">{c.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="col">
            <h3>Contenido extraído</h3>
            {data.chunks.map((c: any) => (
              <div
                key={c.id}
                id={`chunk-${c.id}`}
                className="source"
                style={{ flexDirection: "column", gap: 6, borderColor: c.id === focusChunk ? "var(--accent)" : undefined, boxShadow: c.id === focusChunk ? "var(--focus)" : undefined }}
              >
                <div className="row wrap gap-6">
                  <span className="badge">{c.location}</span>
                  {c.topic && <span className="badge accent">{c.topic}</span>}
                  {c.quarantined ? (
                    <span className="badge bad">
                      <ShieldAlert /> en cuarentena
                    </span>
                  ) : null}
                </div>
                <div className="small" style={{ whiteSpace: "pre-wrap", color: c.quarantined ? "var(--text-3)" : undefined }}>
                  {c.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
