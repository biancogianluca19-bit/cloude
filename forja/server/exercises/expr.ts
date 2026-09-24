// Evaluador de expresiones seguro (sin eval). Se usa para calcular soluciones,
// corregir con arrastre de errores y generar fórmulas de Excel exactas.

export type Node =
  | { t: "num"; v: number }
  | { t: "var"; name: string }
  | { t: "neg"; a: Node }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "^"; a: Node; b: Node }
  | { t: "call"; fn: string; args: Node[] }
  | { t: "range"; from: string; to: string };

const FNS = ["round", "min", "max", "abs", "sum", "npv", "pmt", "irr", "sqrt", "avg"] as const;

export function parse(src: string): Node {
  let i = 0;
  const s = src.trim();
  const peek = () => s[i];
  const ws = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };
  const expect = (c: string) => {
    ws();
    if (s[i] !== c) throw new Error(`Se esperaba «${c}» en posición ${i} de «${src}»`);
    i++;
  };

  function primary(): Node {
    ws();
    const c = peek();
    if (c === "(") {
      i++;
      const e = expr();
      expect(")");
      return e;
    }
    if (c === "-") {
      i++;
      return { t: "neg", a: power() };
    }
    if (c === "+") {
      i++;
      return power();
    }
    const num = /^(\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i.exec(s.slice(i));
    if (num) {
      i += num[1].length;
      return { t: "num", v: Number(num[1]) };
    }
    const id = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(s.slice(i));
    if (id) {
      i += id[1].length;
      ws();
      if (peek() === "(") {
        i++;
        const args: Node[] = [];
        ws();
        if (peek() !== ")") {
          for (;;) {
            args.push(expr());
            ws();
            if (peek() === ",") {
              i++;
              continue;
            }
            break;
          }
        }
        expect(")");
        const fn = id[1].toLowerCase();
        if (!(FNS as readonly string[]).includes(fn)) throw new Error(`Función desconocida: ${id[1]}`);
        return { t: "call", fn, args };
      }
      if (peek() === ":") {
        i++;
        const to = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(s.slice(i));
        if (!to) throw new Error("Rango inválido");
        i += to[1].length;
        return { t: "range", from: id[1], to: to[1] };
      }
      return { t: "var", name: id[1] };
    }
    throw new Error(`Expresión inválida cerca de «${s.slice(i, i + 10)}» en «${src}»`);
  }

  function power(): Node {
    const base = primary();
    ws();
    if (peek() === "^") {
      i++;
      return { t: "bin", op: "^", a: base, b: power() };
    }
    return base;
  }

  function term(): Node {
    let a = power();
    for (;;) {
      ws();
      const c = peek();
      if (c === "*" || c === "/") {
        i++;
        a = { t: "bin", op: c, a, b: power() };
      } else return a;
    }
  }

  function expr(): Node {
    let a = term();
    for (;;) {
      ws();
      const c = peek();
      if (c === "+" || c === "-") {
        i++;
        a = { t: "bin", op: c, a, b: term() };
      } else return a;
    }
  }

  const out = expr();
  ws();
  if (i < s.length) throw new Error(`Sobra texto en «${src}»: «${s.slice(i)}»`);
  return out;
}

export type Env = Record<string, number>;

function npv(rate: number, flows: number[]) {
  return flows.reduce((acc, f, k) => acc + f / Math.pow(1 + rate, k + 1), 0);
}

export function irr(flows: number[]): number {
  // flows[0] es la inversión (t=0). Bisección robusta.
  const f = (r: number) => flows.reduce((acc, x, k) => acc + x / Math.pow(1 + r, k), 0);
  let lo = -0.99;
  let hi = 10;
  if (f(lo) * f(hi) > 0) return NaN;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (f(lo) * f(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export function evaluate(n: Node, env: Env, ranges?: (from: string, to: string) => number[]): number {
  switch (n.t) {
    case "num":
      return n.v;
    case "var": {
      if (!(n.name in env)) throw new Error(`Variable sin valor: ${n.name}`);
      return env[n.name];
    }
    case "neg":
      return -evaluate(n.a, env, ranges);
    case "bin": {
      const a = evaluate(n.a, env, ranges);
      const b = evaluate(n.b, env, ranges);
      switch (n.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "^":
          return Math.pow(a, b);
      }
    }
    // falls through (inalcanzable)
    case "range":
      throw new Error("Un rango solo puede usarse dentro de una función");
    case "call": {
      const vals: number[] = [];
      for (const a of n.args) {
        if (a.t === "range") {
          if (!ranges) throw new Error("Rangos no soportados en este contexto");
          vals.push(...ranges(a.from, a.to));
        } else vals.push(evaluate(a, env, ranges));
      }
      switch (n.fn) {
        case "round": {
          const d = vals[1] ?? 0;
          const f = Math.pow(10, d);
          return Math.round((vals[0] + Number.EPSILON * Math.sign(vals[0])) * f) / f;
        }
        case "min":
          return Math.min(...vals);
        case "max":
          return Math.max(...vals);
        case "abs":
          return Math.abs(vals[0]);
        case "sqrt":
          return Math.sqrt(vals[0]);
        case "sum":
          return vals.reduce((a, b) => a + b, 0);
        case "avg":
          return vals.reduce((a, b) => a + b, 0) / vals.length;
        case "npv":
          return npv(vals[0], vals.slice(1));
        case "irr":
          return irr(vals);
        case "pmt": {
          // Igual que Excel: PAGO(tasa; nper; va) devuelve negativo para va positivo.
          const [r, nper, pv] = vals;
          if (r === 0) return -pv / nper;
          return -(pv * r) / (1 - Math.pow(1 + r, -nper));
        }
      }
      throw new Error(`Función desconocida ${n.fn}`);
    }
  }
}

export function evalExpr(src: string, env: Env): number {
  return evaluate(parse(src), env);
}

export function variables(n: Node, out = new Set<string>()): Set<string> {
  if (n.t === "var") out.add(n.name);
  else if (n.t === "neg") variables(n.a, out);
  else if (n.t === "bin") {
    variables(n.a, out);
    variables(n.b, out);
  } else if (n.t === "call") n.args.forEach((a) => variables(a, out));
  else if (n.t === "range") {
    out.add(n.from);
    out.add(n.to);
  }
  return out;
}
