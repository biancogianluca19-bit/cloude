import type { Unit } from "./types.ts";

const nf = (d: number) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function fmtNumber(v: number | null | undefined, unit?: Unit | string): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  switch (unit) {
    case "$":
    case "$/u":
    case "$/h": {
      const d = Math.abs(v - Math.round(v)) > 0.004 ? 2 : 0;
      const s = "$ " + nf(d).format(v);
      return unit === "$/u" ? s + " por unidad" : unit === "$/h" ? s + " por hora" : s;
    }
    case "u":
      return nf(Math.abs(v - Math.round(v)) > 0.004 ? 2 : 0).format(v) + " u";
    case "%":
      return nf(2).format(v * 100) + " %";
    case "h":
      return nf(Math.abs(v - Math.round(v)) > 0.004 ? 1 : 0).format(v) + " h";
    case "veces":
      return nf(2).format(v) + " veces";
    default:
      return nf(Math.abs(v - Math.round(v)) > 0.004 ? 2 : 0).format(v);
  }
}

/**
 * Interpreta un número escrito por una persona: "1.234,56", "1234.56", "$ 12.000", "25%", "-3,5".
 * Devuelve null si no hay número.
 */
export function parseNumber(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  let s = String(input).trim();
  if (!s) return null;
  const pct = s.includes("%");
  s = s.replace(/[$%\s]|ars|u\b|unidades|pesos/gi, "");
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-") || s.startsWith("−");
  s = s.replace(/[()\-−+]/g, "");
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    // "12,000" con grupos de 3 y sin otro separador suele ser miles en planillas en inglés,
    // pero en Argentina la coma es decimal. Priorizamos la convención local.
    s = parts.length > 2 ? parts.join("") : s.replace(",", ".");
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    const thousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== "0");
    if (thousands) s = parts.join("");
  }
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  const out = neg ? -v : v;
  return pct ? out / 100 : out;
}

export function close(given: number, expected: number, unit?: string): boolean {
  if (!Number.isFinite(given) || !Number.isFinite(expected)) return false;
  const tolAbs = unit === "%" ? 0.0006 : Math.max(0.011, Math.abs(expected) * 0.003);
  if (Math.abs(given - expected) <= tolAbs) return true;
  // Porcentajes: aceptar "25" cuando se espera 0,25.
  if (unit === "%" && Math.abs(given / 100 - expected) <= 0.0006) return true;
  // Unidades: aceptar el redondeo al entero siguiente (no se venden fracciones de unidad).
  if (unit === "u" && Math.abs(given - Math.ceil(expected)) < 0.01) return true;
  return false;
}
