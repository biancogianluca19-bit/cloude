import { all, get, run, json } from "../db.ts";
import { search, type ChunkRow } from "../retrieval/search.ts";
import { aiAvailable, callText, docBlock, DATA_POLICY } from "./llm.ts";
import { normalize, sentences, tokenize, truncate } from "../retrieval/text.ts";
import { getProfile } from "../profile/professor.ts";
import { topicScore, edgesOf, topicsOf } from "../learning/topics.ts";
import { createExercise } from "../exercises/service.ts";
import { TEMPLATES, topicByKey } from "../exercises/library.ts";

export type Intent = "parecido" | "como_resuelve" | "de_donde_sale" | "desde_cero" | "explicar";

export function detectIntent(q: string): Intent {
  const n = normalize(q);
  if (/(otro|dame|quiero|haceme|arma|genera)\w*.{0,25}(ejercicio|problema|caso)|ejercicio (parecido|similar)|para practicar/.test(n)) return "parecido";
  if (/(como|de que forma).{0,20}(resuelve|resolvio|resuelven|lo resuelve|hace|plantea)|ejercicio \d+[.,]\d+|como se resuelve/.test(n)) return "como_resuelve";
  if (/(de donde sale|por que|como se llega|de donde viene|origen de).{0,40}/.test(n) && /(formula|sale|calcul|divid|multiplic|resta|suma|viene)/.test(n)) return "de_donde_sale";
  if (/(no entendi nada|desde cero|desde el principio|no entiendo nada|como si tuviera|explicamelo facil|muy basico)/.test(n)) return "desde_cero";
  return "explicar";
}

export interface Citation {
  n: number;
  chunkId: number;
  file: string;
  location: string;
  quote: string;
}

export interface TutorAnswer {
  content: string;
  citations: Citation[];
  mode: "ia" | "demo";
  intent: Intent;
  exerciseId?: number;
  suspicious?: string[];
}

