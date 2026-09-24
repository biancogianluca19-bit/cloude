// Utilidades de texto en español: normalización, tokens, stemming liviano.

const STOP = new Set(
  `a al algo algunas algunos ante antes como con contra cual cuales cuando de del desde donde dos el ella ellas ellos
  en entre era eran es esa esas ese eso esos esta estas este esto estos fue fueron ha han hasta hay la las le les lo los
  mas más me mi mis muy no nos o otra otras otro otros para pero poco por porque que qué se sea sean segun según ser si sí
  sin sobre su sus tambien también tanto te tiene tienen todo todos tu tus un una unas uno unos y ya yo e u cada
  the of and to in is are be it this that for on as with by an or at from was were
  explicame explicá explica dame decime cómo como donde dónde sale resuelve resolver profesor profesora ejercicio parecido
  nada entendi entendí desde cero otro quiero saber puedo hacer hace`.split(/\s+/).filter(Boolean),
);

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalize(s: string): string {
  return stripAccents(s.toLowerCase());
}

/** Stemmer mínimo para español: saca plurales y sufijos frecuentes sin destrozar términos técnicos. */
export function stem(w: string): string {
  if (w.length <= 4) return w;
  const rules: [RegExp, string][] = [
    [/aciones$/, "acion"],
    [/iciones$/, "icion"],
    [/ciones$/, "cion"],
    [/siones$/, "sion"],
    [/idades$/, "idad"],
    [/mente$/, ""],
    [/ales$/, "al"],
    [/ores$/, "or"],
    [/ables$/, "able"],
    [/ibles$/, "ible"],
    [/es$/, "e"],
    [/s$/, ""],
  ];
  for (const [re, rep] of rules) {
    if (re.test(w)) {
      const out = w.replace(re, rep);
      if (out.length >= 3) return out;
    }
  }
  return w;
}

export function tokenize(s: string, { keepStop = false } = {}): string[] {
  const words = normalize(s).match(/[a-z0-9ñ]+(?:[.,][0-9]+)*/g) ?? [];
  const out: string[] = [];
  for (const w of words) {
    if (!keepStop && STOP.has(w)) continue;
    if (w.length < 2 && !/\d/.test(w)) continue;
    out.push(stem(w));
  }
  return out;
}

export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?;:])\s+(?=[A-ZÁÉÍÓÚÑ¿¡0-9•\-])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Similitud de Jaccard sobre tokens, útil para detectar preguntas repetidas entre parciales. */
export function jaccard(a: string, b: string): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n - 1).trimEnd() + "…" : clean;
}
