import type { HiddenSpan } from "./extract.ts";
import { truncate } from "../retrieval/text.ts";

export type Severity = "alto" | "medio" | "bajo";

export interface Finding {
  rule: string;
  reason: string;
  severity: Severity;
  snippet: string;
  /** Texto completo sospechoso (p. ej. el texto oculto entero), para que el usuario decida. */
  content: string;
  hidden: boolean;
}

interface Rule {
  id: string;
  re: RegExp;
  reason: string;
  severity: Severity;
}

// Patrones de instrucciones dirigidas a asistentes de IA (español e inglés).
const RULES: Rule[] = [
  {
    id: "override",
    re: /\b(ignore|disregard|forget)\b.{0,30}\b(previous|prior|above|earlier|all|any)\b.{0,20}\b(instructions?|prompts?|rules?|context)\b/i,
    reason: "Pide ignorar instrucciones previas (patrón típico de prompt injection).",
    severity: "alto",
  },
  {
    id: "override_es",
    re: /\b(ignor[aáe]|olvid[aáe]|descart[aáe]|omit[aáie])\w*\b.{0,30}\b(instrucciones|indicaciones|reglas|consignas|lo anterior|todo lo anterior)\b/i,
    reason: "Pide ignorar u olvidar instrucciones (patrón típico de prompt injection).",
    severity: "alto",
  },
  {
    id: "ai_directed_es",
    re: /\b(si (sos|eres|es) (una?|el|la) (ia|i\.a\.|inteligencia artificial|modelo( de lenguaje)?|asistente|chatbot|llm)|(a|para) (la|el|cualquier) (ia|inteligencia artificial|modelo de lenguaje|asistente virtual)\b.{0,40}\b(debe|deber[aá]s|ten[eé]s que|tiene que))/i,
    reason: "Texto dirigido explícitamente a una IA.",
    severity: "alto",
  },
  {
    id: "ai_directed_es2",
    re: /\b((nota|mensaje|instrucci[oó]n(es)?|aviso) (para|a) (la |el |los |las )?(ia|i\.a\.|inteligencia artificial|asistentes?( de ia)?|modelos? de lenguaje|chatbots?|llms?)|asistentes? de (ia|inteligencia artificial))\b/i,
    reason: "Texto dirigido explícitamente a una IA.",
    severity: "alto",
  },
  {
    id: "ai_directed_en",
    re: /\b(if you are an? (ai|language model|llm|assistant|chatbot)|as an ai( language model)?,? you (must|should)|you are now\b|attention (ai|llm|assistant)|note to (ai|llm|chatgpt|claude))/i,
    reason: "Texto dirigido explícitamente a una IA.",
    severity: "alto",
  },
  {
    id: "insert_answer",
    re: /\b(insert[aáe]|inclu[iíy][ae]?|agreg[aáue]|escrib[aíie]|mencion[aáe]|us[aáe])\w*\b.{0,25}\b(la palabra|la frase|el texto|esta frase|este texto|the word|the phrase)\b/i,
    reason: "Pide insertar una palabra o frase determinada en la respuesta.",
    severity: "alto",
  },
  {
    id: "insert_answer_en",
    re: /\b(include|insert|mention|use|write)\b.{0,20}\b(the word|the phrase|this sentence|the following text)\b/i,
    reason: "Pide insertar una palabra o frase determinada en la respuesta.",
    severity: "alto",
  },
  {
    id: "conceal",
    re: /\b(no (le )?(digas|menciones|reveles|cuentes|informes)|sin (decirle|mencionarle|avisarle)|do not (tell|mention|reveal|inform))\b.{0,30}\b(al? (alumno|estudiante|usuario)|the (user|student)|esto|this)\b/i,
    reason: "Pide ocultar información al usuario.",
    severity: "alto",
  },
  {
    id: "grade_override",
    re: /\b(calific[aáe]|punt[uú][aáe]|pon[eé]|asign[aáe]|aprob[aáe]|give|grade|score)\w*\b.{0,30}\b(10|diez|100|nota m[aá]xima|m[aá]xim[oa] puntaje|full marks|a\+)\b.{0,30}\b(siempre|autom[aá]ticamente|sin importar|always|regardless)\b/i,
    reason: "Pide asignar una calificación determinada sin importar la respuesta.",
    severity: "alto",
  },
  {
    id: "system_tokens",
    re: /(<\|im_start\|>|<\|im_end\|>|\[INST\]|\[\/INST\]|<\/?s>|<<SYS>>|^\s*(###\s*)?(system|instruction|assistant)\s*:|<\/?(system|instructions?)>)/im,
    reason: "Contiene marcadores de formato de prompts para modelos de lenguaje.",
    severity: "alto",
  },
  {
    id: "role_play",
    re: /\b(act[uú]a como|actu[aá] como|a partir de ahora (sos|eres|responde|respond[eé])|from now on,? (you|respond|answer)|pretend (to be|you are))\b/i,
    reason: "Intenta cambiar el rol o el comportamiento del asistente.",
    severity: "medio",
  },
  {
    id: "ai_mention",
    re: /\b(chatgpt|gpt-?\d|claude|gemini|copilot|llama|modelo de lenguaje|language model|prompt)\b/i,
    reason: "Menciona asistentes de IA o prompts. Puede ser contenido legítimo; revisalo.",
    severity: "bajo",
  },
];

const ZERO_WIDTH = /[​-‏⁠-⁤﻿­᠎]/g;
const BIDI = /[‪-‮⁦-⁩]/g;
const TAGS = /[\u{E0000}-\u{E007F}]/gu;
const PRIVATE_USE = /[-]/g;

export function decodeTagChars(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0xe0020 && cp <= 0xe007e) out += String.fromCharCode(cp - 0xe0000);
  }
  return out;
}

