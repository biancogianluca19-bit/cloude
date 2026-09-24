import { all, get, run, json } from "../db.ts";
import { normalize, sentences, jaccard, truncate, tokenize } from "../retrieval/text.ts";
import type { Citation } from "../exercises/types.ts";
import { DEFAULT_WEIGHTS, type Weights } from "../exercises/grade.ts";
import { PROFESSOR_KINDS } from "../ingest/pipeline.ts";
import { aiAvailable, callJson, docBlock, DATA_POLICY } from "../ai/llm.ts";
import { topicScore } from "../learning/topics.ts";

// Perfil del profesor construido SOLO con el material de la cátedra.
// Cada observación lleva su evidencia (archivo, ubicación, cita). Sin evidencia no hay observación.

export interface Observation {
  text: string;
  evidence: Citation[];
  count?: number;
  origin?: "heuristica" | "ia";
}

export interface ExamItem {
  n: string;
  type: "practica" | "teoria";
  points: number | null;
  format: string;
  text: string;
  topicId: number | null;
  citation: Citation;
}

export interface ExamModel {
  fileId: number;
  file: string;
  kind: string;
  durationMin: number | null;
  items: ExamItem[];
}

export interface Profile {
  generatedAt: string;
  sourceFiles: { id: number; name: string; kind: string }[];
  terminology: Observation[];
  formulas: Observation[];
  excelFormulas: Observation[];
  methods: Observation[];
  detail: Observation[];
  examStyle: Observation[];
  recurring: Observation[];
  grading: Observation[];
  ai: Observation[];
  exams: ExamModel[];
  structure: {
    durationMin: number | null;
    practice: number;
    theory: number;
    avgItems: number;
    avgPoints: number | null;
    theoryShare: number;
    formats: string[];
    basedOn: number;
  } | null;
  gradingWeights: { weights: Weights; source: string; evidence: Citation[] } | null;
  gaps: string[];
}

interface Ch {
  id: number;
  file_id: number;
  file: string;
  kind: string;
  location: string;
  text: string;
  topic_id: number | null;
  ord: number;
}

const SYNONYMS: string[][] = [
  ["carga fabril", "costos indirectos de fabricación", "cif", "gastos de fabricación", "gastos generales de fabricación"],
  ["contribución marginal", "margen de contribución"],
  ["producción terminada", "unidades terminadas", "unidades producidas", "producción del período"],
  ["costo de ventas", "costo de lo vendido", "costo de mercaderías vendidas", "cmv"],
  ["costeo variable", "costeo directo", "costeo marginal"],
  ["costeo por absorción", "costeo completo", "costeo integral"],
  ["punto de equilibrio", "punto muerto", "punto de nivelación"],
  ["precio promedio ponderado", "ppp", "promedio ponderado móvil"],
  ["peps", "fifo", "primero entrado primero salido"],
  ["valor actual neto", "van", "valor presente neto", "vpn"],
  ["tasa interna de retorno", "tir"],
  ["mano de obra directa", "mod"],
  ["subaplicación", "subabsorción", "carga fabril subaplicada"],
  ["sobreaplicación", "sobreabsorción", "carga fabril sobreaplicada"],
  ["tasa predeterminada", "cuota predeterminada", "coeficiente de aplicación"],
  ["inventario", "existencia", "stock"],
];

const METHOD_GROUPS: { label: string; options: string[] }[] = [
  { label: "Valuación de inventarios", options: ["ppp", "precio promedio ponderado", "peps", "ueps", "fifo", "lifo"] },
  { label: "Sistema de costeo", options: ["costeo variable", "costeo por absorción", "costeo directo", "costeo completo"] },
  { label: "Base de aplicación de la carga fabril", options: ["horas máquina", "horas hombre", "unidades producidas", "costo primo"] },
  { label: "Sistema de amortización", options: ["sistema francés", "sistema alemán", "sistema americano"] },
];

