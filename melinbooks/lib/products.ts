import { products, programs, type Product, type ProgramId, type PurchaseOption } from "@/data/catalog";
import type { OrderLine } from "@/lib/whatsapp";

const bySlug = new Map(products.map((p) => [p.slug, p]));

export function getProduct(slug: string): Product | undefined {
  return bySlug.get(slug);
}

export function getProgram(id: ProgramId) {
  const program = programs.find((p) => p.id === id);
  if (!program) throw new Error(`Programa desconocido: ${id}`);
  return program;
}

export function groupName(programId: ProgramId, groupId: string): string {
  return getProgram(programId).groups.find((g) => g.id === groupId)?.name ?? groupId;
}

export function productsIn(programId: ProgramId, groupId?: string): Product[] {
  return products.filter((p) =>
    p.listings.some((l) => l.program === programId && (groupId === undefined || l.group === groupId)),
  );
}

/** Programa principal: donde está publicado primero. */
export function mainListing(product: Product) {
  const listing = product.listings[0];
  if (!listing) throw new Error(`El producto ${product.slug} no tiene ubicación en el catálogo`);
  return listing;
}

/** Etiqueta corta del programa, ej. "UBA XXI · Sociales". */
export function programLabel(product: Product): string {
  const l = mainListing(product);
  const program = getProgram(l.program);
  return l.program === "extras" ? groupName(l.program, l.group) : `${program.short} · ${groupName(l.program, l.group)}`;
}

export function priceRange(product: Product): { min: number; max: number } | null {
  const prices = product.options.map((o) => o.price).filter((p): p is number => p !== undefined);
  if (prices.length === 0) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function getOption(product: Product, optionId: string): PurchaseOption | undefined {
  return product.options.find((o) => o.id === optionId);
}

export function describe(product: Product): string {
  if (product.description) return product.description;
  const where = programLabel(product);
  const catedra = product.catedra ? `, cátedra ${product.catedra}` : "";
  const name = product.subject === product.title ? product.title : `${product.title} (${product.subject})`;
  return `Resumen de ${name} para ${where}${catedra}. Ordenado, claro y listo para estudiar en digital o impreso.`;
}

export function toOrderLine(product: Product, option: PurchaseOption): OrderLine {
  const l = mainListing(product);
  return {
    subject: product.subject,
    title: product.title,
    catedra: product.catedra,
    catedraNote: product.catedraNote,
    programLabel: l.program === "extras" ? groupName(l.program, l.group) : getProgram(l.program).name,
    optionLabel: option.label,
    price: option.price,
  };
}

/** Materias únicas (para la "biblioteca" de la home), con cuántas versiones hay. */
export function subjectShelf(): { subject: string; query: string; count: number; program: ProgramId }[] {
  const map = new Map<string, { subject: string; query: string; count: number; program: ProgramId }>();
  for (const p of products) {
    if (p.kind === "servicio") continue;
    const key = p.subject;
    const current = map.get(key);
    if (current) current.count += 1;
    else map.set(key, { subject: p.subject, query: p.subject, count: 1, program: mainListing(p).program });
  }
  return [...map.values()];
}

export const productCount = products.filter((p) => p.kind !== "servicio").length;
