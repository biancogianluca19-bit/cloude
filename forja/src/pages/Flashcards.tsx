import React, { useEffect, useState } from "react";
import { Layers, RefreshCw, Trash2 } from "lucide-react";
import { api, useApi, emitChange, relTime } from "../api";
import { useSid } from "../App";
import { Loading, useToast, Empty, Kbd } from "../ui";

const ORIGIN: Record<string, [string, string]> = {
  error: ["Tu error", "bad"],
  formula: ["Fórmula del profesor", "accent"],
  definicion: ["Definición del material", "info"],
  formula_general: ["Fórmula general", ""],
};

export function Reviewer({ cards, onDone, compact }: { cards: any[]; onDone?: () => void; compact?: boolean }) {
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [done, setDone] = useState(0);
  const card = cards[i];
  const grade = async (g: number) => {
    if (!card) return;
    await api.post(`/api/flashcards/${card.id}/review`, { grade: g });
    setDone((d) => d + 1);
    setFlip(false);
    if (i + 1 >= cards.length) {
      emitChange();
      onDone?.();
    }
    setI(i + 1);
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      if (e.key === " ") {
        e.preventDefault();
        setFlip((x) => !x);
      } else if (flip && ["1", "2", "3", "4"].includes(e.key)) grade(Number(e.key) - 1);
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });
  if (!card) return <Empty icon={<Layers />} title={done ? `Listo: repasaste ${done} tarjeta(s)` : "No hay tarjetas para repasar ahora"}>Vuelven cuando toque según la repetición espaciada.</Empty>;
  const [ol, ot] = ORIGIN[card.origin] ?? [card.origin, ""];
  return (
    <div className="col gap-16" style={{ maxWidth: 620, margin: "0 auto", width: "100%" }}>
      <div className="row between small">
        <span className={`badge ${ot}`}>{ol}</span>
        <span className="faint num">
          {i + 1} / {cards.length}
        </span>
      </div>
      <div className={`flash ${flip ? "flipped" : ""}`} style={compact ? { height: 230 } : undefined} onClick={() => setFlip(!flip)}>
        <div className="flash-inner">
          <div className="flash-face card">
            <div>{card.front}</div>
            <div className="tiny faint mt-16">Tocá o apretá Espacio para ver la respuesta</div>
          </div>
          <div className="flash-face card back">
            <div style={{ fontFamily: card.origin.startsWith("formula") ? "var(--mono)" : undefined, fontSize: card.back.length > 160 ? 14.5 : 16.5 }}>{card.back}</div>
            {card.source && <div className="tiny faint mt-16">{card.source}</div>}
          </div>
        </div>
      </div>
      {flip ? (
        <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {[
            ["Otra vez", "bad"],
            ["Difícil", "warn"],
            ["Bien", "ok"],
            ["Fácil", "ok"],
          ].map(([l, t], g) => (
            <button key={l} className="btn" onClick={() => grade(g)} style={{ borderColor: `var(--${t})`, flexDirection: "column", height: 52, gap: 0 }}>
              {l}
              <span className="tiny faint">
                <Kbd>{g + 1}</Kbd>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <button className="btn lg" onClick={() => setFlip(true)}>
          Mostrar respuesta
        </button>
      )}
    </div>
  );
}

export function FlashcardsPage() {
  const sid = useSid();
  const toast = useToast();
  const due = useApi<any[]>(`/api/subjects/${sid}/flashcards?due=1`);
  const all = useApi<any[]>(`/api/subjects/${sid}/flashcards`);
  const [tab, setTab] = useState<"repasar" | "todas">("repasar");
  const regenerate = async () => {
    const r = await api.post(`/api/subjects/${sid}/flashcards/generate`);
    toast(r.added ? `${r.added} tarjeta(s) nueva(s)` : "No hay tarjetas nuevas para agregar");
    due.reload();
    all.reload();
  };
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Tarjetas</h1>
          <p className="sub">Pocas y útiles: primero tus errores, después las fórmulas del profesor, las definiciones de los temas del examen y, si falta, fórmulas generales. Repetición espaciada.</p>
        </div>
        <button className="btn" onClick={regenerate}>
          <RefreshCw /> Buscar tarjetas nuevas
        </button>
      </div>
      <div className="tabs">
        <button className={tab === "repasar" ? "active" : ""} onClick={() => setTab("repasar")}>
          Repasar {due.data ? `(${due.data.length})` : ""}
        </button>
        <button className={tab === "todas" ? "active" : ""} onClick={() => setTab("todas")}>
          Todas {all.data ? `(${all.data.length})` : ""}
        </button>
      </div>
      {tab === "repasar" ? (
        due.loading && !due.data ? <Loading /> : <Reviewer cards={due.data ?? []} onDone={() => { due.reload(); all.reload(); }} />
      ) : (
        <div className="card list">
          {(all.data ?? []).map((c) => {
            const [ol, ot] = ORIGIN[c.origin] ?? [c.origin, ""];
            return (
              <div key={c.id} className="list-item" style={{ alignItems: "flex-start" }}>
                <div className="grow col gap-4">
                  <span className="small" style={{ fontWeight: 560 }}>{c.front}</span>
                  <span className="small muted">{c.back}</span>
                  <span className="tiny faint">
                    {c.topic_name ? c.topic_name + " · " : ""}
                    {c.source} · {c.reps ? `repasada ${c.reps} vez/veces, próxima ${new Date(c.due_at.replace(" ", "T") + "Z") < new Date() ? "ahora" : "en " + Math.ceil(c.interval_days) + " día(s)"}` : "nueva"}
                    {c.last_review ? ` · última ${relTime(c.last_review)}` : ""}
                  </span>
                </div>
                <span className={`badge ${ot}`}>{ol}</span>
                <button
                  className="btn sm ghost icon"
                  aria-label="Borrar tarjeta"
                  onClick={async () => {
                    await api.del(`/api/flashcards/${c.id}`);
                    all.reload();
                    due.reload();
                  }}
                >
                  <Trash2 />
                </button>
              </div>
            );
          })}
          {!all.data?.length && <Empty title="Sin tarjetas" />}
        </div>
      )}
    </div>
  );
}