const DETAIL_PATTERNS: [RegExp, string][] = [
  [/justifi(que|car|cá)/i, "Pide justificar las respuestas"],
  [/(expon|mostr|detall)\w* (el |los )?(procedimiento|c[aá]lculos|pasos)/i, "Pide mostrar el procedimiento o los cálculos"],
  [/sin (procedimiento|desarrollo)/i, "Menciona qué pasa con resultados sin procedimiento"],
  [/redonde\w*.{0,20}(\d+)\s*decimal/i, "Indica cómo redondear"],
  [/expres\w* (el resultado|los resultados|en \$|en pesos|en unidades)/i, "Indica en qué unidad expresar los resultados"],
  [/se (valorar[aá]|tendr[aá] en cuenta|evaluar[aá])/i, "Explica qué se valora al corregir"],
  [/(fundament|argument)\w*/i, "Pide fundamentar"],
  [/(estado de costos|cuadro|planilla|tabla).{0,30}(complet|arm|present)/i, "Pide presentar la resolución en cuadro o estado"],
];

function quoteFor(text: string, needle: string): string {
  const n = normalize(needle);
  const s = sentences(text).find((x) => normalize(x).includes(n));
  return truncate(s ?? text, 200);
}

function cite(c: Ch, quote?: string): Citation {
  return { chunkId: c.id, file: c.file, location: c.location, quote };
}

