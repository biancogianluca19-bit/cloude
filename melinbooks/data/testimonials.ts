/**
 * Opiniones de estudiantes.
 *
 * La lista está vacía a propósito: la sección "Opiniones" solo aparece en
 * la web cuando hay al menos una opinión cargada acá.
 *
 * Cargá únicamente opiniones reales, con permiso de quien la escribió.
 * Por ejemplo, las capturas de la historia destacada "Opiniones" de
 * Instagram:
 *
 *   {
 *     quote: "Texto de la opinión, tal como la escribió la persona.",
 *     author: "Nombre o inicial", // como prefiera la persona
 *     detail: "IPC · UBA XXI",   // opcional: qué compró
 *   },
 */

export type Testimonial = {
  quote: string;
  author: string;
  detail?: string;
};

export const testimonials: Testimonial[] = [];
