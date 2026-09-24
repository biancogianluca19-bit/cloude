import { all } from "../db.ts";
import { normalize, sentences, truncate } from "../retrieval/text.ts";
import type { Citation } from "./types.ts";

export interface Definition {
  term: string;
  definition: string;
  topicId: number | null;
  citation: Citation;
}

const DEF_RE = /^(?:(?:el|la|los|las|un|una)\s+)?([a-záéíóúñ][a-záéíóúñ ]{2,45}?)\s+(?:es|son|se define como|se denomina|consiste en|representa|se entiende por|mide)\s+(.{25,260})$/i;
const LEAD_RE = /^(?:se denomina|se llama|se entiende por)\s+([a-záéíóúñ ]{3,45}?)\s+(?:a|al)\s+(.{25,260})$/i;

// Frases que no nombran un concepto: condiciones, conectores, pronombres.
const BAD_START = /^(si|cuando|aunque|porque|como|para|en|con|por|donde|que|lo|este|esta|estos|estas|todo|toda|cada|no|ya|tambi[eé]n|luego|entonces|adem[aá]s|es decir|mientras|siempre|nunca|solo|s[oó]lo)\b/i;
const BAD_TERMS = /^(esto|esta|este|eso|que|lo|lo que|ello|el mismo|la misma|cada|todo|toda|el resultado|la respuesta|el ejercicio|la empresa|el total|el siguiente|la siguiente)$/i;

/** Extrae definiciones del material de la materia ("X es …", "Se denomina X a …"). */
export function extractDefinitions(subjectId: number): Definition[] {
  const rows = all<{ id: number; text: string; location: string; file: string; topic_id: number | null; kind: string }>(
    `SELECT c.id, c.text, c.location, f.name file, c.topic_id, f.kind FROM chunks c JOIN files f ON f.id = c.file_id
     WHERE c.subject_id = ? AND c.quarantined = 0 AND f.kind IN ('teoria','apunte','resuelto','ejercicios')`,
    [subjectId],
  );
  const out: Definition[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    // Primero por línea: evita pegar un título con la oración que le sigue.
    // Las líneas cortadas por el ancho de página (siguen en minúscula) se vuelven a unir.
    const lines: string[] = [];
    for (const line of r.text.split("\n")) {
      if (lines.length && /^[a-záéíóúñ(]/.test(line.trim()) && !/[.:;]$/.test(lines[lines.length - 1])) lines[lines.length - 1] += " " + line.trim();
      else lines.push(line.trim());
    }
    for (const s of lines.flatMap((line) => sentences(line))) {
      const clean = s.replace(/^[•\-–·*\d.)\s]+/, "").trim();
      let m = DEF_RE.exec(clean);
      let term: string | undefined;
      let def: string | undefined;
      if (m) {
        term = m[1];
        def = m[2];
      } else if ((m = LEAD_RE.exec(clean))) {
        term = m[1];
        def = m[2];
      }
      if (!term || !def) continue;
      term = term.trim();
      if (BAD_TERMS.test(term) || BAD_START.test(term) || term.split(" ").length > 6 || /\d/.test(term)) continue;
      if (def.length < 30 || /^(positiv|negativ|mayor|menor|igual|cero|correct|incorrect)/i.test(def)) continue;
      const key = normalize(term);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        term: term.charAt(0).toUpperCase() + term.slice(1),
        definition: truncate(def.replace(/\.$/, ""), 240),
        topicId: r.topic_id,
        citation: { chunkId: r.id, file: r.file, location: r.location, quote: truncate(clean, 220) },
      });
    }
  }
  return out;
}
