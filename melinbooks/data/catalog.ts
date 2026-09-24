/**
 * CATÁLOGO DE MEL IN BOOKS
 *
 * Este es el único archivo que hay que tocar para agregar, quitar o
 * modificar materiales. El buscador, los filtros, las páginas de cada
 * resumen, el pedido y el sitemap se arman solos a partir de acá.
 *
 * Cómo agregar un resumen nuevo (ver también el README):
 *   1. Subí la portada a /public/img/covers/ (ideal: .webp horizontal).
 *   2. Copiá un bloque de la lista `products` de abajo y cambiá los datos.
 *   3. El `slug` tiene que ser único, en minúsculas y sin espacios
 *      (es la dirección de la página: /resumen/<slug>).
 *
 * Precios, páginas y cátedras tomados del sitio de Canva de Mel
 * (septiembre de 2026). Los precios están en pesos argentinos.
 */

/* ------------------------------------------------------------------ */
/* Programas y grupos                                                  */
/* ------------------------------------------------------------------ */

export type ProgramId = "uba-xxi" | "cbc" | "edicion" | "extras";

export type Program = {
  id: ProgramId;
  name: string;
  /** Nombre corto para chips y etiquetas. */
  short: string;
  description: string;
  /** Cómo se llaman los grupos dentro del programa (ej. "Año de la carrera"). */
  groupLabel: string;
  groups: { id: string; name: string }[];
  /** Palabras extra con las que alguien podría buscar este programa. */
  keywords: string[];
};

export const programs: Program[] = [
  {
    id: "uba-xxi",
    name: "UBA XXI",
    short: "UBA XXI",
    description: "Materias del Ciclo Básico a distancia, organizadas por orientación.",
    groupLabel: "Orientación",
    groups: [
      { id: "sociales", name: "Sociales" },
      { id: "medicina", name: "Medicina" },
      { id: "derecho", name: "Derecho" },
      { id: "economicas", name: "Económicas" },
    ],
    keywords: ["uba 21", "ubaxxi", "ciclo basico", "a distancia", "ingreso"],
  },
  {
    id: "cbc",
    name: "CBC",
    short: "CBC",
    description: "Resúmenes para cursar el Ciclo Básico Común presencial.",
    groupLabel: "Orientación",
    groups: [
      { id: "sociales", name: "Sociales" },
      { id: "medicina", name: "Medicina" },
    ],
    keywords: ["ciclo basico comun", "ingreso"],
  },
  {
    id: "edicion",
    name: "Edición (FILO)",
    short: "Edición",
    description:
      "Materias de la carrera de Edición, hechas por una estudiante de la carrera. Todas de materias aprobadas.",
    groupLabel: "Año de la carrera",
    groups: [
      { id: "ingresante", name: "Ingresantes" },
      { id: "primer-anio", name: "Primer año" },
      { id: "segundo-anio", name: "Segundo año" },
    ],
    keywords: ["filo", "filosofia y letras", "editorial", "edicion"],
  },
  {
    id: "extras",
    name: "Extras",
    short: "Extras",
    description: "Material complementario, cursos, seminarios y servicios, incluidas las clases de inglés.",
    groupLabel: "Tipo",
    groups: [
      { id: "complementario", name: "Material complementario" },
      { id: "cursos", name: "Cursos y seminarios" },
      { id: "servicios", name: "Servicios" },
    ],
    keywords: ["extra", "adicional"],
  },
];

/* ------------------------------------------------------------------ */
/* Productos                                                           */
/* ------------------------------------------------------------------ */

export type PurchaseOption = {
  id: string;
  /** Cómo se muestra (ej. "1.er parcial", "Combo ambos parciales"). */
  label: string;
  /** Precio en pesos. Si no está, se muestra "a consultar". */
  price?: number;
};

export type ProductKind = "resumen" | "curso" | "seminario" | "servicio";

