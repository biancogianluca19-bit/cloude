import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUp, Trash2, Dumbbell, MessageCircle, ShieldAlert } from "lucide-react";
import { api, useApi } from "../api";
import { useSid } from "../App";
import { Rich, SourceCard, useToast, Spinner, Modal, Empty } from "../ui";

const SUGGESTIONS = [
  "Explicame el punto de equilibrio",
  "¿Cómo resuelve este profesor el ejercicio 1.7?",
  "¿De dónde sale la fórmula del costo unitario?",
  "Dame otro ejercicio parecido",
  "No entendí nada de carga fabril, explicámelo desde cero",
];

export function TutorPage() {
  const sid = useSid();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const hist = useApi<any[]>(`/api/subjects/${sid}/tutor`);
  const status = useApi<any>("/api/status");
  const [msgs, setMsgs] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<any>(null);
  const end = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (hist.data) setMsgs(hist.data.map((m) => ({ role: m.role, content: m.content, ...m.meta })));
  }, [hist.data]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length, busy]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;
      setMsgs((m) => [...m, { role: "user", content: question }]);
      setQ("");
      setBusy(true);
      try {
        const r = await api.post(`/api/subjects/${sid}/tutor`, { question });
        setMsgs((m) => [...m, { role: "assistant", ...r }]);
      } catch (e: any) {
        toast(e.message, "bad");
        setMsgs((m) => [...m, { role: "assistant", content: `No pude responder: ${e.message}`, citations: [] }]);
      } finally {
        setBusy(false);
        ta.current?.focus();
      }
    },
    [busy, sid, toast],
  );

  useEffect(() => {
    const pre = params.get("q");
    if (pre && hist.data) {
      setParams({});
      send(pre);
    }
  }, [params, hist.data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="content narrow" style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 56px)" }}>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <h1>Tutor</h1>
          <p className="sub">Responde con el material de esta materia y cita de dónde sale cada cosa. {status.data && !status.data.ai && "En modo demo arma la respuesta con frases textuales del material."}</p>
        </div>
        {msgs.length > 0 && (
          <button
            className="btn sm ghost"
            onClick={async () => {
              if (!confirm("¿Borrar la conversación?")) return;
              await api.del(`/api/subjects/${sid}/tutor`);
              setMsgs([]);
            }}
          >
            <Trash2 /> Limpiar
          </button>
        )}
      </div>
      <div className="chat grow">
        {!msgs.length && !hist.loading && (
          <Empty icon={<MessageCircle />} title="Preguntá lo que no entiendas">
            <div className="chips mt-16" style={{ justifyContent: "center" }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </Empty>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="msg user">
              {m.content}
            </div>
          ) : (
            <div key={i} className="msg assistant col gap-6">
              <Rich text={m.content} onCite={(n) => setSource(m.citations?.find((c: any) => c.n === n) ?? null)} />
              {m.suspicious?.length > 0 && (
                <span className="badge bad">
                  <ShieldAlert /> El material tenía instrucciones sospechosas
                </span>
              )}
              {m.exerciseId && (
                <Link to={`/m/${sid}/ejercicio/${m.exerciseId}`} className="btn primary sm" style={{ alignSelf: "flex-start" }}>
                  <Dumbbell /> Resolver el ejercicio
                </Link>
              )}
              {m.citations?.length > 0 && (
                <div className="row wrap gap-6" style={{ marginTop: 4 }}>
                  {m.citations.map((c: any) => (
                    <button key={c.n} className="chip tiny" style={{ padding: "3px 9px" }} onClick={() => setSource(c)}>
                      <span className="cite" style={{ marginRight: 4 }}>{c.n}</span>
                      {c.file.length > 34 ? c.file.slice(0, 32) + "…" : c.file} · {c.location}
                    </button>
                  ))}
                </div>
              )}
              <span className="tiny faint">{m.mode === "ia" ? "Respuesta con IA" : "Modo demo"}</span>
            </div>
          ),
        )}
        {busy && (
          <div className="msg assistant">
            <Spinner label="Buscando en el material…" />
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="composer">
        {msgs.length > 0 && (
          <div className="chips" style={{ marginBottom: 8 }}>
            {["No entendí, explicámelo desde cero", "Dame otro ejercicio parecido", "¿De dónde sale esa fórmula?"].map((s) => (
              <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="composer-box">
          <textarea
            ref={ta}
            rows={1}
            value={q}
            placeholder="Preguntá sobre la materia…"
            onChange={(e) => {
              setQ(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(160, e.target.scrollHeight) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
                e.preventDefault();
                send(q);
              }
            }}
            aria-label="Pregunta al tutor"
          />
          <button className="btn primary icon" onClick={() => send(q)} disabled={busy || !q.trim()} aria-label="Enviar">
            <ArrowUp />
          </button>
        </div>
      </div>
      <Modal open={!!source} onClose={() => setSource(null)} title="Fuente">
        {source && <SourceCard s={source} subjectId={sid} />}
      </Modal>
    </div>
  );
}
