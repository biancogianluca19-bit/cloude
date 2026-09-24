export type Unit = "$" | "$/u" | "u" | "%" | "h" | "num" | "$/h" | "veces";

export interface Step {
  id: string;
  label: string;
  /** Expresión en términos de los datos y de pasos anteriores. Ej: "CF / cmu". */
  expr: string;
  unit?: Unit;
  /** Fórmula para mostrar a una persona: "Punto de equilibrio = Costos fijos ÷ Contribución marginal unitaria". */
  formulaText: string;
  /** Explicación breve de por qué se hace este paso. */
  why?: string;
  decimals?: number;
}

export interface Trap {
  step: string;
  /** Valor que obtiene alguien que comete este error conceptual. */
  expr: string;
  tag: string;
  /** Descripción para la memoria de errores: "Confunde producción terminada con producción vendida". */
  label: string;
  /** Explicación para la corrección. Admite {variable} con valores formateados. */
  message: string;
}

export interface Citation {
  chunkId: number;
  file: string;
  location: string;
  quote?: string;
}

export interface NumericSpec {
  kind: "numeric";
  title: string;
  statement: string;
  data: Record<string, number>;
  dataLabels: Record<string, string>;
  dataFormats?: Record<string, Unit>;
  steps: Step[];
  traps: Trap[];
  hints: string[];
  explanation: string;
  excelMode?: boolean;
  topicKey?: string;
  templateKey?: string;
  /** "profesor": hay evidencia del método en el material. "general": conocimiento académico general. */
  methodSource?: "profesor" | "general";
  methodEvidence?: Citation[];
  points?: number;
  seed?: number;
}

export interface ChoiceSpec {
  kind: "mc" | "vf";
  title: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  hints: string[];
  tag?: string;
  errorLabel?: string;
  source?: Citation;
  topicKey?: string;
  points?: number;
  origin?: string;
}

export interface OpenSpec {
  kind: "open";
  title: string;
  question: string;
  modelAnswer: string;
  keyPoints: { text: string; keywords: string[] }[];
  hints: string[];
  source?: Citation;
  topicKey?: string;
  points?: number;
}

/** Ejercicio tomado de un parcial existente del material. */
export interface ExistingSpec {
  kind: "existing";
  title: string;
  statement: string;
  resolution?: string;
  source: Citation;
  resolutionSource?: Citation;
  hints: string[];
  points?: number;
  topicKey?: string;
}

export type ExerciseSpec = NumericSpec | ChoiceSpec | OpenSpec | ExistingSpec;