export type Product = {
  slug: string;
  /** Nombre corto o sigla con el que la gente busca la materia (ej. "IPC"). */
  subject: string;
  /** Nombre completo de la materia o material. */
  title: string;
  /** Cátedra o docente. */
  catedra?: string;
  /** Aclaración corta al lado de la cátedra (ej. "Intensivo"). */
  catedraNote?: string;
  kind: ProductKind;
  /** Dónde aparece en el catálogo. Puede estar en más de un lugar. */
  listings: { program: ProgramId; group: string }[];
  /** Cantidad de páginas, tal como la publica Mel. */
  pages?: string;
  /** Datos cortos que publica Mel en la ficha (actualización, alcance, etc.). */
  facts?: string[];
  /** Descripción breve. Si falta, se arma una automáticamente. */
  description?: string;
  /** Índice / contenidos, si Mel lo publicó. */
  index?: string[];
  /** Portada. Ruta dentro de /public. */
  cover: string;
  /** Imágenes adicionales (fichas, índices). */
  gallery?: string[];
  options: PurchaseOption[];
  /** Palabras extra para el buscador. */
  keywords?: string[];
};

/* Ayudas para no repetir las mismas opciones en cada producto. */

/** "Precio por parcial" + "Combo ambos parciales". */
function perParcial(parcial: number, combo: number, comboLabel = "Combo ambos parciales"): PurchaseOption[] {
  return [
    { id: "parcial-1", label: "1.er parcial", price: parcial },
    { id: "parcial-2", label: "2.º parcial", price: parcial },
    { id: "combo", label: comboLabel, price: combo },
  ];
}

function single(label: string, price?: number): PurchaseOption[] {
  return [{ id: "completo", label, price }];
}

const IPC_TITLE = "Introducción al Pensamiento Científico";
const ICSE_TITLE = "Introducción al Conocimiento de la Sociedad y el Estado";

