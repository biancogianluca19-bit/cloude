import type { NumericSpec, Step, Trap, Unit, ChoiceSpec } from "./types.ts";
import { fmtNumber as f } from "./format.ts";
import { evalExpr } from "./expr.ts";

// Biblioteca de conocimiento académico GENERAL (no atribuido a ningún profesor).
// Cada tema trae plantillas paramétricas: los números cambian en cada ejercicio
// y la solución se calcula, así que nunca se copian ejercicios del material.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Número "redondo" entre min y max, múltiplo de step. */
export function pick(r: Rng, min: number, max: number, step = 1): number {
  const n = Math.floor((max - min) / step);
  return Math.round((min + Math.floor(r() * (n + 1)) * step) * 1e6) / 1e6;
}

export interface Template {
  key: string;
  topic: string;
  title: string;
  excelDefault?: boolean;
  difficulty: 1 | 2 | 3;
  build: (r: Rng) => {
    data: Record<string, number>;
    statement: string;
  };
  dataLabels: Record<string, string>;
  dataFormats: Record<string, Unit>;
  steps: Step[];
  traps: Trap[];
  hints: string[];
  explanation: string;
}

export interface LibraryTopic {
  key: string;
  name: string;
  area: "costos" | "finanzas" | "operaciones" | "impuestos";
  unit: string;
  keywords: string[];
  prereqs: string[];
  description: string;
  theory: Omit<ChoiceSpec, "title" | "hints">[];
}

