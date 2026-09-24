import * as XLSX from "xlsx";
import { parse, evaluate, type Node } from "./expr.ts";
import type { NumericSpec } from "./types.ts";
import { fmtNumber } from "./format.ts";

// Excel en castellano (configuración regional de Argentina): nombres de funciones
// en español, separador de argumentos «;» y coma decimal.
const ES: Record<string, string> = {
  round: "REDONDEAR",
  sum: "SUMA",
  min: "MIN",
  max: "MAX",
  abs: "ABS",
  sqrt: "RAIZ",
  avg: "PROMEDIO",
  npv: "VNA",
  pmt: "PAGO",
  irr: "TIR",
};
const EN: Record<string, string> = {
  round: "ROUND",
  sum: "SUM",
  min: "MIN",
  max: "MAX",
  abs: "ABS",
  sqrt: "SQRT",
  avg: "AVERAGE",
  npv: "NPV",
  pmt: "PMT",
  irr: "IRR",
};

export interface ExcelRow {
  cell: string;
  label: string;
  kind: "titulo" | "dato" | "paso" | "encabezado";
  value?: number;
  /** Fórmula tal como se escribe en Excel en castellano: =SUMA(B4:B6) */
  formula?: string;
  /** La misma fórmula en inglés (así se guarda dentro del .xlsx). */
  formulaEn?: string;
  expected?: number;
  display?: string;
  stepId?: string;
  varName?: string;
}

export interface ExcelLayout {
  rows: ExcelRow[];
  cellOf: Record<string, string>;
}

const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };

function toFormula(n: Node, cellOf: Record<string, string>, lang: "es" | "en", parentOp = "", rightSide = false): string {
  const sep = lang === "es" ? ";" : ",";
  const names = lang === "es" ? ES : EN;
  const num = (v: number) => {
    const s = String(Math.round(v * 1e10) / 1e10);
    return lang === "es" ? s.replace(".", ",") : s;
  };
  switch (n.t) {
    case "num":
      return num(n.v);
    case "var": {
      const c = cellOf[n.name];
      if (!c) throw new Error(`Sin celda para ${n.name}`);
      return c;
    }
    case "range":
      return `${cellOf[n.from]}:${cellOf[n.to]}`;
    case "neg": {
      const inner = toFormula(n.a, cellOf, lang, "neg");
      return "-" + inner;
    }
    case "bin": {
      const p = PREC[n.op];
      const a = toFormula(n.a, cellOf, lang, n.op, false);
      const b = toFormula(n.b, cellOf, lang, n.op, true);
      const s = `${a}${n.op}${b}`;
      const pp = parentOp === "neg" ? 4 : parentOp ? PREC[parentOp] : 0;
      const needs = p < pp || (p === pp && rightSide && (parentOp === "-" || parentOp === "/" || parentOp === "^")) || (parentOp === "^" && !rightSide && p <= 3);
      return needs ? `(${s})` : s;
    }
    case "call": {
      const args = compressArgs(n.fn, n.args, cellOf).map((a) => (typeof a === "string" ? a : toFormula(a, cellOf, lang)));
      return `${names[n.fn]}(${args.join(sep)})`;
    }
  }
}

/** Convierte argumentos consecutivos en un rango: SUMA(B4;B5;B6) → SUMA(B4:B6). */
function compressArgs(fn: string, args: Node[], cellOf: Record<string, string>): (Node | string)[] {
  const start = fn === "npv" ? 1 : 0;
  if (!["sum", "npv", "irr", "avg", "min", "max"].includes(fn)) return args;
  const tail = args.slice(start);
  if (tail.length < 2 || !tail.every((a) => a.t === "var")) return args;
  const cells = tail.map((a) => cellOf[(a as { name: string }).name]);
  const parsed = cells.map((c) => /^([A-Z]+)(\d+)$/.exec(c));
  if (parsed.some((p) => !p)) return args;
  const col = parsed[0]![1];
  const rows = parsed.map((p) => Number(p![2]));
  const contiguous = parsed.every((p) => p![1] === col) && rows.every((r, k) => k === 0 || r === rows[k - 1] + 1);
  if (!contiguous) return args;
  return [...args.slice(0, start), `${cells[0]}:${cells[cells.length - 1]}`];
}

export function buildLayout(spec: NumericSpec, values: Record<string, number>): ExcelLayout {
  const rows: ExcelRow[] = [];
  const cellOf: Record<string, string> = {};
  let r = 1;
  rows.push({ cell: `A${r}`, label: spec.title, kind: "titulo" });
  r += 2;
  rows.push({ cell: `A${r}`, label: "Datos", kind: "encabezado" });
  r++;
  for (const [k, v] of Object.entries(spec.data)) {
    cellOf[k] = `B${r}`;
    rows.push({ cell: `B${r}`, label: spec.dataLabels[k] ?? k, kind: "dato", value: v, display: fmtNumber(v, spec.dataFormats?.[k]), varName: k });
    r++;
  }
  r++;
  rows.push({ cell: `A${r}`, label: "Resolución", kind: "encabezado" });
  r++;
  for (const s of spec.steps) cellOf[s.id] = `B${r + spec.steps.indexOf(s)}`;
  for (const s of spec.steps) {
    const ast = parse(s.expr);
    rows.push({
      cell: cellOf[s.id],
      label: s.label,
      kind: "paso",
      formula: "=" + toFormula(ast, cellOf, "es"),
      formulaEn: "=" + toFormula(ast, cellOf, "en"),
      expected: values[s.id],
      display: fmtNumber(values[s.id], s.unit),
      stepId: s.id,
    });
    r++;
  }
  return { rows, cellOf };
}

