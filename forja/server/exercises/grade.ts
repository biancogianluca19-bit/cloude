import { evalExpr, type Env } from "./expr.ts";
import { close, fmtNumber, parseNumber } from "./format.ts";
import type { ChoiceSpec, NumericSpec, OpenSpec, Trap } from "./types.ts";
import { normalize, tokenize } from "../retrieval/text.ts";

export interface Weights {
  procedimiento: number;
  resultado: number;
  conceptos: number;
  presentacion: number;
}

export const DEFAULT_WEIGHTS: Weights = { procedimiento: 0.5, resultado: 0.3, conceptos: 0.2, presentacion: 0.1 };

export interface StepResult {
  id: string;
  label: string;
  expected: number;
  expectedText: string;
  given: number | null;
  givenText: string;
  status: "correcto" | "arrastre" | "incorrecto" | "vacio";
  trap?: { tag: string; label: string; message: string };
  formulaText: string;
}

export interface ErrorFound {
  tag: string;
  label: string;
  detail: string;
}

export interface Grade {
  score: number;
  breakdown: {
    procedimiento: number | null;
    resultado: number | null;
    conceptos: number | null;
    presentacion: number | null;
  };
  weights: Weights;
  weightsSource: string;
  steps?: StepResult[];
  summary: string;
  firstError?: string;
  errors: ErrorFound[];
  /** Trampas que el alumno evitó (sirven para dar por superado un error recurrente). */
  passedTraps: string[];
  notes: string[];
}

export function solve(spec: NumericSpec): Record<string, number> {
  const env: Env = { ...spec.data };
  for (const s of spec.steps) env[s.id] = evalExpr(s.expr, env);
  const out: Record<string, number> = {};
  for (const s of spec.steps) out[s.id] = env[s.id];
  return out;
}

function fill(msg: string, spec: NumericSpec) {
  return msg.replace(/\{(\w+)\}/g, (_, k) => (k in spec.data ? fmtNumber(spec.data[k], spec.dataFormats?.[k]) : `{${k}}`));
}