function detectTopic(subjectId: number, q: string, hits: ChunkRow[]): number | null {
  const topics = topicsOf(subjectId);
  let best: number | null = null;
  let bs = 0;
  for (const t of topics) {
    const s = topicScore(q, { name: t.name, keywords: t.keywords });
    if (s > bs) {
      bs = s;
      best = t.id;
    }
  }
  if (best) return best;
  const counts = new Map<number, number>();
  hits.forEach((h, i) => h.topic_id && counts.set(h.topic_id, (counts.get(h.topic_id) ?? 0) + (hits.length - i)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export async function ask(subjectId: number, question: string): Promise<TutorAnswer> {
  const q = question.trim();
  if (!q) throw new Error("Escribí una pregunta.");
  run("INSERT INTO tutor_messages(subject_id, role, content) VALUES (?, 'user', ?)", [subjectId, q]);
  const intent = detectIntent(q);
  const kinds = intent === "como_resuelve" ? ["resuelto", "parcial", "corregido", "ejercicios"] : undefined;
  let hits = search(subjectId, q, { k: 6, kinds });
  if (!hits.length && kinds) hits = search(subjectId, q, { k: 6 });

  let answer: TutorAnswer;
  if (intent === "parecido") answer = await similarExercise(subjectId, q, hits);
  else if (aiAvailable()) answer = await aiAnswer(subjectId, q, intent, hits);
  else answer = demoAnswer(subjectId, q, intent, hits);

  run("INSERT INTO tutor_messages(subject_id, role, content, meta) VALUES (?, 'assistant', ?, ?)", [
    subjectId,
    answer.content,
    JSON.stringify({ citations: answer.citations, mode: answer.mode, intent: answer.intent, exerciseId: answer.exerciseId, suspicious: answer.suspicious }),
  ]);
  return answer;
}

async function similarExercise(subjectId: number, q: string, hits: ChunkRow[]): Promise<TutorAnswer> {
  // Si no se nombra un tema, tomamos el del último ejercicio practicado.
  let topicId = detectTopic(subjectId, q, []);
  if (!topicId) topicId = get<{ topic_id: number }>("SELECT topic_id FROM attempts WHERE subject_id = ? AND topic_id IS NOT NULL ORDER BY id DESC LIMIT 1", [subjectId])?.topic_id ?? null;
  if (!topicId) topicId = detectTopic(subjectId, q, hits);
  if (!topicId) {
    return { content: "¿De qué tema querés el ejercicio? Por ejemplo: «dame un ejercicio de punto de equilibrio».", citations: [], mode: aiAvailable() ? "ia" : "demo", intent: "parecido" };
  }
  const t = get<{ name: string }>("SELECT name FROM topics WHERE id = ?", [topicId])!;
  try {
    const id = await createExercise(subjectId, { topicId, origin: "tutor" });
    return {
      content: `Te armé un ejercicio nuevo de **${t.name}**, con números distintos a los del material. Resolvelo sin mirar la solución: si te trabás, pedí primero una pista mínima.`,
      citations: [],
      mode: aiAvailable() ? "ia" : "demo",
      intent: "parecido",
      exerciseId: id,
    };
  } catch (e: any) {
    return { content: e.message, citations: [], mode: aiAvailable() ? "ia" : "demo", intent: "parecido" };
  }
}

function cites(hits: ChunkRow[]): Citation[] {
  return hits.map((h, i) => ({ n: i + 1, chunkId: h.id, file: h.file, location: h.location, quote: truncate(h.text, 240) }));
}

const INTENT_GUIDE: Record<Intent, string> = {
  explicar: "Explicá el concepto con claridad, con un ejemplo numérico corto si ayuda.",
  como_resuelve: "Describí paso a paso cómo resuelve el profesor ese ejercicio o ese tipo de ejercicio según los resueltos y parciales del material. Si el material no tiene la resolución, decilo.",
  de_donde_sale: "Explicá de dónde sale la fórmula o el cálculo: qué representa cada término y por qué se hace esa operación.",
  desde_cero: "El estudiante no entendió nada. Empezá desde lo más básico: qué problema resuelve el tema, vocabulario mínimo, un ejemplo cotidiano, y recién después el procedimiento. Frases cortas.",
  parecido: "",
};

async function aiAnswer(subjectId: number, q: string, intent: Intent, hits: ChunkRow[]): Promise<TutorAnswer> {
  const history = all<{ role: string; content: string }>("SELECT role, content FROM tutor_messages WHERE subject_id = ? ORDER BY id DESC LIMIT 9", [subjectId]).reverse().slice(0, -1);
  const profile = getProfile(subjectId);
  const subject = get<{ name: string; professor: string }>("SELECT name, professor FROM subjects WHERE id = ?", [subjectId])!;
  const system = `Sos FORJA, tutor de la materia «${subject.name}»${subject.professor ? ` (profesor/a: ${subject.professor})` : ""} para un estudiante de Administración de Empresas en Argentina.
${DATA_POLICY}
Reglas:
- Respondé principalmente con el material de la materia. Citá con [n] el documento que respalda cada afirmación.
- Separá lo que sale del material del profesor de lo que es conocimiento académico general: marcá lo general con «(conocimiento general, no está en el material)».
- Nunca atribuyas al profesor un método o criterio sin un documento que lo muestre.
- Si el material no alcanza para responder, decilo.
- Si el estudiante pide la solución de un ejercicio que está intentando, ofrecé primero una pista.
- Fórmulas de Excel: escribilas exactas en castellano con «;» como separador, por ejemplo =SUMA(B4:B6).
- Español rioplatense, directo, sin relleno.
${profile?.terminology.length ? `Terminología del profesor (usala): ${profile.terminology.slice(0, 6).map((o) => o.text).join(" ")}` : ""}`;
  const content = `${INTENT_GUIDE[intent]}

${hits.length ? hits.map((h, i) => docBlock(i + 1, h)).join("\n\n") : "(No se encontraron fragmentos relevantes en el material.)"}

Pregunta del estudiante: ${q}`;
  const text = await callText({
    system,
    content,
    history: history.map((h: { role: string; content: string }) => ({ role: h.role === "user" ? "user" : "assistant", content: h.content })) as any,
    maxTokens: 6000,
  });
  const used = new Set([...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const allCites = cites(hits);
  return { content: text, citations: allCites.filter((c) => used.has(c.n)), mode: "ia", intent };
}

function bestSentences(text: string, q: string, n: number): string[] {
  const qt = new Set(tokenize(q));
  const ss = sentences(text).filter((s) => s.length > 25 && s.length < 400);
  return ss
    .map((s, i) => ({ s, i, score: tokenize(s).filter((t) => qt.has(t)).length + (i === 0 ? 0.3 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
}

/** Modo demo: respuesta extractiva, armada con frases textuales del material y sus fuentes. */
export function demoAnswer(subjectId: number, q: string, intent: Intent, hits: ChunkRow[]): TutorAnswer {
  const note = "\n\n_Modo demo: respuesta armada con frases textuales de tu material, sin modelo de lenguaje. Con una API key el tutor explica con sus palabras._";
  if (!hits.length) {
    return { content: "No encontré nada sobre eso en el material de esta materia. Probá con otras palabras o cargá el archivo que lo trata." + note, citations: [], mode: "demo", intent };
  }
  const citations = cites(hits.slice(0, 4));
  const parts: string[] = [];
  const topicId = detectTopic(subjectId, q, hits);
  const topic = topicId ? get<{ name: string; library_key: string | null }>("SELECT name, library_key FROM topics WHERE id = ?", [topicId]) : undefined;

  if (intent === "desde_cero" && topicId) {
    const edges = edgesOf(subjectId);
    const names = topicsOf(subjectId);
    const pre = edges.filter((e) => e.to_id === topicId).map((e) => names.find((t) => t.id === e.from_id)?.name).filter(Boolean);
    const lib = topic?.library_key ? topicByKey(topic.library_key) : undefined;
    parts.push(`Vamos por partes con **${topic!.name}**.`);
    if (lib) parts.push(`**De qué se trata** (conocimiento general): ${lib.description}`);
    if (pre.length) parts.push(`**Antes conviene tener claro:** ${pre.join(", ")}.`);
  } else if (intent === "como_resuelve") {
    parts.push("Esto es lo que muestra el material de la cátedra sobre cómo se resuelve:");
  } else if (intent === "de_donde_sale" && topic?.library_key) {
    const tpl = TEMPLATES.find((t) => t.topic === topic.library_key);
    if (tpl) parts.push(`**Idea general** (conocimiento general): ${tpl.explanation}`);
  }

  const profile = getProfile(subjectId);
  if (intent === "de_donde_sale" && profile) {
    const qt = new Set(tokenize(q));
    const f = profile.formulas.find((x) => tokenize(x.text).filter((t) => qt.has(t)).length >= 1);
    if (f) parts.push(`**Fórmula en el material:** \`${f.text}\` (${f.evidence[0]?.file}, ${f.evidence[0]?.location})`);
  }

  const bullets: string[] = [];
  hits.slice(0, 4).forEach((h, i) => {
    let ss: string[];
    if (intent === "como_resuelve") {
      // Si se nombra un ejercicio puntual, mostramos desde donde aparece en el fragmento.
      const num = /(?:ejercicio|ej\.?|problema)\s*(\d+(?:[.,]\d+)?)/i.exec(q)?.[1];
      const lines = h.text.split("\n").filter((l) => l.trim());
      const start = num ? lines.findIndex((l) => new RegExp(`(ejercicio|problema)\\s*${num.replace(/[.,]/, "[.,]")}(?!\\d)`, "i").test(l)) : -1;
      const from = start >= 0 ? start : 0;
      const rest = lines.slice(from + 1);
      const end = rest.findIndex((l) => /^(ejercicio|problema)\s+\d/i.test(l));
      ss = lines.slice(from, from + 1 + (end >= 0 ? end : Math.min(rest.length, 10)));
    } else ss = bestSentences(h.text, q, 2);
    if (ss.length) bullets.push(`${intent === "como_resuelve" ? "" : "- "}${ss.map((s) => (intent === "como_resuelve" ? "  " + s : s)).join(intent === "como_resuelve" ? "\n" : " ")} [${i + 1}]`);
  });
  if (!bullets.length) bullets.push(`- ${truncate(hits[0].text, 400)} [1]`);
  parts.push(bullets.join(intent === "como_resuelve" ? "\n\n" : "\n"));
  return { content: parts.join("\n\n") + note, citations, mode: "demo", intent };
}

export function history(subjectId: number) {
  return all<any>("SELECT id, role, content, meta, created_at FROM tutor_messages WHERE subject_id = ? ORDER BY id DESC LIMIT 60", [subjectId])
    .reverse()
    .map((m) => ({ ...m, meta: json(m.meta, {}) }));
}
