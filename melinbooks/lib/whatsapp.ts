import { formatPrice } from "./format.ts";

/** Una línea del pedido, ya resuelta con los datos del catálogo. */
export type OrderLine = {
  subject: string;
  title: string;
  catedra?: string;
  catedraNote?: string;
  programLabel: string;
  optionLabel: string;
  price?: number;
};

export type OrderDetails = {
  name?: string;
  delivery?: string;
  comment?: string;
  /** Si corresponde mencionar el descuento por varias materias. */
  multiSubjectPercent?: number;
};

const GREETING = "¡Hola Mel! 😊";

export function waLink(number: string, text?: string): string {
  const base = `https://wa.me/${number.replace(/\D/g, "")}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

function lineTitle(line: OrderLine, bold = false): string {
  const subject = bold ? `*${line.subject}*` : line.subject;
  return line.subject === line.title ? subject : `${subject} – ${line.title}`;
}

function lineContext(line: OrderLine): string {
  const parts = [line.programLabel];
  if (line.catedra) parts.push(`Cátedra ${line.catedra}${line.catedraNote ? ` (${line.catedraNote})` : ""}`);
  else if (line.catedraNote) parts.push(line.catedraNote);
  return parts.join(" · ");
}

function lineOption(line: OrderLine): string {
  return line.price === undefined ? `${line.optionLabel} (a consultar)` : `${line.optionLabel} – ${formatPrice(line.price)}`;
}

export function orderSubtotal(lines: OrderLine[]): number {
  return lines.reduce((sum, l) => sum + (l.price ?? 0), 0);
}

/** Mensaje de pedido con uno o varios materiales. */
export function buildOrderMessage(lines: OrderLine[], details: OrderDetails = {}): string {
  const out: string[] = [];
  out.push(`${GREETING} Vengo de tu página y quiero hacer este pedido:`, "");

  lines.forEach((line, i) => {
    const prefix = lines.length > 1 ? `${i + 1}) ` : "";
    out.push(`📚 ${prefix}${lineTitle(line, true)}`);
    out.push(`🎓 ${lineContext(line)}`);
    out.push(`📄 ${lineOption(line)}`);
    out.push("");
  });

  const priced = lines.filter((l) => l.price !== undefined);
  if (priced.length > 0) {
    const pending = lines.length - priced.length;
    out.push(`💰 Total según la web: ${formatPrice(orderSubtotal(lines))}${pending > 0 ? " (+ lo que está a consultar)" : ""}`);
  }
  if (details.multiSubjectPercent) {
    out.push(`🎁 Son varias materias, ¿me aplicás el ${details.multiSubjectPercent}% de descuento?`);
  }
  if (details.delivery) out.push(`📩 Prefiero recibirlo por ${details.delivery}.`);
  if (details.name?.trim()) out.push(`🙋 Soy ${details.name.trim()}.`);
  if (details.comment?.trim()) out.push(`📝 ${details.comment.trim()}`);

  if (out[out.length - 1] !== "") out.push("");
  out.push("¿Me pasás los datos para pagar? ¡Gracias!");
  return out.join("\n");
}

/** Consulta por un servicio o material sin precio publicado. */
export function buildInquiryMessage(line: OrderLine): string {
  return `${GREETING} Vengo de tu página y quería consultarte por ${lineTitle(line)} (${lineContext(line)}). ¿Me contás cómo es?`;
}

/** Cuando alguien busca algo y no lo encuentra. */
export function buildNotFoundMessage(query: string): string {
  const q = query.trim();
  return q
    ? `${GREETING} Estuve buscando «${q}» en tu página y no lo encontré. ¿Tenés material de esta materia?`
    : `${GREETING} Estuve mirando tu página y no encontré mi materia. ¿Me ayudás?`;
}

/** Mensaje general desde el botón flotante o el pie de página. */
export function buildHelloMessage(): string {
  return `${GREETING} Vengo de tu página y tengo una consulta.`;
}