/** Traduce una fórmula de Excel en castellano a nuestro evaluador y la calcula. */
export function evalSpanishFormula(formula: string, cells: Record<string, number>): number {
  let f = formula.replace(/^=/, "").replace(/\$/g, "");
  const inv: Record<string, string> = {};
  for (const [k, v] of Object.entries(ES)) inv[v] = k;
  f = f.replace(/([A-ZÁÉÍÓÚ]+)\(/g, (m, name: string) => (inv[name] ? inv[name] + "(" : m));
  // «;» separa argumentos; la coma es decimal.
  f = f.replace(/(\d),(\d)/g, "$1.$2").replace(/;/g, ",");
  const ast = parse(f);
  return evaluate(ast, cells, (from, to) => rangeValues(from, to, cells));
}

function rangeValues(from: string, to: string, cells: Record<string, number>): number[] {
  const a = XLSX.utils.decode_cell(from);
  const b = XLSX.utils.decode_cell(to);
  const out: number[] = [];
  for (let r = a.r; r <= b.r; r++) for (let c = a.c; c <= b.c; c++) out.push(cells[XLSX.utils.encode_cell({ r, c })] ?? 0);
  return out;
}

const NUMFMT: Record<string, string> = {
  $: '"$" #,##0.00',
  "$/u": '"$" #,##0.00',
  u: "#,##0",
  "%": "0.00%",
  h: "#,##0.0",
  num: "#,##0.00",
};

/** Arma un .xlsx real: con fórmulas (solución) o con las celdas de resultado vacías (plantilla). */
export function buildWorkbook(spec: NumericSpec, layout: ExcelLayout, withSolution: boolean): Buffer {
  const ws: XLSX.WorkSheet = {};
  let maxRow = 1;
  for (const row of layout.rows) {
    const n = Number(row.cell.slice(1));
    maxRow = Math.max(maxRow, n);
    const labelCell = `A${n}`;
    if (row.kind === "titulo" || row.kind === "encabezado") {
      ws[labelCell] = { t: "s", v: row.label };
      continue;
    }
    ws[labelCell] = { t: "s", v: row.label };
    if (row.kind === "dato") {
      const fmt = spec.dataFormats?.[row.varName!];
      ws[row.cell] = { t: "n", v: row.value!, z: NUMFMT[fmt ?? "num"] ?? NUMFMT.num };
    } else if (row.kind === "paso") {
      const step = spec.steps.find((s) => s.id === row.stepId)!;
      const fmt = NUMFMT[step.unit ?? "num"] ?? NUMFMT.num;
      if (withSolution) ws[row.cell] = { t: "n", f: row.formulaEn!.slice(1), v: row.expected, z: fmt };
      else ws[row.cell] = { t: "z", z: fmt } as XLSX.CellObject;
      ws[`C${n}`] = { t: "s", v: withSolution ? `Fórmula: ${row.formula}` : "← escribí tu fórmula acá" };
    }
  }
  ws["!ref"] = `A1:C${maxRow}`;
  ws["!cols"] = [{ wch: 42 }, { wch: 18 }, { wch: 34 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ejercicio");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export interface WorkbookAnswers {
  answers: Record<string, number | null>;
  usedFormula: Record<string, boolean>;
  formulas: Record<string, string>;
}

/** Lee la planilla que resolvió el alumno y saca los valores de cada paso. */
export function readWorkbookAnswers(buf: Buffer, spec: NumericSpec, layout: ExcelLayout): WorkbookAnswers {
  const wb = XLSX.read(buf, { type: "buffer", cellFormula: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const answers: Record<string, number | null> = {};
  const usedFormula: Record<string, boolean> = {};
  const formulas: Record<string, string> = {};
  // Valores numéricos disponibles para recalcular fórmulas sin valor cacheado.
  const cells: Record<string, number> = {};
  for (const [addr, c] of Object.entries(ws)) if (!addr.startsWith("!") && typeof (c as any).v === "number") cells[addr] = (c as any).v;
  for (const row of layout.rows) {
    if (row.kind !== "paso") continue;
    const c = ws[row.cell] as XLSX.CellObject | undefined;
    const sid = row.stepId!;
    usedFormula[sid] = !!c?.f;
    if (c?.f) formulas[sid] = "=" + c.f;
    if (typeof c?.v === "number") answers[sid] = c.v;
    else if (c?.f) {
      try {
        // Fórmula sin valor calculado (p. ej. guardada por una app que no recalcula).
        const en = c.f.replace(/,/g, ";");
        const esF = Object.entries(EN).reduce((acc, [k, v]) => acc.replace(new RegExp(`\\b${v}\\(`, "g"), ES[k] + "("), en);
        answers[sid] = evalSpanishFormula("=" + esF, cells);
        cells[row.cell] = answers[sid]!;
      } catch {
        answers[sid] = null;
      }
    } else answers[sid] = null;
  }
  return { answers, usedFormula, formulas };
}