export const products: Product[] = [
  /* ---------------- UBA XXI · Sociales ---------------- */
  {
    slug: "ipc-perot",
    subject: "IPC",
    title: IPC_TITLE,
    catedra: "Perot",
    kind: "resumen",
    listings: [
      { program: "uba-xxi", group: "sociales" },
      { program: "edicion", group: "ingresante" },
    ],
    pages: "19",
    facts: ["12 capítulos, dividido por partes", "Material completo para el CBC"],
    index: [
      "Cap. 1: Nociones básicas de la lógica",
      "Cap. 2: Confirmacionismo",
      "Cap. 3: Falsacionismo",
      "Cap. 4: Los problemas de la filosofía clásica de la ciencia",
      "Cap. 5: Thomas Kuhn",
      "Cap. 6: Imre Lakatos",
      "Cap. 7: La filosofía política de la ciencia",
      "Cap. 8: La epistemología social",
      "Cap. 9: La epistemología feminista",
      "Cap. 10: La influencia de los valores institucionales",
      "Cap. 11: Ciencia, sociedad y comunicación",
      "Cap. 12: El aporte de los enfoques críticos",
    ],
    cover: "/img/covers/ipc.webp",
    gallery: ["/img/fichas/ipc-perot.webp"],
    options: single("Resumen completo", 13500),
    keywords: ["pensamiento cientifico", "epistemologia"],
  },
  {
    slug: "ipc-buacar",
    subject: "IPC",
    title: IPC_TITLE,
    catedra: "Buacar",
    kind: "resumen",
    listings: [
      { program: "uba-xxi", group: "sociales" },
      { program: "edicion", group: "ingresante" },
    ],
    pages: "15",
    facts: ["Realizado en 2022", "Materia promocionada y hecha por UBA XXI", "Material completo para el CBC"],
    index: [
      "Unidad 1: La argumentación (concepto, estructura, clasificación de oraciones, expresiones lógicas, argumentos, sistemas axiomáticos)",
      "Unidad 2: La ciencia y su historia (términos y teorías, contrastación)",
      "Unidad 3: Cuestiones epistemológicas (pilares de la filosofía, empirismo, falsacionismo)",
      "Unidad 4: Dimensión ético-política (Kuhn, feminismo, cientificismo, practicismo, humanismo)",
    ],
    cover: "/img/covers/ipc.webp",
    gallery: ["/img/fichas/ipc-buacar.webp"],
    options: perParcial(6000, 10000),
    keywords: ["pensamiento cientifico"],
  },
  {
    slug: "ipc-gimeno",
    subject: "IPC",
    title: IPC_TITLE,
    catedra: "Gimeno",
    kind: "resumen",
    listings: [
      { program: "uba-xxi", group: "sociales" },
      { program: "edicion", group: "ingresante" },
    ],
    pages: "27",
    facts: ["Material completo para UBA XXI"],
    index: [
      "Unidad 1: ¿Qué es la ciencia? / Argumento / Las desventuras del conocimiento científico / La lógica de la investigación",
      "Unidad 2: Las trampas de Circe / Contrastación / Falacias / Pseudociencia / Reglas de la argumentación / Probabilidad y causalidad / Conceptos científicos",
      "Unidad 3: Copérnico y Darwin / Redacción científica / Nueva producción / De animales a dioses / Revolución científica y copernicana / Universidad",
      "Unidad 4: Kuhn / Evaluaciones / Perspectiva actual del entorno de la ciencia / La idea del progreso de la ciencia / La observación científica / La ética de la encrucijada",
    ],
    cover: "/img/covers/ipc.webp",
    gallery: ["/img/fichas/ipc-gimeno.webp"],
    options: perParcial(10000, 18000),
    keywords: ["pensamiento cientifico"],
  },
  {
    slug: "icse-pedrosa",
    subject: "ICSE",
    title: ICSE_TITLE,
    catedra: "Pedrosa",
    kind: "resumen",
    listings: [
      { program: "uba-xxi", group: "sociales" },
      { program: "edicion", group: "ingresante" },
    ],
    pages: "33",
    facts: ["Actualizado en 2026"],
    index: [
      "Pedrosa, F., Deich, F. y Yannuzzi, N. Herramientas para analizar la sociedad y el Estado: conceptos clave para reflexionar sobre los tiempos actuales. Eudeba.",
      "Pedrosa, F. y Federico, A. (2025). Debates para un mundo en transformación: desafíos políticos, sociales y tecnológicos del siglo XXI. Eudeba.",
      "Romero, L. A. (2017). Breve historia contemporánea de la Argentina 1916-2016. Fondo de Cultura Económica.",
    ],
    cover: "/img/covers/icse.webp",
    gallery: ["/img/fichas/icse-pedrosa.webp"],
    options: [
      { id: "parcial-1", label: "1.er parcial", price: 12500 },
      { id: "parcial-2", label: "2.º parcial", price: 12500 },
      { id: "completo", label: "Resumen completo", price: 24000 },
    ],
    keywords: ["sociedad y estado"],
  },
  {
    slug: "icse-denkberg",
    subject: "ICSE",
    title: ICSE_TITLE,
    catedra: "Denkberg",
    catedraNote: "Intensivo",
    kind: "resumen",
    listings: [
      { program: "uba-xxi", group: "sociales" },
      { program: "edicion", group: "ingresante" },
    ],
    pages: "23",
    facts: ["Intensivo de UBA XXI", "Se compra para el parcial integrador"],
    index: [
      "Fernández",
      "Oszlak",
      "Abal Medina",
      "García Delgado",
      "Transformación de la sociedad argentina",
      "Cueto y Luzzi",
      "Belini y Korol",
      "Walner",
      "Bauman, Z.",
      "Han, B.-C.",
      "Barrancos, D.",
      "Lamas, M.",
      "Godio, J.",
      "Ministerio de Trabajo",
      "Seoane, J.",
    ],
    cover: "/img/covers/icse.webp",
    gallery: ["/img/fichas/icse-denkberg.webp"],
    options: single("Parcial integrador", 16000),
    keywords: ["sociedad y estado", "intensivo", "integrador"],
  },
  {
    slug: "icse-cagnacci",
    subject: "ICSE",
    title: ICSE_TITLE,
    catedra: "Cagnacci",
    kind: "resumen",
    listings: [
      { program: "uba-xxi", group: "sociales" },
      { program: "edicion", group: "ingresante" },
    ],
    pages: "41",
    facts: ["Realizado en 2026"],
    index: [
      "La sociedad, el Estado y las instituciones",
      "Hacia la conceptualización del Estado",
      "Tipos de Estado",
      "Regímenes políticos",
      "Sistemas políticos contemporáneos",
      "Capítulos 1 a 9",
      "La era radical",
      "Golpes de Estado",
      "La economía del primer peronismo",
      "Consideraciones sobre el populismo",
      "Terrorismo de Estado",
      "Transición de la democracia",
      "Democracia delegativa",
    ],
    cover: "/img/covers/icse.webp",
    gallery: ["/img/fichas/icse-cagnacci.webp"],
    options: [
      { id: "parcial-1", label: "1.er parcial", price: 15000 },
      { id: "parcial-2", label: "2.º parcial", price: 15000 },
      { id: "completo", label: "Resumen completo", price: 28000 },
    ],
    keywords: ["sociedad y estado"],
  },
  {
    slug: "semiologia-verzero",
    subject: "Semiología",
    title: "Semiología",
    catedra: "Verzero",
    kind: "resumen",
    listings: [
      { program: "uba-xxi", group: "sociales" },
      { program: "edicion", group: "ingresante" },
    ],
    pages: "31",
    description: "Resumen completo y organizado de los contenidos principales de la materia.",
    cover: "/img/covers/semiologia.webp",
    options: perParcial(12000, 20000),
    keywords: ["semio"],
  },
  {
    slug: "sociologia-bustos",
    subject: "Sociología",
    title: "Sociología",
    catedra: "Bustos",
    kind: "resumen",
    listings: [{ program: "uba-xxi", group: "sociales" }],
    pages: "22",
    cover: "/img/covers/sociologia.webp",
    options: perParcial(8000, 15000),
    keywords: ["socio"],
  },
  {
    slug: "psicologia-quattrocchi",
    subject: "Psicología",
    title: "Psicología",
    catedra: "Quattrocchi",
    kind: "resumen",
    listings: [{ program: "uba-xxi", group: "sociales" }],
    pages: "36",
    cover: "/img/covers/psicologia.webp",
    options: perParcial(13500, 25000, "Combo"),
    keywords: ["psico"],
  },

  /* ---------------- UBA XXI · Medicina ---------------- */
  {
    slug: "quimica-ferreira",
    subject: "Química",
    title: "Química",
    catedra: "Ferreira",
    kind: "resumen",
    listings: [{ program: "uba-xxi", group: "medicina" }],
    pages: "30",
    cover: "/img/covers/quimica.webp",
    options: perParcial(12000, 20000),
  },
  {
    slug: "biologia-bracchitta",
    subject: "Biología",
    title: "Biología",
    catedra: "Bracchitta",
    kind: "resumen",
    listings: [{ program: "uba-xxi", group: "medicina" }],
    pages: "34",
    cover: "/img/covers/biologia-bracchitta.webp",
    options: perParcial(12500, 24000),
    keywords: ["bio"],
  },

  /* ---------------- UBA XXI · Derecho ---------------- */
  {
    slug: "ciencia-politica-lopreite",
    subject: "Ciencia Política",
    title: "Ciencia Política",
    catedra: "Lopreite",
    catedraNote: "Intensiva",
    kind: "resumen",
    listings: [{ program: "uba-xxi", group: "derecho" }],
    pages: "29",
    cover: "/img/covers/ciencia-politica.webp",
    options: perParcial(12000, 20000),
    keywords: ["politica", "intensivo"],
  },
  {
    slug: "derecho-constitucional-gonzalez",
    subject: "Derecho Constitucional",
    title: "Derecho Constitucional",
    catedra: "González",
    catedraNote: "Intensivo",
    kind: "resumen",
    listings: [{ program: "uba-xxi", group: "derecho" }],
    pages: "27",
    cover: "/img/covers/derecho-constitucional.webp",
    options: perParcial(10000, 18000),
    keywords: ["derecho const", "constitucional", "intensivo"],
  },

  /* ---------------- UBA XXI · Económicas ---------------- */
  {
    slug: "hesg-roman-leo",
    subject: "HESG",
    title: "Historia Económica y Social General",
    catedra: "Roman / Mariela Leo",
    kind: "resumen",
    listings: [{ program: "uba-xxi", group: "economicas" }],
    pages: "21",
    cover: "/img/covers/hesg.webp",
    options: perParcial(8000, 15000),
    keywords: ["historia"],
  },
  {
    slug: "economia-di-pelino",
    subject: "Economía",
    title: "Economía",
    catedra: "Di Pelino",
    kind: "resumen",
    listings: [{ program: "uba-xxi", group: "economicas" }],
    pages: "47",
    cover: "/img/covers/economia.webp",
    options: perParcial(16000, 30000),
  },

  /* ---------------- CBC ---------------- */
  {
    slug: "ipc-paruelo",
    subject: "IPC",
    title: IPC_TITLE,
    catedra: "Paruelo",
    catedraNote: "Cátedra 26",
    kind: "resumen",
    listings: [{ program: "cbc", group: "sociales" }],
    pages: "26",
    facts: ["Material completo para el CBC"],
    description:
      "Material completo que sintetiza las ideas fundamentales de la materia, organizado por autores y conceptos para estudiar de forma práctica y ordenada.",
    index: [
      "Una historia de las teorías cosmológicas",
      "De la ciencia antigua a la moderna",
      "Elementos de lógica proposicional",
      "Algunos casos de la historia de la ciencia",
      "Los métodos y la ciencia",
      "Teoría empírica",
      "Leyes universales y estadísticas",
      "Inductivismo y falsacionismo",
      "Programa de investigación de Lakatos",
      "Kuhn",
      "Origen de las ideas darwinianas",
      "Las ciencias sociales",
      "Visiones feministas de la ciencia",
    ],
    cover: "/img/covers/ipc-paruelo.webp",
    gallery: ["/img/fichas/ipc-paruelo.webp"],
    options: [
      { id: "parcial-1", label: "1.er parcial", price: 10000 },
      { id: "parcial-2", label: "2.º parcial", price: 10000 },
      { id: "completo", label: "Resumen completo", price: 18000 },
    ],
    keywords: ["pensamiento cientifico", "catedra 26", "26"],
  },
  {
    slug: "biologia-gimenez",
    subject: "Biología",
    title: "Biología (08)",
    catedra: "Giménez",
    kind: "resumen",
    listings: [{ program: "cbc", group: "medicina" }],
    pages: "43",
    cover: "/img/covers/biologia-gimenez.webp",
    options: perParcial(16000, 30000),
    keywords: ["bio", "08", "biologia 08"],
  },

  /* ---------------- Edición (FILO) · Primer año ---------------- */
  {
    slug: "iae",
    subject: "IAE",
    title: "Introducción a la Actividad Editorial",
    kind: "resumen",
    listings: [{ program: "edicion", group: "primer-anio" }],
    pages: "36",
    cover: "/img/covers/iae.webp",
    options: perParcial(13000, 25000, "Combo"),
  },
  {
    slug: "dea",
    subject: "DEA",
    title: "Derechos Editoriales y del Autor",
    kind: "resumen",
    listings: [{ program: "edicion", group: "primer-anio" }],
    pages: "47",
    cover: "/img/covers/dea.webp",
    options: perParcial(18000, 33000, "Combo"),
    keywords: ["derecho de autor"],
  },
  {
    slug: "rome",
    subject: "ROME",
    title: "Registro y Organización de Materiales Editoriales",
    kind: "resumen",
    listings: [{ program: "edicion", group: "primer-anio" }],
    pages: "52",
    cover: "/img/covers/rome.webp",
    options: perParcial(18000, 35000, "Combo"),
  },
  {
    slug: "iape",
    subject: "IAPE",
    title: "Informática Aplicada a la Producción Editorial",
    kind: "resumen",
    listings: [{ program: "edicion", group: "primer-anio" }],
    pages: "34",
    cover: "/img/covers/iape.webp",
    options: perParcial(12500, 24000, "Combo"),
    keywords: ["informatica"],
  },
  {
    slug: "tmc",
    subject: "TMC",
    title: "Teoría de los Medios y de la Cultura",
    kind: "resumen",
    listings: [{ program: "edicion", group: "primer-anio" }],
    pages: "39",
    cover: "/img/covers/tmc.webp",
    options: perParcial(15000, 28000, "Combo"),
    keywords: ["medios"],
  },
  {
    slug: "aee",
    subject: "AEE",
    title: "Administración de la Empresa Editorial",
    kind: "resumen",
    listings: [{ program: "edicion", group: "primer-anio" }],
    pages: "16",
    cover: "/img/covers/aee.webp",
    options: perParcial(8000, 12000, "Combo"),
    keywords: ["administracion"],
  },

  /* ---------------- Edición (FILO) · Segundo año ---------------- */
  {
    slug: "fdge",
    subject: "FDGE",
    title: "Fundamentos del Diseño Gráfico para Editores",
    kind: "resumen",
    listings: [{ program: "edicion", group: "segundo-anio" }],
    pages: "49",
    cover: "/img/covers/fdge.webp",
    options: perParcial(18000, 35000, "Combo"),
    keywords: ["diseño grafico", "diseno"],
  },
  {
    slug: "epp",
    subject: "EPP",
    title: "Edición de Publicaciones Periódicas",
    kind: "resumen",
    listings: [{ program: "edicion", group: "segundo-anio" }],
    pages: "32 / 44",
    cover: "/img/covers/epp.webp",
    options: [
      { id: "parcial", label: "Parcial", price: 20000 },
      { id: "final", label: "Final", price: 30000 },
      { id: "combo", label: "Combo completo", price: 40000 },
    ],
    keywords: ["publicaciones periodicas", "revistas", "diarios"],
  },
  {
    slug: "iaae",
    subject: "IAAE",
    title: "Informática Aplicada a la Administración Editorial",
    kind: "resumen",
    listings: [{ program: "edicion", group: "segundo-anio" }],
    pages: "33",
    facts: ["Versión 2026"],
    cover: "/img/covers/iaae.webp",
    options: perParcial(12500, 24000, "Combo"),
    keywords: ["informatica", "2026"],
  },
  {
    slug: "fpi",
    subject: "FPI",
    title: "Fundamentos de la Producción de Impresos",
    kind: "resumen",
    listings: [{ program: "edicion", group: "segundo-anio" }],
    pages: "22",
    cover: "/img/covers/fpi.webp",
    options: single("Final", 15000),
    keywords: ["impresos", "imprenta"],
  },

  /* ---------------- Extras · Material complementario ---------------- */
  {
    slug: "epistemologia-glavich",
    subject: "Epistemología",
    title: "Epistemología",
    catedra: "Glavich",
    kind: "resumen",
    listings: [{ program: "extras", group: "complementario" }],
    description:
      "Un resumen claro y organizado de los principales conceptos de la materia, pensado para facilitar la comprensión.",
    cover: "/img/covers/epistemologia.webp",
    options: single("Resumen"),
  },
  {
    slug: "portugues-elemental",
    subject: "Portugués",
    title: "Portugués elemental",
    kind: "resumen",
    listings: [{ program: "extras", group: "complementario" }],
    pages: "9",
    cover: "/img/covers/portugues.webp",
    options: perParcial(4000, 7000, "Combo"),
    keywords: ["idioma", "portugues"],
  },
  {
    slug: "iaae-2025",
    subject: "IAAE",
    title: "Informática Aplicada a la Administración Editorial",
    catedraNote: "Edición 2025",
    kind: "resumen",
    listings: [{ program: "extras", group: "complementario" }],
    pages: "36",
    facts: ["Versión 2025 de la materia"],
    cover: "/img/covers/iaae-2025.webp",
    options: perParcial(13500, 25000, "Combo"),
    keywords: ["informatica", "2025"],
  },

  /* ---------------- Extras · Cursos y seminarios ---------------- */
  {
    slug: "leer-para-editar",
    subject: "Leer para editar",
    title: "Leer para editar",
    kind: "seminario",
    listings: [{ program: "extras", group: "cursos" }],
    pages: "40",
    description:
      "Un resumen que reúne los ejes principales del seminario y organiza la bibliografía de manera sintética para acompañar la cursada y la preparación de evaluaciones.",
    cover: "/img/covers/leer-para-editar.webp",
    options: single("Completo", 28000),
    keywords: ["seminario"],
  },
  {
    slug: "curso-de-genero",
    subject: "Curso de género",
    title: "Curso de género",
    kind: "curso",
    listings: [{ program: "extras", group: "cursos" }],
    pages: "10",
    description:
      "Un curso que te acerca a las principales perspectivas y conceptos sobre género de forma clara, accesible y organizada.",
    cover: "/img/covers/curso-de-genero.webp",
    options: single("Completo", 7000),
    keywords: ["genero", "curso"],
  },

  /* ---------------- Extras · Servicios ---------------- */
  {
    slug: "clases-de-ingles",
    subject: "Clases de inglés",
    title: "Clases de inglés",
    kind: "servicio",
    listings: [{ program: "extras", group: "servicios" }],
    description:
      "Clases personalizadas para estudiantes y profesionales, adaptadas a tus objetivos, tu nivel y tu ritmo de aprendizaje. También hace trabajos prácticos.",
    cover: "/img/covers/clases-de-ingles.webp",
    options: single("Consulta"),
    keywords: ["ingles", "english", "idioma", "trabajos practicos", "tp"],
  },
  {
    slug: "resumenes-personalizados",
    subject: "Resumen personalizado",
    title: "Resúmenes personalizados",
    kind: "servicio",
    listings: [{ program: "extras", group: "servicios" }],
    description:
      "¿Necesitás resumir un material específico? Mel arma resúmenes personalizados, organizados y adaptados a la bibliografía que necesites.",
    cover: "/img/covers/resumenes-personalizados.webp",
    options: single("Consulta"),
    keywords: ["personalizado", "a medida", "encargo"],
  },
];
