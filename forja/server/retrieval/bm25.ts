import { tokenize } from "./text.ts";

export interface Doc {
  id: number;
  text: string;
  /** Texto extra con más peso (p. ej. título de diapositiva o nombre de archivo). */
  boost?: string;
}

export interface Hit {
  id: number;
  score: number;
}

/** Índice BM25 en memoria. Se reconstruye por materia cuando cambia el material. */
export class BM25 {
  private k1 = 1.4;
  private b = 0.72;
  private docs = new Map<number, Map<string, number>>();
  private lens = new Map<number, number>();
  private df = new Map<string, number>();
  private avgLen = 1;

  constructor(docs: Doc[]) {
    let total = 0;
    for (const d of docs) {
      const tf = new Map<string, number>();
      const toks = tokenize(d.text);
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      if (d.boost) for (const t of tokenize(d.boost)) tf.set(t, (tf.get(t) ?? 0) + 2);
      this.docs.set(d.id, tf);
      const len = toks.length || 1;
      this.lens.set(d.id, len);
      total += len;
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    this.avgLen = docs.length ? total / docs.length : 1;
  }

  get size() {
    return this.docs.size;
  }

  idf(term: string): number {
    const n = this.docs.size;
    const df = this.df.get(term) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  search(query: string, k = 8, filter?: (id: number) => boolean): Hit[] {
    const qTerms = tokenize(query);
    // Bigrams implícitos: premiamos documentos que contienen términos contiguos de la consulta.
    const hits: Hit[] = [];
    if (!qTerms.length) return hits;
    const uniq = [...new Set(qTerms)];
    for (const [id, tf] of this.docs) {
      if (filter && !filter(id)) continue;
      const len = this.lens.get(id)!;
      let s = 0;
      let matched = 0;
      for (const t of uniq) {
        const f = tf.get(t);
        if (!f) continue;
        matched++;
        s += this.idf(t) * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * len) / this.avgLen)));
      }
      if (s > 0) {
        // Cobertura de la consulta: si coinciden más términos distintos, sube.
        s *= 0.6 + 0.4 * (matched / uniq.length);
        hits.push({ id, score: s });
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, k);
  }
}