function countTerm(hay: string, term: string): number {
  const re = new RegExp(`(^|[^a-z0-9])${normalize(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "g");
  return (hay.match(re) ?? []).length;
}

export function buildProfile(subjectId: number): Profile {
  const chunks = all<Ch>(
    `SELECT c.id, c.file_id, f.name AS file, f.kind, c.location, c.text, c.topic_id, c.ord
     FROM chunks c JOIN files f ON f.id = c.file_id
     WHERE c.subject_id = ? AND c.quarantined = 0 AND f.kind IN (${PROFESSOR_KINDS.map(() => "?").join(",")})
     ORDER BY c.file_id, c.ord`,
    [subjectId, ...PROFESSOR_KINDS],
  );
  const files = all<{ id: number; name: string; kind: string }>(
    `SELECT id, name, kind FROM files WHERE subject_id = ? AND kind IN (${PROFESSOR_KINDS.map(() => "?").join(",")}) AND status IN ('listo','revisar')`,
    [subjectId, ...PROFESSOR_KINDS],
  );
  const norm = new Map(chunks.map((c) => [c.id, normalize(c.text)]));
  const gaps: string[] = [];

  // --- Terminología
  const terminology: Observation[] = [];
  for (const group of SYNONYMS) {
    const counts = group.map((term) => {
      let n = 0;
      const ev: Citation[] = [];
      for (const c of chunks) {
        const k = countTerm(norm.get(c.id)!, term);
        if (k) {
          n += k;
          if (ev.length < 3 && !ev.some((e) => e.file === c.file)) ev.push(cite(c, quoteFor(c.text, term)));
        }
      }
      return { term, n, ev };
    });
    const used = counts.filter((c) => c.n > 0).sort((a, b) => b.n - a.n);
    if (!used.length) continue;
    const top = used[0];
    const others = counts.filter((c) => c.term !== top.term);
    const otherTxt = others.filter((o) => o.n > 0).map((o) => `«${o.term}» (${o.n})`);
    terminology.push({
      text: `Usa «${top.term}» (${top.n} ${top.n === 1 ? "vez" : "veces"})${otherTxt.length ? `; también aparece ${otherTxt.join(", ")}` : ` y no usa ${others.slice(0, 2).map((o) => `«${o.term}»`).join(" ni ")}`}.`,
      evidence: top.ev,
      count: top.n,
      origin: "heuristica",
    });
  }
  terminology.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  // --- Fórmulas escritas en el material
  const formulas: Observation[] = [];
  const seenF = new Set<string>();
  for (const c of chunks) {
    for (const raw of c.text.split("\n")) {
      const line = raw.trim();
      if (line.length < 6 || line.length > 170) continue;
      const looks =
        (/[=÷×]/.test(line) && /[a-záéíóúñ]{2,}/i.test(line) && !/^\s*[A-Z]+\d+:/.test(line) && !/https?:/.test(line)) ||
        /^f[oó]rmula\s*:/i.test(line);
      if (!looks) continue;
      if (/\[=/.test(line)) continue; // celdas de Excel: van aparte
      // Un cálculo con números concretos es un ejemplo resuelto, no una fórmula.
      if ((line.match(/\d[\d.,]{2,}/g) ?? []).length >= 2) continue;
      const key = normalize(line).replace(/\s+/g, "");
      if (seenF.has(key)) {
        const f = formulas.find((x) => normalize(x.text).replace(/\s+/g, "") === key);
        if (f && f.evidence.length < 4 && !f.evidence.some((e) => e.chunkId === c.id)) f.evidence.push(cite(c, line));
        if (f) f.count = (f.count ?? 1) + 1;
        continue;
      }
      seenF.add(key);
      formulas.push({ text: line, evidence: [cite(c, line)], count: 1, origin: "heuristica" });
    }
  }
  formulas.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  // --- Fórmulas de Excel usadas en las planillas de la cátedra
  const cells = all<any>(
    `SELECT e.*, f.name AS file FROM excel_cells e JOIN files f ON f.id = e.file_id WHERE e.subject_id = ? AND f.kind IN (${PROFESSOR_KINDS.map(() => "?").join(",")}) LIMIT 60`,
    [subjectId, ...PROFESSOR_KINDS],
  );
  const excelFormulas: Observation[] = cells.map((cell) => ({
    text: `${cell.label ? cell.label + ": " : ""}${toSpanishFormula(cell.formula)}  (resultado ${cell.value})`,
    evidence: [{ chunkId: 0, file: cell.file, location: `hoja «${cell.sheet}», celda ${cell.cell}`, quote: cell.formula }],
    origin: "heuristica" as const,
  }));

  // --- Métodos preferidos
  const methods: Observation[] = [];
  for (const g of METHOD_GROUPS) {
    const counts = g.options.map((o) => {
      const hits = chunks.filter((c) => countTerm(norm.get(c.id)!, o) > 0);
      return { o, n: hits.reduce((a, c) => a + countTerm(norm.get(c.id)!, o), 0), ev: hits.slice(0, 3).map((c) => cite(c, quoteFor(c.text, o))) };
    });
    const used = counts.filter((c) => c.n > 0).sort((a, b) => b.n - a.n);
    if (!used.length) continue;
    methods.push({
      text: `${g.label}: ${used.map((u) => `${u.o.toUpperCase().length <= 4 ? u.o.toUpperCase() : u.o} (${u.n})`).join(", ")}.`,
      evidence: used[0].ev,
      count: used[0].n,
      origin: "heuristica",
    });
  }
  // Procedimientos paso a paso en resoluciones.
  const seenProc = new Set<string>();
  for (const c of chunks.filter((x) => x.kind === "resuelto" || x.kind === "corregido" || x.kind === "ejercicios")) {
    // Cada ejercicio resuelto por separado.
    const parts = c.text.split(/\n(?=\s*(?:ejercicio|problema)\s+\d)/i);
    for (const part of parts) {
      const name = /^\s*((?:ejercicio|problema)\s+[\d.]+)/i.exec(part)?.[1];
      const lines = part.split("\n").map((l) => l.trim());
      const steps = lines.filter((l) => /^(paso\s*\d+|\d+[°º)]|primero|luego|despu[eé]s|por [uú]ltimo|finalmente)\b/i.test(l));
      if (steps.length < 2) continue;
      const key = (name ?? "") + steps[0];
      if (seenProc.has(key)) continue;
      seenProc.add(key);
      const generic = steps.map((s) => s.split("=")[0].replace(/[.:]\s*$/, "").trim());
      methods.push({
        text: `Cómo resuelve ${name ?? "un ejercicio"} (${c.file}): ${generic.slice(0, 5).map((s) => truncate(s, 80)).join(" → ")}`,
        evidence: [cite(c, truncate(steps.join(" "), 200))],
        origin: "heuristica",
      });
    }
  }

  // --- Nivel de detalle esperado
  const detail: Observation[] = [];
  for (const [re, label] of DETAIL_PATTERNS) {
    const hits = chunks.filter((c) => re.test(c.text));
    if (!hits.length) continue;
    detail.push({
      text: `${label} (${hits.length} ${hits.length === 1 ? "fragmento" : "fragmentos"}).`,
      evidence: hits.slice(0, 3).map((c) => cite(c, truncate(sentences(c.text).find((s) => re.test(s)) ?? c.text, 200))),
      count: hits.length,
      origin: "heuristica",
    });
  }

  // --- Estructura de parciales
  const exams: ExamModel[] = [];
  const examFiles = files.filter((f) => f.kind === "parcial" || f.kind === "corregido");
  for (const f of examFiles) {
    const fc = chunks.filter((c) => c.file_id === f.id);
    const model = parseExam(f, fc);
    if (model.items.length) exams.push(model);
  }
  let structure: Profile["structure"] = null;
  const examStyle: Observation[] = [];
  if (exams.length) {
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const durations = exams.map((e) => e.durationMin).filter((d): d is number => d !== null);
    const prac = avg(exams.map((e) => e.items.filter((i) => i.type === "practica").length));
    const theo = avg(exams.map((e) => e.items.filter((i) => i.type === "teoria").length));
    const pts = exams.map((e) => e.items.reduce((a, i) => a + (i.points ?? 0), 0)).filter((p) => p > 0);
    const tPts = exams.flatMap((e) => e.items.filter((i) => i.type === "teoria").map((i) => i.points ?? 0)).reduce((a, b) => a + b, 0);
    const allPts = exams.flatMap((e) => e.items.map((i) => i.points ?? 0)).reduce((a, b) => a + b, 0);
    const formats = [...new Set(exams.flatMap((e) => e.items.map((i) => i.format)))];
    structure = {
      durationMin: durations.length ? Math.round(avg(durations)) : null,
      practice: Math.round(prac),
      theory: Math.round(theo),
      avgItems: Math.round(prac + theo),
      avgPoints: pts.length ? Math.round(avg(pts)) : null,
      theoryShare: allPts ? tPts / allPts : theo / Math.max(1, prac + theo),
      formats,
      basedOn: exams.length,
    };
    examStyle.push({
      text: `En ${exams.length} parcial(es) cargado(s): en promedio ${Math.round(prac)} ejercicio(s) práctico(s) y ${Math.round(theo)} pregunta(s) teórica(s)${structure.durationMin ? `, ${structure.durationMin} minutos` : ""}${allPts ? `; la teoría vale ${Math.round(structure.theoryShare * 100)}% del puntaje` : ""}.`,
      evidence: exams.map((e) => e.items[0].citation),
      origin: "heuristica",
    });
    if (formats.length) examStyle.push({ text: `Formatos de pregunta: ${formats.join(", ")}.`, evidence: exams.flatMap((e) => e.items.slice(0, 1).map((i) => i.citation)), origin: "heuristica" });
    const topicCounts = new Map<number, number>();
    exams.forEach((e) => e.items.forEach((i) => i.topicId && topicCounts.set(i.topicId, (topicCounts.get(i.topicId) ?? 0) + 1)));
    if (topicCounts.size) {
      const names = all<{ id: number; name: string }>("SELECT id, name FROM topics WHERE subject_id = ?", [subjectId]);
      const txt = [...topicCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `${names.find((x) => x.id === id)?.name ?? "?"} (${n})`)
        .join(", ");
      examStyle.push({ text: `Temas que toma: ${txt}.`, evidence: exams.flatMap((e) => e.items.filter((i) => i.topicId).slice(0, 1).map((i) => i.citation)), origin: "heuristica" });
    }
  } else gaps.push("No hay parciales ni modelos de examen cargados: el simulador usa una estructura genérica y lo avisa.");

  // --- Preguntas recurrentes entre parciales
  const recurring: Observation[] = [];
  const allItems = exams.flatMap((e) => e.items.map((i) => ({ ...i, fileId: e.fileId })));
  const used = new Set<number>();
  for (let i = 0; i < allItems.length; i++) {
    if (used.has(i)) continue;
    const group = [allItems[i]];
    for (let j = i + 1; j < allItems.length; j++) {
      if (used.has(j) || allItems[j].fileId === allItems[i].fileId) continue;
      const body = (t: string) => t.replace(/^\s*(ejercicio|pregunta|problema|punto|tema)\s*\S*\s*(\([^)]*\))?/i, "").slice(0, 400);
      if (body(allItems[i].text).length > 30 && jaccard(body(allItems[i].text), body(allItems[j].text)) >= 0.42) {
        group.push(allItems[j]);
        used.add(j);
      }
    }
    if (group.length >= 2) {
      recurring.push({
        text: `Aparece en ${group.length} parciales: «${truncate(group[0].text, 160)}»`,
        evidence: group.map((g) => g.citation),
        count: group.length,
        origin: "heuristica",
      });
    }
  }
  // Mismo tipo de ejercicio (tema + práctico) en varios parciales.
  const byTopic = new Map<number, typeof allItems>();
  for (const it of allItems.filter((x) => x.type === "practica" && x.topicId)) byTopic.set(it.topicId!, [...(byTopic.get(it.topicId!) ?? []), it]);
  const names = all<{ id: number; name: string }>("SELECT id, name FROM topics WHERE subject_id = ?", [subjectId]);
  for (const [tid, its] of byTopic) {
    const filesN = new Set(its.map((x) => x.fileId)).size;
    if (filesN >= 2) {
      recurring.push({
        text: `Ejercicio práctico de ${names.find((n) => n.id === tid)?.name ?? "este tema"} en ${filesN} parciales distintos.`,
        evidence: its.slice(0, 3).map((x) => x.citation),
        count: filesN,
        origin: "heuristica",
      });
    }
  }

  // --- Criterios de corrección (parciales corregidos)
  const grading: Observation[] = [];
  let gradingWeights: Profile["gradingWeights"] = null;
  for (const c of chunks.filter((x) => x.kind === "corregido" || /criterio|correcci[oó]n/i.test(x.text))) {
    for (const s of c.text.split("\n")) {
      if (/(se descuenta|descuento|puntaje|criterio|sin procedimiento|mal planteado|bien planteado|arrastre|error de c[aá]lculo|se considera|vale \d|puntos? si)/i.test(s) && s.length < 260) {
        grading.push({ text: truncate(s.trim(), 220), evidence: [cite(c, truncate(s.trim(), 200))], origin: "heuristica" });
      }
    }
    const proc = /procedimiento[^\d%]{0,25}(\d{1,3})\s*%/i.exec(c.text);
    const res = /resultado[^\d%]{0,25}(\d{1,3})\s*%/i.exec(c.text);
    if (proc && res && !gradingWeights) {
      const p = Number(proc[1]) / 100;
      const r = Number(res[1]) / 100;
      if (p + r > 0.5 && p + r <= 1.01) {
        const concept = Math.max(0, 1 - p - r);
        gradingWeights = {
          weights: { procedimiento: p, resultado: r, conceptos: concept || DEFAULT_WEIGHTS.conceptos * 0.5, presentacion: DEFAULT_WEIGHTS.presentacion },
          source: `Criterio del profesor: procedimiento ${proc[1]}% y resultado ${res[1]}% (${c.file}, ${c.location}).`,
          evidence: [cite(c, truncate(sentences(c.text).find((s) => /procedimiento/i.test(s)) ?? c.text, 200))],
        };
      }
    }
  }
  if (!files.some((f) => f.kind === "corregido")) gaps.push("No hay parciales corregidos: la corrección usa un criterio genérico y lo indica.");
  if (!formulas.length) gaps.push("No se encontraron fórmulas escritas en el material de la cátedra.");
  if (!files.length) gaps.push("No hay material de la cátedra cargado (los apuntes propios no cuentan como evidencia del profesor).");

  const previous = getProfile(subjectId);
  const profile: Profile = {
    generatedAt: new Date().toISOString(),
    sourceFiles: files,
    terminology: terminology.slice(0, 12),
    formulas: formulas.slice(0, 30),
    excelFormulas: excelFormulas.slice(0, 20),
    methods: methods.slice(0, 12),
    detail,
    examStyle,
    recurring: recurring.slice(0, 10),
    grading: dedupeObs(grading).slice(0, 12),
    ai: (previous?.ai ?? []).filter((o) => o.evidence.every((e) => e.chunkId === 0 || chunks.some((c) => c.id === e.chunkId))),
    exams,
    structure,
    gradingWeights,
    gaps,
  };
  run("INSERT INTO profiles(subject_id, json, updated_at) VALUES (?,?, datetime('now')) ON CONFLICT(subject_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at", [subjectId, JSON.stringify(profile)]);
  return profile;
}

function dedupeObs(o: Observation[]): Observation[] {
  const seen = new Set<string>();
  return o.filter((x) => {
    const k = normalize(x.text);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function getProfile(subjectId: number): Profile | null {
  const r = get<{ json: string }>("SELECT json FROM profiles WHERE subject_id = ?", [subjectId]);
  return r ? json<Profile | null>(r.json, null) : null;
}

const THEORY_RE = /\b(defin[aíe]|explique|explic[aá]|justifique|mencion[eá]|qu[eé] (es|son|se entiende)|diferenci|verdadero|falso|v\s*\/\s*f|conceptualmente|enumer|describ|compar[eá]|por qu[eé])/i;

function parseExam(f: { id: number; name: string; kind: string }, fc: Ch[]): ExamModel {
  // Texto del archivo con marcas de qué fragmento es cada parte.
  const segs: { text: string; chunk: Ch }[] = [];
  const header = /(?:^|\n)\s*(ejercicio|pregunta|problema|punto|tema)\s*(?:n[°º.]?\s*)?(\d+)\s*(?:\(([^)]*)\))?\s*[:.)\-–]?/gi;
  let durationMin: number | null = null;
  for (const c of fc) {
    const d = /(duraci[oó]n|tiempo)[^\d]{0,20}(\d+(?:[.,]\d+)?)\s*(horas?|hs|minutos|min)/i.exec(c.text);
    if (d && durationMin === null) durationMin = Math.round(Number(d[2].replace(",", ".")) * (/h/i.test(d[3]) ? 60 : 1));
    let last = 0;
    const text = c.text;
    const matches = [...text.matchAll(header)];
    if (!matches.length) {
      if (segs.length) segs[segs.length - 1].text += "\n" + text;
      continue;
    }
    if (matches[0].index! > 0 && segs.length) segs[segs.length - 1].text += "\n" + text.slice(0, matches[0].index);
    matches.forEach((m, i) => {
      const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
      segs.push({ text: text.slice(m.index!, end).trim(), chunk: c });
      last = end;
    });
    void last;
  }
  // Por el solapamiento entre fragmentos un mismo ítem puede aparecer dos veces: nos quedamos con el más largo.
  const byKey = new Map<string, { text: string; chunk: Ch }>();
  for (const sg of segs) {
    const k = /(ejercicio|pregunta|problema|punto|tema)\s*(?:n[°º.]?\s*)?(\d+)/i.exec(sg.text);
    const key = k ? k[1].toLowerCase() + k[2] : sg.text.slice(0, 30);
    const prev = byKey.get(key);
    if (!prev || sg.text.length > prev.text.length) byKey.set(key, prev ? { text: sg.text, chunk: prev.chunk } : sg);
  }
  const topicList = all<{ id: number; name: string; keywords: string }>("SELECT id, name, keywords FROM topics WHERE subject_id = (SELECT subject_id FROM files WHERE id = ?)", [f.id]).map((t) => ({ ...t, kw: json<string[]>(t.keywords, []) }));
  const items: ExamItem[] = [...byKey.values()].map((s) => {
    let topicId: number | null = null;
    let best = 0;
    for (const t of topicList) {
      const sc = topicScore(s.text, { name: t.name, keywords: t.kw });
      if (sc > best) {
        best = sc;
        topicId = t.id;
      }
    }
    const m = /(ejercicio|pregunta|problema|punto|tema)\s*(?:n[°º.]?\s*)?(\d+)/i.exec(s.text);
    const pts = /(\d+(?:[.,]\d+)?)\s*(puntos|ptos?|pts)\b/i.exec(s.text);
    const numbers = (s.text.match(/\$?\s?\d{1,3}(?:\.\d{3})+(?:,\d+)?|\$\s?\d+|\b\d{4,}\b/g) ?? []).length;
    const theory = THEORY_RE.test(s.text) && numbers < 3;
    let format = theory ? "desarrollo" : "práctico con cálculos";
    if (/verdadero|falso|v\s*\/\s*f/i.test(s.text)) format = "verdadero/falso";
    else if (/(^|\n)\s*[a-d]\)\s.+\n\s*[b-e]\)\s/i.test(s.text) && theory) format = "opción múltiple";
    return {
      n: m ? `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}` : "Ítem",
      type: theory ? "teoria" : "practica",
      points: pts ? Number(pts[1].replace(",", ".")) : null,
      format,
      text: s.text,
      topicId: best >= 2 ? topicId : s.chunk.topic_id,
      citation: cite(s.chunk, truncate(s.text, 180)),
    };
  });
  return { fileId: f.id, file: f.name, kind: f.kind, durationMin, items };
}

export function toSpanishFormula(f: string): string {
  const map: Record<string, string> = { SUM: "SUMA", AVERAGE: "PROMEDIO", ROUND: "REDONDEAR", ROUNDUP: "REDONDEAR.MAS", ROUNDDOWN: "REDONDEAR.MENOS", IF: "SI", NPV: "VNA", IRR: "TIR", PMT: "PAGO", SQRT: "RAIZ", VLOOKUP: "BUSCARV", SUMIF: "SUMAR.SI", COUNT: "CONTAR", COUNTIF: "CONTAR.SI", MAX: "MAX", MIN: "MIN", ABS: "ABS", FV: "VF", PV: "VA", RATE: "TASA", NPER: "NPER" };
  let out = f.replace(/\b([A-Z][A-Z.]+)\(/g, (m, n: string) => (map[n] ? map[n] + "(" : m));
  // Separador de argumentos: coma → punto y coma, y decimales con coma (fuera de comillas).
  out = out.replace(/(\d)\.(\d)/g, "$1§$2").replace(/,/g, ";").replace(/§/g, ",");
  return out.startsWith("=") ? out : "=" + out;
}

/** ¿Hay evidencia del método del profesor para este tema? (fórmulas o procedimientos en su material) */
export function methodEvidenceFor(subjectId: number, topicId: number | null, terms: string[]): Citation[] {
  if (!topicId) return [];
  const p = getProfile(subjectId);
  if (!p) return [];
  const ids = new Set(all<{ id: number }>("SELECT id FROM chunks WHERE topic_id = ? AND subject_id = ?", [topicId, subjectId]).map((r) => r.id));
  const nterms = terms.map(normalize);
  const out: Citation[] = [];
  for (const o of [...p.formulas, ...p.methods, ...p.ai]) {
    for (const e of o.evidence) {
      if (!ids.has(e.chunkId)) continue;
      const t = normalize(o.text);
      if (nterms.some((k) => t.includes(k)) && !out.some((x) => x.chunkId === e.chunkId)) out.push({ ...e, quote: o.text });
    }
  }
  return out.slice(0, 3);
}

// ------------------------------------------------------------------ Análisis con IA (opcional)

interface AiObs {
  observaciones: { categoria: string; observacion: string; fragmento_id: number; cita: string }[];
}

/**
 * Pide al modelo observaciones sobre el método del profesor y SOLO se guardan las que
 * citan un fragmento real y una cita que aparece en ese fragmento.
 */
export async function aiEnrichProfile(subjectId: number): Promise<{ added: number; discarded: number }> {
  if (!aiAvailable()) throw new Error("Hace falta una API key para el análisis con IA.");
  const chunks = all<Ch>(
    `SELECT c.id, c.file_id, f.name AS file, f.kind, c.location, c.text, c.topic_id, c.ord
     FROM chunks c JOIN files f ON f.id = c.file_id
     WHERE c.subject_id = ? AND c.quarantined = 0 AND f.kind IN ('parcial','resuelto','corregido','ejercicios','teoria')
     ORDER BY CASE f.kind WHEN 'corregido' THEN 0 WHEN 'resuelto' THEN 1 WHEN 'parcial' THEN 2 ELSE 3 END, c.ord LIMIT 45`,
    [subjectId],
  );
  if (!chunks.length) throw new Error("No hay material de la cátedra para analizar.");
  const docs = chunks.map((c, i) => docBlock(i + 1, { id: c.id, file: c.file, location: c.location, text: c.text.slice(0, 1400) })).join("\n\n");
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["observaciones"],
    properties: {
      observaciones: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["categoria", "observacion", "fragmento_id", "cita"],
          properties: {
            categoria: { type: "string", enum: ["terminologia", "metodo", "formula", "estructura_examen", "nivel_de_detalle", "criterio_de_correccion"] },
            observacion: { type: "string" },
            fragmento_id: { type: "integer" },
            cita: { type: "string" },
          },
        },
      },
    },
  };
  const r = await callJson<AiObs>({
    system: `Analizás cómo enseña, resuelve y evalúa un profesor universitario a partir de su material. ${DATA_POLICY}
Reglas:
- Cada observación debe basarse en UN fragmento concreto (su id) y citar textualmente una frase de ese fragmento.
- Describí el método observado del profesor, no conocimiento general de la materia.
- Si algo es conocimiento académico estándar sin rasgo propio del profesor, no lo incluyas.
- Máximo 15 observaciones, en español rioplatense, concretas.`,
    content: `Material de la cátedra:\n\n${docs}\n\nDevolvé las observaciones.`,
    schema,
    maxTokens: 12000,
  });
  const existing = getProfile(subjectId) ?? buildProfile(subjectId);
  let added = 0;
  let discarded = 0;
  const kept: Observation[] = [];
  for (const o of r.observaciones ?? []) {
    const c = chunks.find((x) => x.id === o.fragmento_id);
    if (!c || !quoteSupported(o.cita, c.text)) {
      discarded++;
      continue;
    }
    kept.push({ text: `${labelCat(o.categoria)}: ${o.observacion}`, evidence: [cite(c, truncate(o.cita, 200))], origin: "ia" });
    added++;
  }
  existing.ai = kept;
  run("UPDATE profiles SET json = ?, updated_at = datetime('now') WHERE subject_id = ?", [JSON.stringify(existing), subjectId]);
  return { added, discarded };
}

function labelCat(c: string) {
  return (
    {
      terminologia: "Terminología",
      metodo: "Método",
      formula: "Fórmula",
      estructura_examen: "Estructura de examen",
      nivel_de_detalle: "Nivel de detalle",
      criterio_de_correccion: "Criterio de corrección",
    } as Record<string, string>
  )[c] ?? c;
}

/** La cita tiene que estar en el fragmento (tolerando diferencias menores). */
export function quoteSupported(quote: string, text: string): boolean {
  const q = normalize(quote).replace(/\s+/g, " ").trim();
  const t = normalize(text).replace(/\s+/g, " ");
  if (q.length >= 12 && t.includes(q.slice(0, Math.min(q.length, 60)))) return true;
  const qt = tokenize(quote);
  if (qt.length < 3) return false;
  const tt = new Set(tokenize(text));
  return qt.filter((x) => tt.has(x)).length / qt.length >= 0.8;
}
