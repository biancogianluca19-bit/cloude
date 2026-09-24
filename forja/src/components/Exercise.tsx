import React, { useCallback, useEffect, useRef, useState } from "react";
import { Lightbulb, Camera, FileSpreadsheet, Download, Upload, Send, CheckCircle2, XCircle, CornerDownRight, Copy, GraduationCap, BookMarked, Bug, RotateCcw, ArrowRight, Eye } from "lucide-react";
import { api, emitChange, pct } from "../api";
import { Callout, ScoreRing, Bar, toneFor, useToast, SourceCard, Spinner, Modal, DropZone } from "../ui";

export const SOURCE_LABEL: Record<string, string> = {
  plantilla: "Ejercicio nuevo (plantilla)",
  ia: "Generado con IA desde tu material",
  material: "Pregunta del material",
  biblioteca: "Pregunta general",
  parcial_existente: "Ejercicio de un parcial real",
};

const UNIT_SUFFIX: Record<string, string> = { $: "$", "$/u": "$/u", u: "u", "%": "%", h: "h", "$/h": "$/h", num: "", veces: "veces" };
const HINT_LABELS = ["Pista mínima", "Pista", "Explicación", "Solución completa"];

export interface ExerciseProps {
  ex: any;
  sid: number;
  /** En simulacro: sin pistas ni corrección; las respuestas se guardan hacia afuera. */
  examMode?: boolean;
  value?: any;
  onChange?: (v: any) => void;
  onGraded?: (r: any) => void;
  onNext?: () => void;
}

export function MethodBadge({ ex, sid }: { ex: any; sid: number }) {
  const [open, setOpen] = useState(false);
  if (ex.kind !== "numeric") return null;
  const prof = ex.methodSource === "profesor";
  return (
    <>
      <button className={`badge ${prof ? "accent" : ""}`} style={{ cursor: prof ? "pointer" : "default" }} onClick={() => prof && setOpen(true)} title={prof ? "Ver evidencia" : "No hay evidencia del método del profesor para este tema"}>
        {prof ? <GraduationCap /> : <BookMarked />}
        {prof ? "Método del profesor" : "Método general"}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Evidencia del método del profesor">
        <div className="col">
          {(ex.methodEvidence ?? []).map((e: any, i: number) => (
            <SourceCard key={i} s={e} subjectId={sid} />
          ))}
        </div>
      </Modal>
    </>
  );
}