/** Elimina caracteres invisibles que no aportan contenido académico. */
export function sanitize(s: string): string {
  return s.replace(ZERO_WIDTH, "").replace(BIDI, "").replace(TAGS, "").replace(PRIVATE_USE, "");
}

function around(text: string, index: number, len: number): string {
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + len + 80);
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
}

/** Quita tildes carácter por carácter (mantiene las posiciones para poder citar el fragmento). */
function fold(s: string): string {
  const map: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ü: "U" };
  return s.replace(/[áéíóúüÁÉÍÓÚÜ]/g, (c) => map[c]);
}

export function scanText(text: string, hidden = false): Finding[] {
  const out: Finding[] = [];
  const clean = sanitize(text).normalize("NFC");
  const folded = fold(clean);

  // Mensajes escondidos con caracteres "tag" de Unicode (invisibles en pantalla).
  const tags = text.match(TAGS);
  if (tags?.length) {
    const decoded = decodeTagChars(text);
    out.push({
      rule: "unicode_tags",
      reason: `Contiene ${tags.length} caracteres Unicode invisibles que codifican texto oculto${decoded ? `: «${truncate(decoded, 120)}»` : ""}.`,
      severity: "alto",
      snippet: decoded ? truncate(decoded, 200) : "(caracteres invisibles)",
      content: decoded,
      hidden: true,
    });
    if (decoded) out.push(...scanText(decoded, true).filter((f) => f.severity !== "bajo"));
  }
  const zw = text.match(ZERO_WIDTH);
  if (zw && zw.length >= 3) {
    out.push({
      rule: "zero_width",
      reason: `Contiene ${zw.length} caracteres de ancho cero (invisibles). A veces se usan para esconder o fragmentar instrucciones.`,
      severity: "medio",
      snippet: around(clean, 0, 40),
      content: "",
      hidden: true,
    });
  }
  if (BIDI.test(text)) {
    out.push({
      rule: "bidi",
      reason: "Contiene caracteres de control de dirección de texto (pueden alterar lo que se ve en pantalla).",
      severity: "medio",
      snippet: around(clean, 0, 40),
      content: "",
      hidden: true,
    });
  }

  for (const r of RULES) {
    const m = r.re.exec(folded) ?? r.re.exec(clean);
    if (!m) continue;
    // Una mención de IA sola en un texto oculto sube de gravedad.
    const severity: Severity = hidden && r.severity !== "alto" ? (r.severity === "bajo" ? "medio" : "alto") : r.severity;
    out.push({ rule: r.id, reason: r.reason, severity, snippet: around(clean, m.index, m[0].length), content: "", hidden });
  }

  // Bloques base64 largos: se decodifican y se revisan.
  for (const m of clean.matchAll(/[A-Za-z0-9+/]{80,}={0,2}/g)) {
    try {
      const dec = Buffer.from(m[0], "base64").toString("utf8");
      if (/^[\x20-\x7E\sáéíóúñÁÉÍÓÚÑ]{20,}$/.test(dec)) {
        const inner = scanText(dec, true).filter((f) => f.severity === "alto");
        out.push({
          rule: "base64",
          reason: inner.length ? `Bloque codificado en base64 que contiene instrucciones: «${truncate(dec, 100)}»` : "Bloque de texto codificado en base64.",
          severity: inner.length ? "alto" : "bajo",
          snippet: truncate(dec, 200),
          content: dec,
          hidden: true,
        });
      }
    } catch {
      /* no es base64 válido */
    }
  }
  return dedupe(out);
}

function dedupe(fs: Finding[]): Finding[] {
  const seen = new Set<string>();
  return fs.filter((f) => {
    const k = f.rule + "|" + f.snippet;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Revisa el texto oculto encontrado por el extractor. Todo texto oculto se reporta. */
export function scanHidden(spans: HiddenSpan[]): Finding[] {
  const out: Finding[] = [];
  for (const h of spans) {
    const inner = scanText(h.text, true);
    const dangerous = inner.some((f) => f.severity === "alto");
    out.push({
      rule: "hidden_text",
      reason: `Texto oculto (${h.reason}).${dangerous ? " Además contiene instrucciones dirigidas a una IA: " + inner.filter((f) => f.severity === "alto").map((f) => f.reason).join(" ") : ""}`,
      severity: dangerous ? "alto" : "medio",
      snippet: truncate(h.text, 240),
      content: h.text,
      hidden: true,
    });
  }
  return out;
}

export function severityRank(s: Severity): number {
  return s === "alto" ? 3 : s === "medio" ? 2 : 1;
}