export const TOPICS: LibraryTopic[] = [
  {
    key: "elementos_costo",
    name: "Elementos del costo",
    area: "costos",
    unit: "Unidad 1",
    keywords: ["elementos del costo", "costo primo", "costo de conversion", "materia prima", "mano de obra", "carga fabril", "costos indirectos"],
    prereqs: [],
    description: "Materia prima, mano de obra directa y carga fabril; costo primo y costo de conversión.",
    theory: [
      {
        kind: "mc",
        question: "¿Qué elementos forman el costo de conversión?",
        options: ["Materia prima y mano de obra directa", "Mano de obra directa y carga fabril", "Materia prima y carga fabril", "Solo la carga fabril"],
        correct: 1,
        explanation: "El costo de conversión es lo que cuesta transformar la materia prima: mano de obra directa + carga fabril.",
        tag: "confunde_primo_conversion",
        errorLabel: "Confunde costo primo con costo de conversión",
      },
      {
        kind: "vf",
        question: "El costo primo incluye la carga fabril.",
        options: ["Verdadero", "Falso"],
        correct: 1,
        explanation: "Falso. Costo primo = materia prima + mano de obra directa.",
        tag: "confunde_primo_conversion",
        errorLabel: "Confunde costo primo con costo de conversión",
      },
    ],
  },
  {
    key: "materia_prima",
    name: "Materia prima: consumo e inventarios",
    area: "costos",
    unit: "Unidad 2",
    keywords: ["materia prima", "ppp", "peps", "ueps", "precio promedio ponderado", "consumo", "inventario", "existencia"],
    prereqs: ["elementos_costo"],
    description: "Valuación del consumo de materia prima con PPP y PEPS.",
    theory: [
      {
        kind: "mc",
        question: "Con precios en alza, ¿qué método asigna el menor costo al consumo de materia prima?",
        options: ["PEPS (FIFO)", "UEPS (LIFO)", "Precio promedio ponderado", "Todos dan el mismo costo"],
        correct: 0,
        explanation: "Con PEPS salen primero las unidades más viejas, que son las más baratas cuando los precios suben.",
      },
    ],
  },
  {
    key: "mano_obra",
    name: "Mano de obra directa",
    area: "costos",
    unit: "Unidad 2",
    keywords: ["mano de obra", "jornal", "cargas sociales", "costo horario", "horas hombre", "salario", "contribuciones"],
    prereqs: ["elementos_costo"],
    description: "Costo horario con cargas sociales y costo total de la mano de obra directa.",
    theory: [
      {
        kind: "vf",
        question: "El costo de la mano de obra directa incluye las cargas sociales del empleador.",
        options: ["Verdadero", "Falso"],
        correct: 0,
        explanation: "Verdadero. Las contribuciones patronales son parte del costo de la hora trabajada.",
        tag: "olvida_cargas_sociales",
        errorLabel: "Olvida sumar las cargas sociales al costo de la mano de obra",
      },
    ],
  },
  {
    key: "carga_fabril",
    name: "Carga fabril y tasa predeterminada",
    area: "costos",
    unit: "Unidad 3",
    keywords: ["carga fabril", "costos indirectos", "cif", "tasa predeterminada", "cuota", "subaplicacion", "sobreaplicacion", "horas maquina", "presupuestada", "aplicada"],
    prereqs: ["elementos_costo"],
    description: "Tasa predeterminada, carga fabril aplicada y variación (sub o sobreaplicación).",
    theory: [
      {
        kind: "mc",
        question: "Si la carga fabril real supera a la aplicada, hay:",
        options: ["Sobreaplicación", "Subaplicación", "Variación de eficiencia favorable", "Ninguna variación"],
        correct: 1,
        explanation: "Se aplicó menos de lo que realmente se gastó: subaplicación.",
        tag: "signo_sub_sobre",
        errorLabel: "Confunde subaplicación con sobreaplicación",
      },
      {
        kind: "vf",
        question: "La tasa predeterminada se calcula con los datos reales del período.",
        options: ["Verdadero", "Falso"],
        correct: 1,
        explanation: "Falso. Se calcula con datos presupuestados: carga fabril presupuestada ÷ base presupuestada.",
        tag: "tasa_con_datos_reales",
        errorLabel: "Calcula la tasa predeterminada con datos reales en lugar de presupuestados",
      },
    ],
  },
  {
    key: "costo_produccion",
    name: "Costo de producción y costo unitario",
    area: "costos",
    unit: "Unidad 3",
    keywords: ["costo de produccion", "costo unitario", "produccion terminada", "unidades terminadas", "producidas", "inventario final"],
    prereqs: ["materia_prima", "mano_obra", "carga_fabril"],
    description: "Costo de producción del período y costo unitario sobre la producción terminada.",
    theory: [
      {
        kind: "mc",
        question: "El costo unitario de producción se obtiene dividiendo el costo de producción por:",
        options: ["Las unidades vendidas", "Las unidades terminadas", "Las unidades presupuestadas", "El precio de venta"],
        correct: 1,
        explanation: "Se divide por lo producido (terminado). Lo vendido se usa después para el costo de ventas.",
        tag: "divide_por_vendidas",
        errorLabel: "Confunde producción terminada con producción vendida",
      },
    ],
  },
  {
    key: "costo_ventas",
    name: "Estado de costos y costo de ventas",
    area: "costos",
    unit: "Unidad 3",
    keywords: ["costo de ventas", "estado de costos", "inventario inicial", "inventario final", "productos terminados", "compras", "costo de lo vendido"],
    prereqs: ["costo_produccion"],
    description: "Consumo de materia prima, costo de producción terminada y costo de ventas con inventarios.",
    theory: [
      {
        kind: "vf",
        question: "Costo de ventas = inventario inicial de productos terminados + costo de producción terminada − inventario final de productos terminados.",
        options: ["Verdadero", "Falso"],
        correct: 0,
        explanation: "Verdadero. Es el flujo de costos del almacén de productos terminados.",
        tag: "ignora_inventario_pt",
        errorLabel: "Ignora los inventarios de productos terminados al calcular el costo de ventas",
      },
    ],
  },
  {
    key: "contribucion_marginal",
    name: "Contribución marginal",
    area: "costos",
    unit: "Unidad 4",
    keywords: ["contribucion marginal", "margen de contribucion", "costo variable", "razon de contribucion", "cmu", "costos fijos"],
    prereqs: ["elementos_costo"],
    description: "Contribución marginal unitaria, total y razón de contribución.",
    theory: [
      {
        kind: "mc",
        question: "La contribución marginal unitaria es:",
        options: ["Precio − costo total unitario", "Precio − costo variable unitario", "Costo fijo ÷ unidades", "Ventas − costos fijos"],
        correct: 1,
        explanation: "Es lo que cada unidad aporta para cubrir los costos fijos: precio menos costo variable unitario.",
        tag: "cm_incluye_fijos",
        errorLabel: "Incluye costos fijos dentro de la contribución marginal",
      },
    ],
  },
  {
    key: "punto_equilibrio",
    name: "Punto de equilibrio",
    area: "costos",
    unit: "Unidad 4",
    keywords: ["punto de equilibrio", "equilibrio", "margen de seguridad", "utilidad deseada", "costo volumen utilidad", "cvu", "punto muerto"],
    prereqs: ["contribucion_marginal"],
    description: "Equilibrio en unidades y en pesos, margen de seguridad y ventas para una utilidad deseada.",
    theory: [
      {
        kind: "mc",
        question: "Si suben los costos fijos y todo lo demás queda igual, el punto de equilibrio:",
        options: ["Baja", "Sube", "No cambia", "Depende del precio"],
        correct: 1,
        explanation: "Hay más costos fijos que cubrir con la misma contribución por unidad: hacen falta más unidades.",
      },
      {
        kind: "vf",
        question: "En el punto de equilibrio la contribución marginal total es igual a los costos fijos.",
        options: ["Verdadero", "Falso"],
        correct: 0,
        explanation: "Verdadero. Por eso el resultado es cero.",
      },
    ],
  },
  {
    key: "costeo_variable",
    name: "Costeo variable vs. absorción",
    area: "costos",
    unit: "Unidad 4",
    keywords: ["costeo variable", "costeo por absorcion", "costeo completo", "costeo directo", "absorcion", "resultado", "inventario"],
    prereqs: ["contribucion_marginal", "carga_fabril"],
    description: "Resultado con costeo variable y por absorción, y por qué difieren cuando cambia el inventario.",
    theory: [
      {
        kind: "mc",
        question: "Si la producción supera a las ventas, el resultado por absorción comparado con el variable es:",
        options: ["Mayor", "Menor", "Igual", "No se puede saber"],
        correct: 0,
        explanation: "Por absorción, parte de los costos fijos de producción queda activada en el inventario final.",
        tag: "var_activa_fijos",
        errorLabel: "Activa costos fijos en el inventario al usar costeo variable",
      },
    ],
  },
  {
    key: "interes_compuesto",
    name: "Interés compuesto",
    area: "finanzas",
    unit: "Unidad 1",
    keywords: ["interes compuesto", "capitalizacion", "valor futuro", "valor actual", "tasa efectiva", "capital"],
    prereqs: [],
    description: "Valor futuro con capitalización compuesta.",
    theory: [
      {
        kind: "vf",
        question: "Con interés compuesto los intereses de cada período se suman al capital y generan nuevos intereses.",
        options: ["Verdadero", "Falso"],
        correct: 0,
        explanation: "Verdadero. Esa es la diferencia con el interés simple.",
        tag: "simple_vs_compuesto",
        errorLabel: "Usa interés simple donde corresponde interés compuesto",
      },
    ],
  },
  {
    key: "van_tir",
    name: "VAN y evaluación de proyectos",
    area: "finanzas",
    unit: "Unidad 2",
    keywords: ["van", "valor actual neto", "tir", "tasa interna de retorno", "flujo de fondos", "tasa de descuento", "inversion inicial", "vna"],
    prereqs: ["interes_compuesto"],
    description: "Valor actual neto con flujos anuales y su cálculo en Excel.",
    theory: [
      {
        kind: "mc",
        question: "En Excel, la función VNA supone que el primer flujo del rango ocurre:",
        options: ["En el momento 0", "Al final del período 1", "A mitad del período 1", "Donde indique el usuario"],
        correct: 1,
        explanation: "VNA descuenta todos los flujos desde el período 1. La inversión inicial (momento 0) se suma aparte.",
        tag: "vna_incluye_inversion",
        errorLabel: "Incluye la inversión inicial dentro de VNA",
      },
    ],
  },
  {
    key: "sistema_frances",
    name: "Sistema francés de amortización",
    area: "finanzas",
    unit: "Unidad 3",
    keywords: ["sistema frances", "cuota", "amortizacion", "prestamo", "pago", "saldo", "sistema aleman"],
    prereqs: ["interes_compuesto"],
    description: "Cuota constante, interés y amortización de la primera cuota.",
    theory: [
      {
        kind: "vf",
        question: "En el sistema francés la amortización de capital es igual en todas las cuotas.",
        options: ["Verdadero", "Falso"],
        correct: 1,
        explanation: "Falso. La cuota es constante; la amortización crece y el interés baja. Amortización constante es el sistema alemán.",
        tag: "aleman_vs_frances",
        errorLabel: "Confunde sistema francés con sistema alemán",
      },
    ],
  },
  {
    key: "eoq",
    name: "Lote óptimo y punto de pedido",
    area: "operaciones",
    unit: "Unidad 1",
    keywords: ["lote optimo", "eoq", "costo de pedido", "costo de mantenimiento", "punto de pedido", "inventario", "demanda anual", "lead time"],
    prereqs: [],
    description: "Cantidad económica de pedido (Wilson) y punto de reposición.",
    theory: [
      {
        kind: "mc",
        question: "En el lote óptimo de Wilson, el costo total de pedir es:",
        options: ["Mayor que el de mantener", "Menor que el de mantener", "Igual al de mantener", "Cero"],
        correct: 2,
        explanation: "En el lote óptimo el costo anual de pedir y el de mantener se igualan.",
      },
    ],
  },
  {
    key: "iva",
    name: "Liquidación de IVA",
    area: "impuestos",
    unit: "Unidad 1",
    keywords: ["iva", "debito fiscal", "credito fiscal", "saldo tecnico", "alicuota", "saldo a favor", "impuesto al valor agregado"],
    prereqs: [],
    description: "Débito fiscal, crédito fiscal y saldo técnico del período.",
    theory: [
      {
        kind: "vf",
        question: "El crédito fiscal se calcula sobre el importe neto gravado de las compras, no sobre el total con IVA.",
        options: ["Verdadero", "Falso"],
        correct: 0,
        explanation: "Verdadero. Si tenés el total, primero hay que sacar el neto: total ÷ (1 + alícuota).",
        tag: "iva_sobre_total",
        errorLabel: "Calcula el IVA sobre un importe que ya lo incluye",
      },
    ],
  },
];

