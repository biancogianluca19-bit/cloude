const thousands = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** 13500 → "$13.500" (como lo escribe Mel). */
export function formatPrice(value: number): string {
  return `$${thousands.format(value)}`;
}

/** Quita tildes y pasa a minúsculas: "Semiología" → "semiologia". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