export function ExerciseView({ ex, sid, examMode, value, onChange, onGraded, onNext }: ExerciseProps) {
  const toast = useToast();
  const [answers, setAnswers] = useState<Record<string, string>>(value?.answers ?? {});
  const [choice, setChoice] = useState<number | null>(value?.choice ?? null);
  const [text, setText] = useState<string>(value?.text ?? "");
  const [hints, setHints] = useState<{ level: number; label: string; text: string; solution?: any }[]>([]);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<{ token: string; message?: string } | null>(null);
  const [selfOpen, setSelfOpen] = useState(false);
  const [selfScore, setSelfScore] = useState(50);
  const [confirmSolution, setConfirmSolution] = useState(false);
  const started = useRef(Date.now());
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (examMode) onChange?.({ answers, choice, text });
  }, [answers, choice, text]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextLevel = Math.min(4, (hints[hints.length - 1]?.level ?? ex.hintsUsed ?? 0) + 1);
  const askHint = useCallback(
    async (level: number) => {
      if (level === 4 && !confirmSolution) {
        setConfirmSolution(true);
        return;
      }
      setConfirmSolution(false);
      try {
        const h = await api.post(`/api/exercises/${ex.id}/hint`, { level });
        setHints((x) => [...x.filter((y) => y.level !== level), h]);
      } catch (e: any) {
        toast(e.message, "bad");
      }
    },
    [ex.id, confirmSolution, toast],
  );

  const submit = useCallback(
    async (extra: any = {}) => {
      setBusy(true);
      try {
        const body = { answers, choice, text, durationS: Math.round((Date.now() - started.current) / 1000), ...extra };
        const r = await api.post(`/api/exercises/${ex.id}/submit`, body);
        emitChange();
        onGraded?.(r);
      } catch (e: any) {
        toast(e.message, "bad");
      } finally {
        setBusy(false);
      }
    },
    [answers, choice, text, ex.id, onGraded, toast],
  );

  // Atajos: h = siguiente pista, ⌘/Ctrl+Enter = entregar.
  useEffect(() => {
    if (examMode) return;
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (ex.kind !== "existing") submit();
      } else if (!typing && e.key === "h" && !e.metaKey && !e.ctrlKey && nextLevel < 4) askHint(nextLevel);
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [examMode, submit, askHint, nextLevel, ex.kind]);

  const uploadPhoto = async (files: File[]) => {
    const fd = new FormData();
    fd.append("photo", files[0]);
    setBusy(true);
    try {
      const r = await api.upload(`/api/exercises/${ex.id}/photo`, fd);
      if (r.needsManual) {
        setPhoto({ token: r.photoToken, message: r.message });
        setTimeout(() => firstInput.current?.focus(), 50);
      } else {
        emitChange();
        onGraded?.(r);
      }
    } catch (e: any) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const uploadExcel = async (files: File[]) => {
    const fd = new FormData();
    fd.append("file", files[0]);
    setBusy(true);
    try {
      const r = await api.upload(`/api/exercises/${ex.id}/excel`, fd);
      emitChange();
      onGraded?.(r);
    } catch (e: any) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  };

  const filled = ex.kind === "numeric" ? Object.values(answers).filter((v) => String(v).trim()).length : ex.kind === "mc" || ex.kind === "vf" ? (choice === null ? 0 : 1) : text.trim() ? 1 : 0;

  return (
    <div className="col gap-16">
      <div className="card pad col gap-16">
        {ex.kind === "numeric" && (
          <>
            <div className="statement">{ex.statement}</div>
            <div className="table-wrap">
              <table className="data-table">
                <tbody>
                  {ex.data.map((d: any) => (
                    <tr key={d.key}>
                      <td className="muted">
                        {d.label}
                        {ex.excelCells?.[d.key] && <span className="mono faint tiny" style={{ marginLeft: 8 }}>{ex.excelCells[d.key]}</span>}
                      </td>
                      <td>{d.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {(ex.kind === "mc" || ex.kind === "vf" || ex.kind === "open") && <div className="statement" style={{ fontSize: 16 }}>{ex.question}</div>}
        {ex.kind === "existing" && (
          <>
            <div className="statement">{ex.statement}</div>
            {ex.source && <SourceCard s={ex.source} subjectId={sid} />}
          </>
        )}
      </div>

      {ex.kind === "numeric" && (
        <div className="card pad">
          <div className="row between wrap mb-8">
            <h3>Tus resultados</h3>
            {!examMode && <span className="tiny faint">Podés escribir 1.234,56 · 25% · $ 12.000</span>}
          </div>
          {photo && (
            <div className="row gap-16 mb-8" style={{ alignItems: "flex-start" }}>
              <img src={`/api/photo-token/${photo.token}`} alt="Tu hoja" style={{ width: 150, borderRadius: 10, border: "1px solid var(--border)" }} />
              <Callout kind="info">{photo.message}</Callout>
            </div>
          )}
          <div>
            {ex.steps.map((s: any, i: number) => (
              <div className="step-row" key={s.id}>
                <span className="step-n">{i + 1}</span>
                <label htmlFor={`st-${ex.id}-${s.id}`} className="small" style={{ fontWeight: 540 }}>
                  {s.label}
                  {ex.excelCells?.[s.id] && <span className="mono faint tiny" style={{ marginLeft: 8 }}>celda {ex.excelCells[s.id]}</span>}
                </label>
                <div className="step-input row gap-6">
                  <input
                    ref={i === 0 ? firstInput : undefined}
                    id={`st-${ex.id}-${s.id}`}
                    className="input num mono"
                    inputMode="decimal"
                    autoComplete="off"
                    value={answers[s.id] ?? ""}
                    onChange={(e) => setAnswers({ ...answers, [s.id]: e.target.value })}
                    placeholder="—"
                  />
                  <span className="faint small" style={{ width: 34 }}>{UNIT_SUFFIX[s.unit] ?? ""}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(ex.kind === "mc" || ex.kind === "vf") && (
        <div className="col gap-6" role="radiogroup">
          {ex.options.map((o: string, i: number) => (
            <button
              key={i}
              role="radio"
              aria-checked={choice === i}
              className="card pad row"
              style={{ cursor: "pointer", textAlign: "left", padding: "13px 16px", borderColor: choice === i ? "var(--accent)" : undefined, boxShadow: choice === i ? "var(--focus)" : undefined }}
              onClick={() => setChoice(i)}
            >
              <span className="step-n" style={choice === i ? { background: "var(--accent)", color: "#fff" } : undefined}>{String.fromCharCode(65 + i)}</span>
              <span className="grow">{o}</span>
            </button>
          ))}
        </div>
      )}
      {(ex.kind === "open" || ex.kind === "existing") && (
        <div className="field">
          <label>Tu respuesta {ex.kind === "existing" && "(opcional sin API key: podés resolver en papel y autoevaluarte)"}</label>
          <textarea className="input" style={{ minHeight: 140 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribí tu desarrollo…" />
        </div>
      )}

      {!examMode && (
        <>
          {hints.length > 0 && (
            <div className="col gap-6">
              {hints.map((h) => (
                <div key={h.level} className="hint-box">
                  <strong>{h.label}.</strong> {h.text}
                  {h.solution && <SolutionView sol={h.solution} sid={sid} />}
                </div>
              ))}
            </div>
          )}
          {confirmSolution && (
            <Callout kind="warn">
              <div className="row between wrap">
                <span>Si ves la solución completa, este ejercicio cuenta mucho menos para tu dominio del tema. ¿Seguro?</span>
                <span className="row">
                  <button className="btn sm" onClick={() => setConfirmSolution(false)}>
                    Sigo intentando
                  </button>
                  <button className="btn sm danger" onClick={() => askHint(4)}>
                    Ver solución
                  </button>
                </span>
              </div>
            </Callout>
          )}
          <div className="row wrap between gap-16">
            <div className="row wrap gap-6">
              {nextLevel <= 4 && (
                <button className="btn" onClick={() => askHint(nextLevel)} title="Atajo: h">
                  <Lightbulb /> {HINT_LABELS[nextLevel - 1]}
                </button>
              )}
              {hints.length > 0 && <span className="tiny faint">{Math.min(3, hints[hints.length - 1].level)} pista(s) usadas</span>}
            </div>
            <div className="row wrap gap-6">
              {ex.kind === "numeric" && (
                <DropZoneButton accept="image/*" capture onFiles={uploadPhoto} disabled={busy}>
                  <Camera /> Foto de mi hoja
                </DropZoneButton>
              )}
              {ex.kind === "existing" ? (
                <>
                  <button className="btn" onClick={() => setSelfOpen(true)} disabled={busy}>
                    <Eye /> Ver resolución y autoevaluarme
                  </button>
                  {text.trim() && (
                    <button className="btn primary" onClick={() => submit()} disabled={busy}>
                      <Send /> Corregir con IA
                    </button>
                  )}
                </>
              ) : (
                <button className="btn primary" onClick={() => submit(photo ? { photoToken: photo.token } : {})} disabled={busy || !filled}>
                  {busy ? <span className="spinner" /> : <Send />} Entregar
                </button>
              )}
            </div>
          </div>
          {ex.excelMode && <ExcelPanel ex={ex} onUpload={uploadExcel} busy={busy} />}
          {ex.kind === "numeric" && !ex.excelMode && (
            <div className="tiny faint">
              ¿Lo tenés que resolver en Excel?{" "}
              <a href={`/api/exercises/${ex.id}/excel`} style={{ textDecoration: "underline" }}>
                Descargá la planilla
              </a>{" "}
              y subila resuelta.
              <DropZoneButton accept=".xlsx,.xls" onFiles={uploadExcel} disabled={busy} small>
                Subir planilla
              </DropZoneButton>
            </div>
          )}
        </>
      )}

      <Modal open={selfOpen} onClose={() => setSelfOpen(false)} title="Resolución del material" wide>
        <SelfGrade ex={ex} sid={sid} value={selfScore} onChange={setSelfScore} onSubmit={() => { setSelfOpen(false); submit({ selfScore: selfScore / 100, input: "autoevaluado" }); }} />
      </Modal>
      {onNext && null}
    </div>
  );
}

function SelfGrade({ ex, sid, value, onChange, onSubmit }: { ex: any; sid: number; value: number; onChange: (n: number) => void; onSubmit: () => void }) {
  const [sol, setSol] = useState<any>(null);
  useEffect(() => {
    api.post(`/api/exercises/${ex.id}/hint`, { level: 4 }).then((h) => setSol(h.solution));
  }, [ex.id]);
  if (!sol) return <Spinner label="Buscando la resolución…" />;
  return (
    <div className="col gap-16">
      {sol.resolution ? (
        <>
          <div className="statement small" style={{ background: "var(--bg-sunk)", padding: 14, borderRadius: 10 }}>{sol.resolution}</div>
          {sol.resolutionSource && <SourceCard s={sol.resolutionSource} subjectId={sid} />}
        </>
      ) : (
        <Callout kind="warn">El material no tiene la resolución de este ejercicio. Compará con tus resueltos o consultá al tutor.</Callout>
      )}
      <div className="field">
        <label>¿Qué tan bien lo resolviste? {value}%</label>
        <input type="range" min={0} max={100} step={10} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="hint-text">La autoevaluación cuenta con menos peso que una corrección automática.</span>
      </div>
      <button className="btn primary" onClick={onSubmit}>
        Registrar
      </button>
    </div>
  );
}

function DropZoneButton({ children, onFiles, accept, capture, disabled, small }: { children: React.ReactNode; onFiles: (f: File[]) => void; accept: string; capture?: boolean; disabled?: boolean; small?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" hidden accept={accept} {...(capture ? { capture: "environment" } : {})} onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) onFiles(f); e.target.value = ""; }} />
      <button className={`btn ${small ? "sm ghost" : ""}`} onClick={() => ref.current?.click()} disabled={disabled} style={small ? { marginLeft: 6 } : undefined}>
        {children}
      </button>
    </>
  );
}

function ExcelPanel({ ex, onUpload, busy }: { ex: any; onUpload: (f: File[]) => void; busy: boolean }) {
  return (
    <div className="card pad col" style={{ borderStyle: "dashed" }}>
      <div className="row gap-6">
        <FileSpreadsheet size={18} color="var(--ok)" />
        <h3>Modo Excel</h3>
      </div>
      <p className="small muted">
        Descargá la planilla con los datos cargados, escribí tus fórmulas en la columna B (en las celdas indicadas en cada paso) y subila. FORJA lee los valores y revisa si usaste fórmulas.
      </p>
      <div className="row wrap">
        <a className="btn" href={`/api/exercises/${ex.id}/excel`}>
          <Download /> Descargar planilla
        </a>
        <DropZone onFiles={onUpload} accept=".xlsx,.xls" multiple={false}>
          <span className="row gap-6 small" style={{ justifyContent: "center" }}>
            {busy ? <span className="spinner" /> : <Upload size={16} />} Subir planilla resuelta
          </span>
        </DropZone>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Resultado

const PART_LABEL: Record<string, string> = { procedimiento: "Procedimiento", resultado: "Resultado", conceptos: "Conceptos", presentacion: "Presentación" };
const STEP_BADGE: Record<string, [string, string]> = { correcto: ["Bien", "ok"], incorrecto: ["Error", "bad"], arrastre: ["Arrastre", "warn"], vacio: ["Sin responder", ""] };

export function GradeView({ r, ex, sid, onAnother, onErrorExercise, compact }: { r: any; ex: any; sid: number; onAnother?: () => void; onErrorExercise?: (tag: string) => void; compact?: boolean }) {
  const g = r.grade ?? r.feedback;
  const sol = r.solution;
  return (
    <div className="col gap-16">
      <div className="card pad row gap-24" style={{ flexWrap: "wrap", alignItems: "center" }}>
        <ScoreRing value={g.score} />
        <div className="col grow" style={{ gap: 8, minWidth: 220 }}>
          {Object.entries(g.breakdown).map(([k, v]: any) =>
            g.weights[k] || v !== null ? (
              <div key={k} className="col gap-4">
                <div className="row between small">
                  <span>
                    {PART_LABEL[k]} <span className="faint tiny">· peso {Math.round((g.weights[k] ?? 0) * 100)}%</span>
                  </span>
                  <span className="num">{v === null ? <span className="faint">sin evaluar</span> : pct(v)}</span>
                </div>
                {v !== null && <Bar value={v} tone={toneFor(v)} />}
              </div>
            ) : null,
          )}
        </div>
      </div>
      <div className="tiny faint">{g.weightsSource}</div>

      <Callout kind={g.score >= 0.95 ? "ok" : g.firstError || g.score < 0.5 ? "bad" : "warn"}>{g.summary}</Callout>

      {g.steps && (
        <div className="card">
          <div className="card-head">
            <h3>Paso a paso</h3>
          </div>
          <div className="card-body">
            {g.steps.map((s: any, i: number) => {
              const [lab, tone] = STEP_BADGE[s.status];
              return (
                <div key={s.id} className={`step-row ${s.status}`} style={{ gridTemplateColumns: "28px 1fr auto" }}>
                  <span className="step-n">{i + 1}</span>
                  <div className="col gap-4">
                    <span className="small" style={{ fontWeight: 560 }}>{s.label}</span>
                    <span className="tiny muted">
                      Tu valor: <span className="mono">{s.givenText}</span> · Correcto: <span className="mono">{s.expectedText}</span>
                    </span>
                    {s.trap && (
                      <span className="tiny" style={{ color: "var(--bad)" }}>
                        <CornerDownRight size={12} style={{ verticalAlign: -2 }} /> {s.trap.message}
                      </span>
                    )}
                    {s.status === "arrastre" && <span className="tiny" style={{ color: "var(--warn)" }}>Bien planteado con tu valor anterior: el error viene de antes.</span>}
                  </div>
                  <span className={`badge ${tone}`}>
                    {s.status === "correcto" ? <CheckCircle2 /> : s.status === "incorrecto" ? <XCircle /> : null}
                    {lab}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {g.errors?.length > 0 && (
        <div className="card pad col gap-6">
          <div className="row gap-6">
            <Bug size={16} color="var(--bad)" />
            <h3>Guardado en tu memoria de errores</h3>
          </div>
          {g.errors.map((e: any) => (
            <div key={e.tag} className="row between wrap small">
              <span>{e.label}</span>
              {onErrorExercise && (
                <button className="btn sm" onClick={() => onErrorExercise(e.tag)}>
                  Practicar este error
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {g.notes?.length > 0 && (
        <div className="col gap-4">
          {g.notes.map((n: string, i: number) => (
            <span key={i} className="small muted">
              · {n}
            </span>
          ))}
        </div>
      )}
      {sol && !compact && <SolutionView sol={sol} sid={sid} />}
      {(onAnother || ex) && !compact && (
        <div className="row wrap">
          {onAnother && (
            <button className="btn primary" onClick={onAnother}>
              <RotateCcw /> Otro ejercicio de este tema
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function SolutionView({ sol, sid }: { sol: any; sid: number }) {
  const toast = useToast();
  if (sol.kind === "numeric") {
    return (
      <div className="card pad col gap-16" style={{ marginTop: 10 }}>
        <div className="row between wrap">
          <h3>Solución</h3>
          <span className={`badge ${sol.methodSource === "profesor" ? "accent" : ""}`}>
            {sol.methodSource === "profesor" ? <GraduationCap /> : <BookMarked />}
            {sol.methodSource === "profesor" ? "Método del profesor" : "Método académico general"}
          </span>
        </div>
        <div className="col gap-6">
          {sol.steps.map((s: any, i: number) => (
            <div key={s.id} className="row" style={{ alignItems: "flex-start" }}>
              <span className="step-n">{i + 1}</span>
              <div className="grow">
                <div className="small" style={{ fontWeight: 560 }}>
                  {s.label}: <span className="mono">{s.text}</span>
                </div>
                <div className="tiny muted">{s.formulaText}</div>
              </div>
            </div>
          ))}
        </div>
        <div>
          <div className="label mb-8">Así se escribe en Excel (configuración en castellano, separador «;»)</div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Celda</th>
                  <th>Concepto</th>
                  <th>Fórmula exacta</th>
                  <th style={{ textAlign: "right" }}>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {sol.excel.map((r: any) => (
                  <tr key={r.cell}>
                    <td className="mono">{r.cell}</td>
                    <td className="small">{r.label}</td>
                    <td>
                      {r.formula ? (
                        <button
                          className="formula"
                          style={{ cursor: "copy", border: "1px solid var(--border)" }}
                          title="Copiar"
                          onClick={() => {
                            navigator.clipboard?.writeText(r.formula);
                            toast(`Copiado: ${r.formula}`);
                          }}
                        >
                          {r.formula} <Copy size={11} style={{ verticalAlign: -1, opacity: 0.6 }} />
                        </button>
                      ) : (
                        <span className="faint tiny">dato</span>
                      )}
                    </td>
                    <td className="mono small" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="small muted">{sol.explanation}</p>
        {sol.methodEvidence?.length > 0 && (
          <div className="col gap-6">
            <span className="label">De dónde sale el método</span>
            {sol.methodEvidence.map((e: any, i: number) => (
              <SourceCard key={i} s={e} subjectId={sid} />
            ))}
          </div>
        )}
      </div>
    );
  }
  if (sol.kind === "mc" || sol.kind === "vf") {
    return (
      <div className="card pad col gap-6" style={{ marginTop: 10 }}>
        <h3>Respuesta: {sol.answer}</h3>
        <p className="small muted">{sol.explanation}</p>
        {sol.source && <SourceCard s={sol.source} subjectId={sid} />}
      </div>
    );
  }
  if (sol.kind === "open") {
    return (
      <div className="card pad col gap-6" style={{ marginTop: 10 }}>
        <h3>Respuesta de referencia</h3>
        <p className="small">{sol.modelAnswer || "—"}</p>
        {sol.keyPoints?.length > 0 && <p className="small muted">Puntos clave: {sol.keyPoints.join("; ")}</p>}
      </div>
    );
  }
  return (
    <div className="card pad col gap-6" style={{ marginTop: 10 }}>
      <h3>Resolución del material</h3>
      {sol.resolution ? <div className="statement small">{sol.resolution}</div> : <p className="muted small">El material no incluye la resolución.</p>}
      {sol.resolutionSource && <SourceCard s={sol.resolutionSource} subjectId={sid} />}
    </div>
  );
}

export function NextLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="btn" onClick={onClick}>
      {children} <ArrowRight />
    </button>
  );
}