const T = (t: Template) => t;

export const TEMPLATES: Template[] = [
  T({
    key: "elementos_primo_conversion",
    topic: "elementos_costo",
    title: "Costo primo y costo de conversión",
    difficulty: 1,
    build: (r) => {
      const MP = pick(r, 180000, 420000, 5000);
      const MOD = pick(r, 90000, 260000, 5000);
      const CIF = pick(r, 60000, 200000, 5000);
      return {
        data: { MP, MOD, CIF },
        statement: `En el mes, una fábrica consumió materia prima por ${f(MP, "$")}, pagó mano de obra directa por ${f(MOD, "$")} y devengó carga fabril por ${f(CIF, "$")}.\n\nCalculá el costo primo, el costo de conversión y el costo de producción del mes.`,
      };
    },
    dataLabels: { MP: "Materia prima consumida", MOD: "Mano de obra directa", CIF: "Carga fabril" },
    dataFormats: { MP: "$", MOD: "$", CIF: "$" },
    steps: [
      { id: "primo", label: "Costo primo", expr: "MP + MOD", unit: "$", formulaText: "Costo primo = Materia prima + Mano de obra directa" },
      { id: "conversion", label: "Costo de conversión", expr: "MOD + CIF", unit: "$", formulaText: "Costo de conversión = Mano de obra directa + Carga fabril" },
      { id: "cp", label: "Costo de producción", expr: "sum(MP, MOD, CIF)", unit: "$", formulaText: "Costo de producción = MP + MOD + CF" },
    ],
    traps: [
      { step: "primo", expr: "MP + CIF", tag: "confunde_primo_conversion", label: "Confunde costo primo con costo de conversión", message: "Sumaste la carga fabril al costo primo. El costo primo es solo materia prima + mano de obra directa." },
      { step: "conversion", expr: "MP + MOD", tag: "confunde_primo_conversion", label: "Confunde costo primo con costo de conversión", message: "Ese es el costo primo. El de conversión es mano de obra directa + carga fabril." },
    ],
    hints: ["Pensá qué elementos «transforman» la materia prima.", "Primo = MP + MOD. Conversión = MOD + CF."],
    explanation: "El costo primo junta los costos directos (MP y MOD). El de conversión, lo necesario para transformar la materia prima (MOD y carga fabril). La suma de los tres elementos es el costo de producción.",
  }),
  T({
    key: "mp_ppp",
    topic: "materia_prima",
    title: "Consumo de materia prima con precio promedio ponderado",
    difficulty: 2,
    build: (r) => {
      const IIq = pick(r, 200, 800, 50);
      const IIp = pick(r, 80, 160, 5);
      const Cq = pick(r, 800, 2400, 100);
      const Cp = IIp + pick(r, 10, 45, 5);
      const Uq = pick(r, Math.round((IIq + Cq) * 0.5), Math.round((IIq + Cq) * 0.85), 10);
      return {
        data: { IIq, IIp, Cq, Cp, Uq },
        statement: `Inventario inicial de materia prima: ${f(IIq, "u")} a ${f(IIp, "$")} cada una. En el mes se compraron ${f(Cq, "u")} a ${f(Cp, "$")} cada una y se consumieron ${f(Uq, "u")}.\n\nValuá el consumo y el inventario final con precio promedio ponderado (PPP).`,
      };
    },
    dataLabels: { IIq: "Inventario inicial (unidades)", IIp: "Precio unitario inventario inicial", Cq: "Compras (unidades)", Cp: "Precio unitario de compra", Uq: "Consumo (unidades)" },
    dataFormats: { IIq: "u", IIp: "$", Cq: "u", Cp: "$", Uq: "u" },
    steps: [
      { id: "ppp", label: "Precio promedio ponderado", expr: "(IIq * IIp + Cq * Cp) / (IIq + Cq)", unit: "$", formulaText: "PPP = (valor inventario inicial + valor compras) ÷ (unidades iniciales + unidades compradas)", decimals: 2 },
      { id: "consumo", label: "Costo del consumo", expr: "ppp * Uq", unit: "$", formulaText: "Consumo = PPP × unidades consumidas" },
      { id: "if", label: "Inventario final valuado", expr: "(IIq + Cq - Uq) * ppp", unit: "$", formulaText: "Inventario final = (unidades disponibles − consumidas) × PPP" },
    ],
    traps: [
      { step: "ppp", expr: "(IIp + Cp) / 2", tag: "promedio_simple", label: "Usa promedio simple en lugar de ponderado", message: "Promediaste los precios sin ponderar por las cantidades. El PPP pesa cada precio por las unidades a ese precio." },
    ],
    hints: ["El promedio tiene que tener en cuenta cuántas unidades hay a cada precio.", "Sumá los valores totales (cantidad × precio) y dividí por las unidades totales."],
    explanation: "El PPP reparte el costo total disponible entre todas las unidades disponibles. Con ese precio se valúan tanto el consumo como el inventario final, así que consumo + inventario final = valor disponible.",
  }),
  T({
    key: "mp_peps",
    topic: "materia_prima",
    title: "Consumo de materia prima con PEPS",
    difficulty: 2,
    build: (r) => {
      const IIq = pick(r, 200, 600, 50);
      const IIp = pick(r, 80, 150, 5);
      const Cq = pick(r, 800, 2000, 100);
      const Cp = IIp + pick(r, 10, 40, 5);
      const Uq = IIq + pick(r, 100, Math.max(150, Cq - 100), 50);
      return {
        data: { IIq, IIp, Cq, Cp, Uq },
        statement: `Inventario inicial de materia prima: ${f(IIq, "u")} a ${f(IIp, "$")}. Compras del mes: ${f(Cq, "u")} a ${f(Cp, "$")}. Consumo: ${f(Uq, "u")}.\n\nValuá el consumo con el método PEPS (primero entrado, primero salido).`,
      };
    },
    dataLabels: { IIq: "Inventario inicial (unidades)", IIp: "Precio unitario inventario inicial", Cq: "Compras (unidades)", Cp: "Precio unitario de compra", Uq: "Consumo (unidades)" },
    dataFormats: { IIq: "u", IIp: "$", Cq: "u", Cp: "$", Uq: "u" },
    steps: [
      { id: "tramo1", label: "Consumo del inventario inicial", expr: "IIq * IIp", unit: "$", formulaText: "Primero salen todas las unidades del inventario inicial a su precio" },
      { id: "tramo2", label: "Consumo de unidades compradas", expr: "(Uq - IIq) * Cp", unit: "$", formulaText: "El resto del consumo sale de las compras, al precio de compra" },
      { id: "consumo", label: "Costo total del consumo", expr: "tramo1 + tramo2", unit: "$", formulaText: "Consumo PEPS = tramo inventario inicial + tramo compras" },
    ],
    traps: [
      { step: "consumo", expr: "Uq * Cp", tag: "peps_usa_ultimo_precio", label: "Valúa con el último precio (UEPS) cuando se pide PEPS", message: "Valuaste todo el consumo al precio de compra más reciente. Con PEPS primero salen las unidades más viejas." },
    ],
    hints: ["¿Qué unidades salen primero con PEPS?", "Primero se agota el inventario inicial; lo que falta se toma de las compras."],
    explanation: "PEPS supone que las primeras unidades en entrar son las primeras en salir: el consumo se valúa en tramos, empezando por el inventario inicial.",
  }),
  T({
    key: "mod_costo_horario",
    topic: "mano_obra",
    title: "Costo de la mano de obra directa",
    difficulty: 1,
    build: (r) => {
      const jornal = pick(r, 2800, 6500, 50);
      const cargas = pick(r, 0.35, 0.55, 0.01);
      const horas = pick(r, 600, 2400, 20);
      return {
        data: { jornal, cargas, horas },
        statement: `El salario básico de los operarios es ${f(jornal, "$")} por hora. Las cargas sociales a cargo del empleador son del ${f(cargas, "%")}. En el mes se trabajaron ${f(horas, "h")} directas.\n\nCalculá el costo horario y el costo total de la mano de obra directa.`,
      };
    },
    dataLabels: { jornal: "Salario básico por hora", cargas: "Cargas sociales (%)", horas: "Horas directas trabajadas" },
    dataFormats: { jornal: "$", cargas: "%", horas: "h" },
    steps: [
      { id: "costo_hora", label: "Costo horario con cargas", expr: "jornal * (1 + cargas)", unit: "$", formulaText: "Costo horario = básico × (1 + % cargas sociales)", decimals: 2 },
      { id: "mod", label: "Costo total de MOD", expr: "costo_hora * horas", unit: "$", formulaText: "MOD = costo horario × horas trabajadas" },
    ],
    traps: [
      { step: "costo_hora", expr: "jornal", tag: "olvida_cargas_sociales", label: "Olvida sumar las cargas sociales al costo de la mano de obra", message: "Usaste solo el básico. Al empleador la hora le cuesta el básico más las cargas sociales." },
      { step: "mod", expr: "jornal * horas", tag: "olvida_cargas_sociales", label: "Olvida sumar las cargas sociales al costo de la mano de obra", message: "Multiplicaste el básico por las horas, sin cargas sociales." },
    ],
    hints: ["La hora no le cuesta a la empresa solo el básico.", "Costo horario = básico × (1 + cargas)."],
    explanation: "Las cargas sociales patronales son costo de la empresa, así que integran el costo de la mano de obra directa.",
  }),
  T({
    key: "cif_tasa",
    topic: "carga_fabril",
    title: "Tasa predeterminada de carga fabril",
    difficulty: 2,
    build: (r) => {
      const CIFp = pick(r, 600000, 1800000, 10000);
      const Hp = pick(r, 2000, 6000, 100);
      const Hr = Math.round(Hp * pick(r, 0.82, 1.15, 0.01));
      const CIFr = Math.round((CIFp * pick(r, 0.88, 1.12, 0.01)) / 1000) * 1000;
      return {
        data: { CIFp, Hp, Hr, CIFr },
        statement: `Para el año se presupuestó carga fabril por ${f(CIFp, "$")} y ${f(Hp, "h")} máquina. En el período se trabajaron ${f(Hr, "h")} máquina y la carga fabril real fue ${f(CIFr, "$")}.\n\nCalculá la tasa predeterminada, la carga fabril aplicada y la variación (indicá si es sub o sobreaplicación: positiva = subaplicación).`,
      };
    },
    dataLabels: { CIFp: "Carga fabril presupuestada", Hp: "Horas máquina presupuestadas", Hr: "Horas máquina reales", CIFr: "Carga fabril real" },
    dataFormats: { CIFp: "$", Hp: "h", Hr: "h", CIFr: "$" },
    steps: [
      { id: "tasa", label: "Tasa predeterminada", expr: "CIFp / Hp", unit: "$/h", formulaText: "Tasa = carga fabril presupuestada ÷ horas presupuestadas", decimals: 2 },
      { id: "aplicada", label: "Carga fabril aplicada", expr: "tasa * Hr", unit: "$", formulaText: "Aplicada = tasa × horas reales" },
      { id: "variacion", label: "Variación (real − aplicada)", expr: "CIFr - aplicada", unit: "$", formulaText: "Variación = carga fabril real − aplicada (positiva: subaplicación)" },
    ],
    traps: [
      { step: "tasa", expr: "CIFp / Hr", tag: "tasa_con_datos_reales", label: "Calcula la tasa predeterminada con datos reales en lugar de presupuestados", message: "Dividiste por las horas reales. La tasa predeterminada se arma con datos presupuestados." },
      { step: "tasa", expr: "CIFr / Hr", tag: "tasa_con_datos_reales", label: "Calcula la tasa predeterminada con datos reales en lugar de presupuestados", message: "Usaste carga fabril y horas reales: eso da la tasa real, no la predeterminada." },
      { step: "variacion", expr: "aplicada - CIFr", tag: "signo_sub_sobre", label: "Confunde subaplicación con sobreaplicación", message: "Invertiste el signo. Si lo real supera lo aplicado, se aplicó de menos: subaplicación (positiva en esta convención)." },
    ],
    hints: ["La tasa se fija antes de conocer los datos reales.", "Tasa = CF presupuestada ÷ base presupuestada; después se aplica sobre la base real."],
    explanation: "La tasa predeterminada permite costear durante el período sin esperar al cierre. Al final se compara la carga real con la aplicada: la diferencia es la sub o sobreaplicación.",
  }),
  T({
    key: "cp_unitario",
    topic: "costo_produccion",
    title: "Costo unitario y costo de ventas",
    difficulty: 2,
    build: (r) => {
      const MP = pick(r, 400000, 900000, 10000);
      const MOD = pick(r, 250000, 600000, 10000);
      const CIF = pick(r, 150000, 450000, 10000);
      const Pt = pick(r, 800, 2500, 50);
      const V = Math.round(Pt * pick(r, 0.6, 0.9, 0.05) / 10) * 10;
      return {
        data: { MP, MOD, CIF, Pt, V },
        statement: `Una empresa sin inventarios iniciales incurrió en el mes en: materia prima ${f(MP, "$")}, mano de obra directa ${f(MOD, "$")} y carga fabril ${f(CIF, "$")}. Terminó ${f(Pt, "u")} (no quedó producción en proceso) y vendió ${f(V, "u")}.\n\nCalculá el costo de producción, el costo unitario, el costo de ventas y el inventario final de productos terminados.`,
      };
    },
    dataLabels: { MP: "Materia prima", MOD: "Mano de obra directa", CIF: "Carga fabril", Pt: "Unidades terminadas", V: "Unidades vendidas" },
    dataFormats: { MP: "$", MOD: "$", CIF: "$", Pt: "u", V: "u" },
    steps: [
      { id: "cp", label: "Costo de producción", expr: "sum(MP, MOD, CIF)", unit: "$", formulaText: "Costo de producción = MP + MOD + CF" },
      { id: "cu", label: "Costo unitario", expr: "cp / Pt", unit: "$", formulaText: "Costo unitario = costo de producción ÷ unidades terminadas", decimals: 2 },
      { id: "cv", label: "Costo de ventas", expr: "cu * V", unit: "$", formulaText: "Costo de ventas = costo unitario × unidades vendidas" },
      { id: "if", label: "Inventario final de productos terminados", expr: "cu * (Pt - V)", unit: "$", formulaText: "Inventario final = costo unitario × (terminadas − vendidas)" },
    ],
    traps: [
      { step: "cu", expr: "cp / V", tag: "divide_por_vendidas", label: "Confunde producción terminada con producción vendida", message: "Dividiste el costo de producción por las unidades vendidas ({V}) en lugar de las terminadas ({Pt})." },
      { step: "cv", expr: "cp", tag: "costo_ventas_igual_produccion", label: "Toma todo el costo de producción como costo de ventas", message: "Pusiste todo el costo de producción como costo de ventas, pero no se vendió todo lo producido." },
    ],
    hints: ["¿Sobre qué cantidad se reparte lo que costó producir?", "El costo unitario sale de dividir por lo terminado, no por lo vendido."],
    explanation: "El costo de producción se reparte entre lo que se produjo. Después, lo vendido va a costo de ventas y lo no vendido queda en el inventario final: CV + IF = costo de producción.",
  }),
  T({
    key: "estado_costos",
    topic: "costo_ventas",
    title: "Estado de costos completo",
    difficulty: 3,
    build: (r) => {
      const IIMP = pick(r, 50000, 150000, 5000);
      const Comp = pick(r, 300000, 800000, 10000);
      const IFMP = pick(r, 40000, 140000, 5000);
      const MOD = pick(r, 200000, 500000, 10000);
      const CIF = pick(r, 120000, 350000, 10000);
      const IIPT = pick(r, 60000, 200000, 5000);
      const IFPT = pick(r, 50000, 220000, 5000);
      return {
        data: { IIMP, Comp, IFMP, MOD, CIF, IIPT, IFPT },
        statement: `Datos del mes (sin producción en proceso):\n• Inventario inicial de materia prima ${f(IIMP, "$")}, compras ${f(Comp, "$")}, inventario final de materia prima ${f(IFMP, "$")}.\n• Mano de obra directa ${f(MOD, "$")}. Carga fabril ${f(CIF, "$")}.\n• Inventario inicial de productos terminados ${f(IIPT, "$")}; inventario final ${f(IFPT, "$")}.\n\nArmá el estado de costos hasta el costo de ventas.`,
      };
    },
    dataLabels: { IIMP: "Inventario inicial MP", Comp: "Compras de MP", IFMP: "Inventario final MP", MOD: "Mano de obra directa", CIF: "Carga fabril", IIPT: "Inventario inicial PT", IFPT: "Inventario final PT" },
    dataFormats: { IIMP: "$", Comp: "$", IFMP: "$", MOD: "$", CIF: "$", IIPT: "$", IFPT: "$" },
    steps: [
      { id: "consumo", label: "Consumo de materia prima", expr: "IIMP + Comp - IFMP", unit: "$", formulaText: "Consumo MP = inventario inicial + compras − inventario final" },
      { id: "cp", label: "Costo de producción", expr: "consumo + MOD + CIF", unit: "$", formulaText: "Costo de producción = consumo MP + MOD + CF" },
      { id: "cv", label: "Costo de ventas", expr: "IIPT + cp - IFPT", unit: "$", formulaText: "Costo de ventas = inventario inicial PT + costo de producción − inventario final PT" },
    ],
    traps: [
      { step: "consumo", expr: "Comp", tag: "ignora_inventarios_mp", label: "Toma las compras como consumo, ignorando inventarios de materia prima", message: "Usaste las compras como consumo. El consumo ajusta por los inventarios inicial y final de materia prima." },
      { step: "cv", expr: "cp", tag: "ignora_inventario_pt", label: "Ignora los inventarios de productos terminados al calcular el costo de ventas", message: "Tomaste el costo de producción como costo de ventas sin ajustar por inventarios de productos terminados." },
    ],
    hints: ["Hay dos «almacenes»: materia prima y productos terminados.", "En cada uno: inicial + entradas − final = salidas."],
    explanation: "El estado de costos sigue el flujo físico: lo que sale del almacén de materia prima entra a producción, y lo que sale del almacén de productos terminados es costo de ventas.",
  }),
  T({
    key: "cm_basica",
    topic: "contribucion_marginal",
    title: "Contribución marginal y resultado",
    difficulty: 1,
    build: (r) => {
      const p = pick(r, 1500, 6000, 50);
      const cvu = Math.round(p * pick(r, 0.4, 0.7, 0.01) / 10) * 10;
      const q = pick(r, 800, 4000, 50);
      const CF = Math.round(((p - cvu) * q * pick(r, 0.5, 0.9, 0.05)) / 1000) * 1000;
      return {
        data: { p, cvu, q, CF },
        statement: `Un producto se vende a ${f(p, "$")} y tiene un costo variable unitario de ${f(cvu, "$")}. Se vendieron ${f(q, "u")} en el mes y los costos fijos fueron ${f(CF, "$")}.\n\nCalculá la contribución marginal unitaria, la contribución total, la razón de contribución y el resultado.`,
      };
    },
    dataLabels: { p: "Precio de venta", cvu: "Costo variable unitario", q: "Unidades vendidas", CF: "Costos fijos" },
    dataFormats: { p: "$", cvu: "$", q: "u", CF: "$" },
    steps: [
      { id: "cmu", label: "Contribución marginal unitaria", expr: "p - cvu", unit: "$", formulaText: "CMu = precio − costo variable unitario" },
      { id: "cmt", label: "Contribución marginal total", expr: "cmu * q", unit: "$", formulaText: "CMT = CMu × unidades vendidas" },
      { id: "razon", label: "Razón de contribución", expr: "cmu / p", unit: "%", formulaText: "Razón de contribución = CMu ÷ precio" },
      { id: "resultado", label: "Resultado", expr: "cmt - CF", unit: "$", formulaText: "Resultado = CMT − costos fijos" },
    ],
    traps: [
      { step: "cmu", expr: "p - cvu - CF / q", tag: "cm_incluye_fijos", label: "Incluye costos fijos dentro de la contribución marginal", message: "Le restaste costos fijos prorrateados. La contribución marginal solo resta costos variables." },
    ],
    hints: ["La contribución marginal no mira los costos fijos.", "CMu = precio − costo variable unitario."],
    explanation: "La contribución marginal es lo que queda de cada venta para cubrir los costos fijos y, después, generar ganancia.",
  }),
  T({
    key: "pe_basico",
    topic: "punto_equilibrio",
    title: "Punto de equilibrio y margen de seguridad",
    difficulty: 2,
    build: (r) => {
      const p = pick(r, 1200, 5000, 50);
      const cvu = Math.round(p * pick(r, 0.45, 0.7, 0.01) / 10) * 10;
      const cmu = p - cvu;
      const Qe = pick(r, 600, 3000, 50);
      const CF = Qe * cmu;
      const Vp = Math.round(Qe * pick(r, 1.15, 1.6, 0.05) / 10) * 10;
      return {
        data: { CF, p, cvu, Vp },
        statement: `Una empresa tiene costos fijos mensuales de ${f(CF, "$")}. Vende su producto a ${f(p, "$")} y el costo variable unitario es ${f(cvu, "$")}. Para el mes próximo prevé vender ${f(Vp, "u")}.\n\nCalculá la contribución marginal unitaria, el punto de equilibrio en unidades y en pesos, y el margen de seguridad (%).`,
      };
    },
    dataLabels: { CF: "Costos fijos", p: "Precio de venta", cvu: "Costo variable unitario", Vp: "Ventas previstas (unidades)" },
    dataFormats: { CF: "$", p: "$", cvu: "$", Vp: "u" },
    steps: [
      { id: "cmu", label: "Contribución marginal unitaria", expr: "p - cvu", unit: "$", formulaText: "CMu = precio − costo variable unitario" },
      { id: "qe", label: "Punto de equilibrio (unidades)", expr: "CF / cmu", unit: "u", formulaText: "Qe = costos fijos ÷ CMu" },
      { id: "pe_pesos", label: "Punto de equilibrio ($)", expr: "qe * p", unit: "$", formulaText: "Equilibrio en $ = Qe × precio" },
      { id: "ms", label: "Margen de seguridad", expr: "(Vp - qe) / Vp", unit: "%", formulaText: "MS = (ventas previstas − Qe) ÷ ventas previstas" },
    ],
    traps: [
      { step: "qe", expr: "CF / p", tag: "pe_divide_precio", label: "Divide costos fijos por el precio en lugar de la contribución marginal", message: "Dividiste los costos fijos por el precio ({p}). Cada unidad solo aporta su contribución marginal para cubrirlos." },
      { step: "qe", expr: "CF / cvu", tag: "pe_divide_precio", label: "Divide costos fijos por el precio en lugar de la contribución marginal", message: "Dividiste por el costo variable. El divisor es la contribución marginal unitaria (precio − costo variable)." },
      { step: "ms", expr: "(Vp - qe) / qe", tag: "ms_base_equivocada", label: "Calcula el margen de seguridad sobre el equilibrio en lugar de las ventas previstas", message: "Dividiste por el punto de equilibrio. El margen de seguridad se expresa sobre las ventas previstas." },
    ],
    hints: ["¿Con qué parte del precio cubre cada unidad los costos fijos?", "Qe = CF ÷ (precio − costo variable unitario)."],
    explanation: "En el equilibrio la contribución total iguala a los costos fijos. El margen de seguridad dice cuánto pueden caer las ventas previstas antes de entrar en pérdida.",
  }),
  T({
    key: "pe_utilidad",
    topic: "punto_equilibrio",
    title: "Ventas necesarias para una utilidad deseada",
    difficulty: 2,
    build: (r) => {
      const p = pick(r, 1500, 5000, 50);
      const cvu = Math.round(p * pick(r, 0.45, 0.65, 0.01) / 10) * 10;
      const cmu = p - cvu;
      const CF = pick(r, 800, 2500, 50) * cmu;
      const U = pick(r, 200, 900, 50) * cmu;
      return {
        data: { CF, p, cvu, U },
        statement: `Costos fijos: ${f(CF, "$")}. Precio: ${f(p, "$")}. Costo variable unitario: ${f(cvu, "$")}. La dirección quiere una utilidad (antes de impuestos) de ${f(U, "$")}.\n\n¿Cuántas unidades hay que vender y a cuántos pesos de ventas equivale?`,
      };
    },
    dataLabels: { CF: "Costos fijos", p: "Precio de venta", cvu: "Costo variable unitario", U: "Utilidad deseada" },
    dataFormats: { CF: "$", p: "$", cvu: "$", U: "$" },
    steps: [
      { id: "cmu", label: "Contribución marginal unitaria", expr: "p - cvu", unit: "$", formulaText: "CMu = precio − costo variable unitario" },
      { id: "q", label: "Unidades necesarias", expr: "(CF + U) / cmu", unit: "u", formulaText: "Q = (costos fijos + utilidad deseada) ÷ CMu" },
      { id: "ventas", label: "Ventas necesarias ($)", expr: "q * p", unit: "$", formulaText: "Ventas = Q × precio" },
    ],
    traps: [
      { step: "q", expr: "CF / cmu + U", tag: "utilidad_sumada_afuera", label: "Suma la utilidad deseada en pesos a las unidades de equilibrio", message: "Sumaste la utilidad (en pesos) a las unidades. La utilidad se suma a los costos fijos antes de dividir por la CMu." },
      { step: "q", expr: "(CF + U) / p", tag: "pe_divide_precio", label: "Divide costos fijos por el precio en lugar de la contribución marginal", message: "Dividiste por el precio. El divisor es la contribución marginal unitaria." },
    ],
    hints: ["La utilidad deseada funciona como un costo fijo más que hay que cubrir.", "Q = (CF + U) ÷ CMu."],
    explanation: "Para ganar U hay que cubrir los costos fijos y además generar U de contribución: por eso se suman en el numerador.",
  }),
  T({
    key: "costeo_var_abs",
    topic: "costeo_variable",
    title: "Resultado por costeo variable y por absorción",
    difficulty: 3,
    build: (r) => {
      const P = pick(r, 2000, 5000, 100);
      const V = Math.round(P * pick(r, 0.65, 0.9, 0.05) / 10) * 10;
      const p = pick(r, 2500, 7000, 100);
      const cvu = Math.round(p * pick(r, 0.35, 0.55, 0.01) / 10) * 10;
      const CFP = P * pick(r, 200, 900, 10);
      const GF = pick(r, 200000, 800000, 10000);
      return {
        data: { P, V, p, cvu, CFP, GF },
        statement: `Primer mes de actividad (sin inventario inicial). Se produjeron ${f(P, "u")} y se vendieron ${f(V, "u")} a ${f(p, "$")} cada una. Costo variable de producción: ${f(cvu, "$")} por unidad. Costos fijos de producción: ${f(CFP, "$")}. Gastos fijos de administración y comercialización: ${f(GF, "$")}.\n\nCalculá el resultado por costeo por absorción y por costeo variable, y explicá la diferencia.`,
      };
    },
    dataLabels: { P: "Unidades producidas", V: "Unidades vendidas", p: "Precio de venta", cvu: "Costo variable unitario de producción", CFP: "Costos fijos de producción", GF: "Gastos fijos de adm. y comercialización" },
    dataFormats: { P: "u", V: "u", p: "$", cvu: "$", CFP: "$", GF: "$" },
    steps: [
      { id: "cfu", label: "Costo fijo unitario de producción", expr: "CFP / P", unit: "$", formulaText: "CF unitario = costos fijos de producción ÷ unidades producidas", decimals: 2 },
      { id: "res_abs", label: "Resultado por absorción", expr: "V * (p - cvu - cfu) - GF", unit: "$", formulaText: "Absorción: ventas − costo de ventas (variable + fijo unitario) − gastos fijos" },
      { id: "res_var", label: "Resultado por costeo variable", expr: "V * (p - cvu) - CFP - GF", unit: "$", formulaText: "Variable: contribución marginal − todos los costos fijos del período" },
      { id: "dif", label: "Diferencia (absorción − variable)", expr: "res_abs - res_var", unit: "$", formulaText: "Diferencia = CF unitario × (producidas − vendidas)" },
    ],
    traps: [
      { step: "cfu", expr: "CFP / V", tag: "divide_por_vendidas", label: "Confunde producción terminada con producción vendida", message: "Prorrateaste los costos fijos de producción entre las unidades vendidas ({V}) en lugar de las producidas ({P})." },
      { step: "res_var", expr: "V * (p - cvu - cfu) - GF", tag: "var_activa_fijos", label: "Activa costos fijos en el inventario al usar costeo variable", message: "Con costeo variable los costos fijos de producción van enteros al resultado del período; no se reparten por unidad." },
    ],
    hints: ["La diferencia entre métodos está en dónde terminan los costos fijos de producción.", "Absorción: van al costo unitario. Variable: van enteros al período."],
    explanation: "Por absorción, parte de los costos fijos de producción queda en el inventario final (CF unitario × unidades no vendidas). Por eso, si se produce más de lo que se vende, absorción muestra más resultado.",
  }),
  T({
    key: "interes_vf",
    topic: "interes_compuesto",
    title: "Valor futuro con interés compuesto",
    difficulty: 1,
    excelDefault: true,
    build: (r) => {
      const C = pick(r, 100000, 900000, 10000);
      const i = pick(r, 0.02, 0.06, 0.005);
      const n = pick(r, 6, 24, 1);
      return {
        data: { C, i, n },
        statement: `Se depositan ${f(C, "$")} a una tasa efectiva mensual del ${f(i, "%")} durante ${n} meses, con capitalización mensual.\n\nCalculá el monto final y los intereses ganados.`,
      };
    },
    dataLabels: { C: "Capital inicial", i: "Tasa efectiva mensual", n: "Meses" },
    dataFormats: { C: "$", i: "%", n: "num" },
    steps: [
      { id: "vf", label: "Monto final", expr: "C * (1 + i) ^ n", unit: "$", formulaText: "VF = C × (1 + i)^n" },
      { id: "int", label: "Intereses ganados", expr: "vf - C", unit: "$", formulaText: "Intereses = VF − C" },
    ],
    traps: [
      { step: "vf", expr: "C * (1 + i * n)", tag: "simple_vs_compuesto", label: "Usa interés simple donde corresponde interés compuesto", message: "Calculaste con interés simple. Con capitalización, los intereses generan intereses: (1 + i)^n." },
    ],
    hints: ["Los intereses de cada mes se suman al capital.", "VF = C × (1 + i)^n."],
    explanation: "Con capitalización compuesta el capital crece geométricamente: cada período se aplica la tasa sobre el saldo acumulado.",
  }),
  T({
    key: "van_basico",
    topic: "van_tir",
    title: "VAN de un proyecto en Excel",
    difficulty: 2,
    excelDefault: true,
    build: (r) => {
      const I0 = pick(r, 800000, 3000000, 50000);
      const k = pick(r, 0.08, 0.2, 0.01);
      const base = I0 / 3.2;
      const F1 = Math.round((base * pick(r, 0.7, 1.1, 0.05)) / 1000) * 1000;
      const F2 = Math.round((base * pick(r, 0.8, 1.2, 0.05)) / 1000) * 1000;
      const F3 = Math.round((base * pick(r, 0.8, 1.3, 0.05)) / 1000) * 1000;
      const F4 = Math.round((base * pick(r, 0.6, 1.2, 0.05)) / 1000) * 1000;
      return {
        data: { I0, k, F1, F2, F3, F4 },
        statement: `Un proyecto requiere una inversión inicial de ${f(I0, "$")} y genera flujos netos al final de cada año de ${f(F1, "$")}, ${f(F2, "$")}, ${f(F3, "$")} y ${f(F4, "$")}. La tasa de descuento es ${f(k, "%")} anual.\n\nCalculá en Excel el valor actual de los flujos y el VAN. ¿Conviene el proyecto?`,
      };
    },
    dataLabels: { I0: "Inversión inicial (momento 0)", k: "Tasa de descuento anual", F1: "Flujo año 1", F2: "Flujo año 2", F3: "Flujo año 3", F4: "Flujo año 4" },
    dataFormats: { I0: "$", k: "%", F1: "$", F2: "$", F3: "$", F4: "$" },
    steps: [
      { id: "va", label: "Valor actual de los flujos", expr: "npv(k, F1, F2, F3, F4)", unit: "$", formulaText: "VA = Σ Ft ÷ (1 + k)^t, para t = 1…4" },
      { id: "van", label: "VAN", expr: "va - I0", unit: "$", formulaText: "VAN = VA de los flujos − inversión inicial" },
    ],
    traps: [
      { step: "van", expr: "npv(k, 0 - I0, F1, F2, F3, F4)", tag: "vna_incluye_inversion", label: "Incluye la inversión inicial dentro de VNA", message: "Metiste la inversión dentro del VNA, que la descuenta como si ocurriera en el año 1. La inversión del momento 0 se resta afuera." },
    ],
    hints: ["VNA descuenta desde el período 1.", "VAN = VNA(tasa; flujos 1 a 4) − inversión inicial."],
    explanation: "El VAN compara el valor presente de lo que genera el proyecto con lo que cuesta hoy. Si es positivo, el proyecto rinde más que la tasa exigida.",
  }),
  T({
    key: "frances_primera_cuota",
    topic: "sistema_frances",
    title: "Sistema francés: primera cuota",
    difficulty: 2,
    excelDefault: true,
    build: (r) => {
      const P = pick(r, 500000, 5000000, 50000);
      const i = pick(r, 0.02, 0.06, 0.005);
      const n = pick(r, 6, 36, 6);
      return {
        data: { P, i, n },
        statement: `Se toma un préstamo de ${f(P, "$")} a devolver en ${n} cuotas mensuales por sistema francés, con tasa efectiva mensual del ${f(i, "%")}.\n\nCalculá la cuota, el interés y la amortización de la primera cuota, y el saldo después de pagarla.`,
      };
    },
    dataLabels: { P: "Monto del préstamo", i: "Tasa efectiva mensual", n: "Cantidad de cuotas" },
    dataFormats: { P: "$", i: "%", n: "num" },
    steps: [
      { id: "cuota", label: "Cuota", expr: "0 - pmt(i, n, P)", unit: "$", formulaText: "Cuota = P × i ÷ (1 − (1 + i)^−n)" },
      { id: "int1", label: "Interés cuota 1", expr: "P * i", unit: "$", formulaText: "Interés = saldo × i" },
      { id: "amort1", label: "Amortización cuota 1", expr: "cuota - int1", unit: "$", formulaText: "Amortización = cuota − interés" },
      { id: "saldo1", label: "Saldo después de la cuota 1", expr: "P - amort1", unit: "$", formulaText: "Saldo = P − amortización" },
    ],
    traps: [
      { step: "amort1", expr: "P / n", tag: "aleman_vs_frances", label: "Confunde sistema francés con sistema alemán", message: "Dividiste el capital en partes iguales: eso es el sistema alemán. En el francés la cuota es fija y la amortización es cuota − interés." },
    ],
    hints: ["En el sistema francés lo constante es la cuota.", "En Excel: =-PAGO(tasa; nper; va)."],
    explanation: "La cuota francesa es constante. Al principio casi todo es interés; con cada pago baja el saldo, baja el interés y sube la amortización.",
  }),
  T({
    key: "eoq_basico",
    topic: "eoq",
    title: "Lote óptimo y punto de pedido",
    difficulty: 2,
    build: (r) => {
      const D = pick(r, 6000, 48000, 1000);
      const S = pick(r, 3000, 15000, 500);
      const H = pick(r, 80, 400, 10);
      const L = pick(r, 3, 12, 1);
      const dias = 300;
      return {
        data: { D, S, H, L, dias },
        statement: `Demanda anual: ${f(D, "u")}. Costo de emitir un pedido: ${f(S, "$")}. Costo de mantener una unidad en inventario por año: ${f(H, "$")}. El proveedor tarda ${L} días hábiles y se trabajan ${dias} días al año.\n\nCalculá el lote óptimo, la cantidad de pedidos anuales, el costo total anual de pedir y mantener, y el punto de pedido.`,
      };
    },
    dataLabels: { D: "Demanda anual (u)", S: "Costo por pedido", H: "Costo de mantener (u/año)", L: "Demora del proveedor (días)", dias: "Días hábiles por año" },
    dataFormats: { D: "u", S: "$", H: "$", L: "num", dias: "num" },
    steps: [
      { id: "q", label: "Lote óptimo", expr: "sqrt(2 * D * S / H)", unit: "u", formulaText: "Q* = √(2 × D × S ÷ H)" },
      { id: "pedidos", label: "Pedidos por año", expr: "D / q", unit: "num", formulaText: "N = D ÷ Q*" },
      { id: "ct", label: "Costo total anual", expr: "D / q * S + q / 2 * H", unit: "$", formulaText: "CT = (D ÷ Q) × S + (Q ÷ 2) × H" },
      { id: "rop", label: "Punto de pedido", expr: "D / dias * L", unit: "u", formulaText: "PP = demanda diaria × demora" },
    ],
    traps: [
      { step: "q", expr: "sqrt(D * S / H)", tag: "eoq_sin_2", label: "Olvida el 2 en la fórmula de Wilson", message: "Te faltó el 2 dentro de la raíz: Q* = √(2DS/H)." },
    ],
    hints: ["El lote óptimo iguala costo de pedir y de mantener.", "Q* = √(2DS/H)."],
    explanation: "El modelo de Wilson busca la cantidad que minimiza la suma de costos de pedir (bajan con lotes grandes) y de mantener (suben con lotes grandes).",
  }),
  T({
    key: "iva_liquidacion",
    topic: "iva",
    title: "Liquidación mensual de IVA",
    difficulty: 1,
    build: (r) => {
      const Vn = pick(r, 800000, 4000000, 10000);
      const Ct = Math.round((Vn * pick(r, 0.4, 0.8, 0.05) * 1.21) / 100) * 100;
      const SAF = pick(r, 0, 80000, 5000);
      const al = 0.21;
      return {
        data: { Vn, Ct, SAF, al },
        statement: `Un responsable inscripto tuvo en el mes ventas netas gravadas por ${f(Vn, "$")} y compras gravadas por un total de ${f(Ct, "$")} (IVA incluido). Tiene un saldo técnico a favor del mes anterior de ${f(SAF, "$")}. Alícuota: 21 %.\n\nCalculá el débito fiscal, el crédito fiscal y el saldo técnico del mes.`,
      };
    },
    dataLabels: { Vn: "Ventas netas gravadas", Ct: "Compras gravadas (IVA incluido)", SAF: "Saldo a favor anterior", al: "Alícuota" },
    dataFormats: { Vn: "$", Ct: "$", SAF: "$", al: "%" },
    steps: [
      { id: "df", label: "Débito fiscal", expr: "Vn * al", unit: "$", formulaText: "DF = ventas netas × alícuota" },
      { id: "cf", label: "Crédito fiscal", expr: "Ct / (1 + al) * al", unit: "$", formulaText: "CF = compras con IVA ÷ (1 + alícuota) × alícuota" },
      { id: "saldo", label: "Saldo técnico a pagar", expr: "df - cf - SAF", unit: "$", formulaText: "Saldo = DF − CF − saldo a favor anterior" },
    ],
    traps: [
      { step: "cf", expr: "Ct * al", tag: "iva_sobre_total", label: "Calcula el IVA sobre un importe que ya lo incluye", message: "Aplicaste el 21 % sobre un total que ya incluye IVA. Primero sacá el neto: total ÷ 1,21." },
    ],
    hints: ["Las compras vienen con IVA incluido.", "Neto = total ÷ 1,21; CF = neto × 21 %."],
    explanation: "El saldo técnico surge de débito fiscal menos crédito fiscal, y se compensa con saldos a favor anteriores.",
  }),
];

