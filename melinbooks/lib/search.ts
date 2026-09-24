import type { Product, Program } from "../data/catalog.ts";
import { normalize } from "./format.ts";

type Field = { text: string; weight: number };

function fieldsFor(product: Product, programs: Program[]): Field[] {
  const fields: Field[] = [
    { text: product.subject, weight: 10 },
    { text: product.title, weight: 6 },
    { text: product.catedra ?? "", weight: 6 },
    { text: product.catedraNote ?? "", weight: 3 },
    { text: (product.keywords ?? []).join(" "), weight: 4 },
    { text: (product.facts ?? []).join(" "), weight: 1 },
  ];
  for (const listing of product.listings) {
    const program = programs.find((p) => p.id === listing.program);
    if (!program) continue;
    const group = program.groups.find((g) => g.id === listing.group);
    fields.push({ text: `${program.name} ${program.keywords.join(" ")}`, weight: 2 });
    if (group) fields.push({ text: group.name, weight: 2 });
  }
  return fields.map((f) => ({ ...f, text: normalize(f.text) }));
}

/** Puntaje de un término contra un campo: exacto > empieza con > contiene. */
function scoreTerm(term: string, field: Field): number {
  if (!field.text) return 0;
  const words = field.text.split(" ");
  if (field.text === term) return field.weight * 4;
  if (words.includes(term)) return field.weight * 3;
  if (words.some((w) => w.startsWith(term))) return field.weight * 2;
  if (term.length >= 3 && field.text.includes(term)) return field.weight;
  return 0;
}

/**
 * Busca en el catálogo. Todos los términos de la búsqueda tienen que
 * aparecer en algún campo del producto. Devuelve los productos ordenados
 * por relevancia (y, a igual puntaje, en el orden del catálogo).
 */
export function searchProducts(products: Product[], programs: Program[], query: string): Product[] {
  const terms = normalize(query).split(" ").filter(Boolean);
  if (terms.length === 0) return products;

  const scored: { product: Product; score: number; order: number }[] = [];
  products.forEach((product, order) => {
    const fields = fieldsFor(product, programs);
    let total = 0;
    for (const term of terms) {
      const best = Math.max(0, ...fields.map((f) => scoreTerm(term, f)));
      if (best === 0) return;
      total += best;
    }
    // La frase completa dentro del título suma extra ("pensamiento cientifico").
    const phrase = terms.join(" ");
    if (terms.length > 1 && fields.some((f) => f.text.includes(phrase))) total += 10;
    scored.push({ product, score: total, order });
  });

  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map((s) => s.product);
}
