import { testimonials } from "@/data/testimonials";

export const navLinks = [
  { href: "/catalogo", label: "Catálogo" },
  { href: "/#como-comprar", label: "Cómo comprar" },
  ...(testimonials.length > 0 ? [{ href: "/#opiniones", label: "Opiniones" }] : []),
  { href: "/#preguntas", label: "Preguntas" },
  { href: "/#sobre-mel", label: "Sobre Mel" },
];