export function topicByKey(key: string) {
  return TOPICS.find((t) => t.key === key);
}

export function templatesFor(topicKey: string) {
  return TEMPLATES.filter((t) => t.topic === topicKey);
}

/** Instancia una plantilla con números nuevos. */
export function instantiate(tpl: Template, seed: number, opts: { excel?: boolean } = {}): NumericSpec {
  // Si los números sorteados hacen que una trampa dé igual que la respuesta correcta,
  // el diagnóstico sería ambiguo: se vuelve a sortear.
  let r = mulberry32(seed);
  let built = tpl.build(r);
  for (let k = 1; k < 60 && !distinguishable(tpl, built.data); k++) {
    r = mulberry32(seed + k * 104729);
    built = tpl.build(r);
  }
  const { data, statement } = built;
  return {
    kind: "numeric",
    title: tpl.title,
    statement,
    data,
    dataLabels: tpl.dataLabels,
    dataFormats: tpl.dataFormats,
    steps: tpl.steps,
    traps: tpl.traps,
    hints: tpl.hints,
    explanation: tpl.explanation,
    excelMode: opts.excel ?? !!tpl.excelDefault,
    topicKey: tpl.topic,
    templateKey: tpl.key,
    methodSource: "general",
    seed,
  };
}

export function distinguishable(spec: { steps: Step[]; traps: Trap[] }, data: Record<string, number>): boolean {
  try {
    const env: Record<string, number> = { ...data };
    for (const s of spec.steps) env[s.id] = evalExpr(s.expr, env);
    for (const s of spec.steps) if (!Number.isFinite(env[s.id])) return false;
    for (const t of spec.traps) {
      const step = spec.steps.find((s) => s.id === t.step);
      const v = evalExpr(t.expr, env);
      const tol = Math.max(0.02, Math.abs(env[t.step]) * 0.01);
      if (!step || Math.abs(v - env[t.step]) <= tol) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Busca la plantilla que tiene una trampa con ese tag (para ejercicios basados en errores). */
export function templatesWithTrap(tag: string) {
  return TEMPLATES.filter((t) => t.traps.some((tr) => tr.tag === tag));
}
