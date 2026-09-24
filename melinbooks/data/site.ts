/**
 * Datos generales de Mel In Books.
 *
 * Todo lo que es "del negocio" (WhatsApp, redes, medios de pago, textos
 * comerciales) vive acá. Cambiar un valor en este archivo lo cambia en
 * todo el sitio.
 *
 * Fuentes: sitio de Canva (melinbooks.my.canva.site y
 * icsecatedras.my.canva.site), Linktree e Instagram (@melinbooks),
 * relevados en septiembre de 2026.
 */

export const site = {
  name: "Mel In Books",
  /** Frase corta que acompaña al nombre en títulos y buscadores. */
  tagline: "Resúmenes y material de estudio",
  /** Descripción para Google y para cuando se comparte el link. */
  description:
    "Resúmenes claros, ordenados y actualizados para UBA XXI, CBC y Edición (FILO). Elegí tu materia y cátedra, armá tu pedido y enviáselo a Mel por WhatsApp.",

  owner: {
    name: "Melina Correa",
    nickname: "Mel",
    photo: "/img/mel.webp",
  },

  /**
   * WhatsApp de Mel. Solo números: código de país (54) + 9 + código de área
   * sin 0 + número sin 15. Ejemplo: 54 9 11 6162-7734 → "5491161627734".
   */
  whatsapp: {
    number: "5491161627734",
    display: "+54 9 11 6162-7734",
  },

  social: {
    instagram: { handle: "@melinbooks", url: "https://www.instagram.com/melinbooks/" },
    tiktok: { handle: "@melinbooks", url: "https://www.tiktok.com/@melinbooks" },
    facebook: { handle: "Mel In Books", url: "https://www.facebook.com/profile.php?id=61576320191862" },
    goodreads: { handle: "Mel", url: "https://www.goodreads.com/user/show/138233407" },
  },

  /** Medios de pago confirmados por Mel (historias destacadas "Q&A"). */
  payment: {
    methods: ["Alias de Mercado Pago", "Transferencia bancaria"],
    summary: "Pagás con alias de Mercado Pago o por transferencia bancaria.",
  },

  /** Cómo se entrega el material (sitio de Canva + historias "Q&A"). */
  delivery: {
    format: "PDF digital de alta calidad",
    channels: ["WhatsApp", "Correo electrónico"] as const,
    summary:
      "Te llega en PDF por WhatsApp o por correo, apenas Mel recibe el comprobante de pago.",
  },

  /**
   * Promociones vigentes publicadas por Mel. Si alguna deja de valer,
   * borrala de esta lista y desaparece del sitio.
   */
  promos: {
    /** Descuento automático por comprar varias materias el mismo día. */
    multiSubject: {
      enabled: true,
      minSubjects: 2,
      percent: 10,
      text: "Si comprás 2 o más materias el mismo día, tenés 10% de descuento.",
    },
    notes: [
      "Los combos completos (de final) vienen con descuento y regalos que no incluyen las compras por separado.",
      "Cada tanto hay descuentos especiales que Mel anuncia en sus historias de Instagram.",
    ],
  },

  /** Búsquedas sugeridas debajo del buscador. */
  popularSearches: ["IPC", "ICSE", "Semiología", "Sociología", "Psicología", "Biología", "Química", "Edición"],
} as const;

export type SiteConfig = typeof site;

/** URL pública del sitio, sin barra final. */
export function getSiteUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return (fromEnv || "http://localhost:3000").replace(/\/$/, "");
}
