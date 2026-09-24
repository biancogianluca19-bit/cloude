/**
 * Preguntas frecuentes.
 *
 * Respuestas basadas en lo que Mel publicó en su web de Canva y en las
 * historias destacadas "Q&A" de Instagram. Para agregar una pregunta,
 * sumá un objeto a la lista; el orden de la lista es el orden en la web.
 */

export type Faq = { question: string; answer: string[] };

export const faqs: Faq[] = [
  {
    question: "¿Cómo compro un resumen?",
    answer: [
      "Buscá tu materia en el catálogo, elegí la cátedra y qué parte necesitás (un parcial, el combo o el final) y sumala a tu pedido.",
      "Cuando tengas todo, tocá “Pedir por WhatsApp”. Se abre un chat con Mel con el pedido ya escrito, y ahí seguís la compra.",
    ],
  },
  {
    question: "¿Qué medios de pago aceptás?",
    answer: ["Alias de Mercado Pago o transferencia bancaria. Mel te pasa los datos por WhatsApp."],
  },
  {
    question: "¿Cómo recibo el material?",
    answer: [
      "Por WhatsApp o por correo, en PDF digital de alta calidad.",
      "Por seguridad, los resúmenes se envían después de recibir el comprobante de pago.",
    ],
  },
  {
    question: "¿Los puedo imprimir?",
    answer: [
      "Sí. Están diseñados para estudiar tanto en digital (tablet, iPad, celular o computadora) como impresos.",
    ],
  },
  {
    question: "¿Los resúmenes están actualizados?",
    answer: [
      "Sí. El material sigue el programa y la bibliografía vigente de cada materia para este cuatrimestre.",
      "Si notás que falta algo del programa, avisale a Mel y te envía el material adicional sin costo.",
    ],
  },
  {
    question: "¿Qué incluyen los resúmenes completos?",
    answer: [
      "Todos los contenidos teóricos desarrollados paso a paso, esquemas visuales, dibujos explicativos, cuadros comparativos y tips clave para preparar los parciales.",
    ],
  },
  {
    question: "¿Puedo comprar por parcial o por unidad?",
    answer: [
      "Sí. Podés comprar por parcial, por unidad, por autor o el resumen completo. Si después necesitás el resto, lo sumás cuando quieras.",
    ],
  },
  {
    question: "¿Hay descuentos o promociones?",
    answer: [
      "Si comprás 2 o más materias el mismo día, tenés 10% de descuento.",
      "Los combos completos (de final) vienen con descuento y regalos que no incluyen las compras por separado. Además, cada tanto hay descuentos especiales que Mel anuncia en sus historias de Instagram.",
    ],
  },
  {
    question: "¿Cómo funcionan los combos de final?",
    answer: [
      "El combo incluye todo el material de la materia y cualquier material adicional disponible, de regalo y a precio promocional.",
    ],
  },
  {
    question: "¿Por qué me envían el índice?",
    answer: [
      "Para que veas qué incluye el material antes de comprarlo, lo compares con tu programa y compres con tranquilidad.",
    ],
  },
  {
    question: "¿Qué pasa si no encuentro mi materia?",
    answer: [
      "Escribile a Mel. Podés consultar por resúmenes personalizados o por materiales que todavía no están publicados.",
    ],
  },
];