export function gradeNumeric(
  spec: NumericSpec,
  rawAnswers: Record<string, string | number | null | undefined>,
  opts: { weights?: Weights; weightsSource?: string; presentation?: number | null; presentationNote?: string } = {},
): Grade {
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const correct = solve(spec);
  const envCorrect: Env = { ...spec.data, ...correct };
  const envStudent: Env = { ...spec.data };
  const steps: StepResult[] = [];
  const errors: ErrorFound[] = [];
  const passed = new Set<string>();

  for (const s of spec.steps) {
    const given = parseNumber(rawAnswers[s.id] as any);
    const expected = correct[s.id];
    const r: StepResult = {
      id: s.id,
      label: s.label,
      expected,
      expectedText: fmtNumber(expected, s.unit),
      given,
      givenText: given === null ? "—" : fmtNumber(given, s.unit),
      status: "vacio",
      formulaText: s.formulaText,
    };
    if (given === null) {
      steps.push(r);
      envStudent[s.id] = expected; // sin dato, los pasos siguientes se evalúan con el valor correcto
      continue;
    }
    // Normalizamos porcentajes escritos como "25" cuando se espera 0,25.
    let g = given;
    if (s.unit === "%" && Math.abs(expected) <= 1.5 && Math.abs(g) > 1.5) g = g / 100;
    envStudent[s.id] = g;
    r.given = g;
    r.givenText = fmtNumber(g, s.unit);
    const trapsHere = spec.traps.filter((t) => t.step === s.id);
    if (close(g, expected, s.unit)) {
      r.status = "correcto";
      trapsHere.forEach((t) => passed.add(t.tag));
    } else {
      // ¿Coincide con un error conceptual conocido?
      const trap = trapsHere.find((t) => {
        try {
          return close(g, evalExpr(t.expr, envCorrect), s.unit);
        } catch {
          return false;
        }
      });
      // ¿Es consistente con sus propios resultados anteriores (error arrastrado)?
      let consistent = false;
      try {
        const withStudent = evalExpr(s.expr, envStudent);
        consistent = close(g, withStudent, s.unit) && !close(withStudent, expected, s.unit);
      } catch {
        consistent = false;
      }
      // Si el valor sale de aplicar bien el paso sobre sus propios resultados anteriores,
      // es arrastre aunque coincida con una trampa: el error conceptual ya se contó antes.
      if (consistent) {
        r.status = "arrastre";
      } else if (trap) {
        r.status = "incorrecto";
        r.trap = { tag: trap.tag, label: trap.label, message: fill(trap.message, spec) };
        errors.push({ tag: trap.tag, label: trap.label, detail: `${s.label}: ${fill(trap.message, spec)}` });
      } else {
        r.status = "incorrecto";
      }
    }
    steps.push(r);
  }

  const answered = steps.filter((s) => s.status !== "vacio");
  const inner = steps.slice(0, -1);
  const last = steps[steps.length - 1];
  const val = (s: StepResult) => (s.status === "correcto" ? 1 : s.status === "arrastre" ? 0.75 : 0);
  const procedimiento = inner.length ? inner.reduce((a, s) => a + val(s), 0) / inner.length : val(last);
  const resultado = last.status === "correcto" ? 1 : last.status === "arrastre" ? 0.4 : 0;
  // Conceptos: solo se evalúa con evidencia (una trampa en la que caíste o que evitaste).
  const conceptHits = new Set(errors.map((e) => e.tag)).size;
  const conceptEvidence = conceptHits + passed.size;
  const conceptos = conceptEvidence ? Math.max(0, 1 - 0.5 * conceptHits) : null;
  const presentacion = opts.presentation ?? null;

  const parts: [keyof Weights, number | null][] = [
    ["procedimiento", procedimiento],
    ["resultado", resultado],
    ["conceptos", conceptos],
    ["presentacion", presentacion],
  ];
  let wsum = 0;
  let total = 0;
  for (const [k, v] of parts) {
    if (v === null) continue;
    wsum += weights[k];
    total += weights[k] * v;
  }
  const score = answered.length === 0 ? 0 : wsum ? total / wsum : 0;

  // Mensaje estilo profesor: hasta dónde está bien y dónde aparece el primer error.
  const firstBad = steps.findIndex((s) => s.status === "incorrecto");
  let summary: string;
  let firstError: string | undefined;
  if (answered.length === 0) summary = "No cargaste ningún resultado.";
  else if (firstBad === -1) {
    const arr = steps.some((s) => s.status === "arrastre");
    const empty = steps.filter((s) => s.status === "vacio");
    summary = arr
      ? "El procedimiento es correcto; las diferencias vienen arrastradas de un valor anterior."
      : empty.length
        ? `Lo que resolviste está bien. Te faltó: ${empty.map((s) => s.label.toLowerCase()).join(", ")}.`
        : "Todo correcto: procedimiento y resultado.";
  } else {
    const bad = steps[firstBad];
    const okBefore = steps.slice(0, firstBad).filter((s) => s.status === "correcto");
    const lead = firstBad === 0 ? "El error aparece en el primer paso" : okBefore.length ? `Hasta «${steps[firstBad - 1].label}» el procedimiento está bien. El error aparece en «${bad.label}»` : `El error aparece en «${bad.label}»`;
    const why = bad.trap
      ? `: ${lowerFirst(bad.trap.message)}`
      : `: pusiste ${bad.givenText} y corresponde ${bad.expectedText} (${bad.formulaText}).`;
    firstError = lead + why;
    const after = steps.slice(firstBad + 1).filter((s) => s.status === "arrastre").length;
    summary = firstError + (after ? ` Los ${after} paso(s) siguientes están bien planteados con tu valor (arrastre).` : "");
  }

  const notes: string[] = [];
  if (presentacion === null) notes.push("Presentación: sin evaluar (se necesita la foto de la hoja o la planilla).");
  if (conceptos === null && answered.length) notes.push("Conceptos: sin evaluar (tus respuestas no permiten saber si hubo un error conceptual conocido).");
  if (opts.presentationNote) notes.push(opts.presentationNote);
  return {
    score,
    breakdown: { procedimiento, resultado, conceptos, presentacion },
    weights,
    weightsSource: opts.weightsSource ?? "Criterio genérico de FORJA (no hay criterios del profesor en el material).",
    steps,
    summary,
    firstError,
    errors,
    passedTraps: [...passed].filter((t) => !errors.some((e) => e.tag === t)),
    notes,
  };
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function gradeChoice(spec: ChoiceSpec, answer: number | null): Grade {
  const ok = answer === spec.correct;
  const errors: ErrorFound[] = [];
  if (!ok && answer !== null && spec.tag && spec.errorLabel) errors.push({ tag: spec.tag, label: spec.errorLabel, detail: spec.question });
  return {
    score: ok ? 1 : 0,
    breakdown: { procedimiento: null, resultado: null, conceptos: ok ? 1 : 0, presentacion: null },
    weights: { procedimiento: 0, resultado: 0, conceptos: 1, presentacion: 0 },
    weightsSource: "Pregunta conceptual: se evalúa solo el concepto.",
    summary: answer === null ? "Sin responder." : ok ? "Correcto." : `Incorrecto. La respuesta es «${spec.options[spec.correct]}». ${spec.explanation}`,
    errors,
    passedTraps: ok && spec.tag ? [spec.tag] : [],
    notes: [],
  };
}

/**
 * Corrección aproximada de una respuesta abierta por puntos clave. Se usa cuando no hay
 * modelo de lenguaje disponible; se informa explícitamente que es aproximada.
 */
export function gradeOpenByKeywords(spec: OpenSpec, text: string): Grade {
  const toks = new Set(tokenize(text));
  const norm = normalize(text);
  const hits = spec.keyPoints.map((kp) => {
    const found = kp.keywords.filter((k) => {
      const kt = tokenize(k);
      return kt.length > 1 ? norm.includes(normalize(k)) || kt.every((t) => toks.has(t)) : kt.some((t) => toks.has(t));
    });
    return { kp, ok: found.length >= Math.max(1, Math.ceil(kp.keywords.length / 2)) };
  });
  const score = spec.keyPoints.length ? hits.filter((h) => h.ok).length / spec.keyPoints.length : 0;
  const missing = hits.filter((h) => !h.ok).map((h) => h.kp.text);
  return {
    score,
    breakdown: { procedimiento: null, resultado: null, conceptos: score, presentacion: null },
    weights: { procedimiento: 0, resultado: 0, conceptos: 1, presentacion: 0 },
    weightsSource: "Corrección aproximada por conceptos clave (sin modelo de lenguaje).",
    summary: missing.length ? `Te faltó mencionar: ${missing.join("; ")}.` : "Mencionaste todos los conceptos clave.",
    errors: [],
    passedTraps: [],
    notes: ["Esta corrección busca conceptos clave en tu texto; no evalúa redacción ni razonamiento. Con una API key configurada la corrección es más fina."],
  };
}

export function trapsForTag(spec: NumericSpec, tag: string): Trap[] {
  return spec.traps.filter((t) => t.tag === tag);
}
