import { describe, it, expect } from "vitest";
import { TEMPLATES, instantiate } from "../server/exercises/library.ts";
import { solve, gradeNumeric } from "../server/exercises/grade.ts";
import { buildLayout, buildWorkbook, evalSpanishFormula, readWorkbookAnswers } from "../server/exercises/excel.ts";
import { evalExpr } from "../server/exercises/expr.ts";
import { parseNumber, close } from "../server/exercises/format.ts";

describe("plantillas", () => {
  for (const tpl of TEMPLATES) {
    it(`${tpl.key}: la solución es finita, las trampas difieren y las fórmulas de Excel dan lo mismo`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const spec = instantiate(tpl, seed * 7919);
        const sol = solve(spec);
        for (const s of spec.steps) expect(Number.isFinite(sol[s.id]), `${s.id} seed ${seed}`).toBe(true);
        const env = { ...spec.data, ...sol };
        for (const t of spec.traps) {
          const trapVal = evalExpr(t.expr, env);
          const step = spec.steps.find((s) => s.id === t.step)!;
          expect(close(trapVal, sol[t.step], step.unit), `trampa ${t.tag} coincide con la correcta (seed ${seed})`).toBe(false);
        }
        // Las fórmulas de Excel en castellano reproducen los valores.
        const layout = buildLayout(spec, sol);
        const cells: Record<string, number> = {};
        for (const r of layout.rows) if (r.kind === "dato") cells[r.cell] = r.value!;
        for (const r of layout.rows) {
          if (r.kind !== "paso") continue;
          const v = evalSpanishFormula(r.formula!, cells);
          expect(Math.abs(v - r.expected!)).toBeLessThan(1e-6 * Math.max(1, Math.abs(r.expected!)));
          cells[r.cell] = v;
        }
      }
    });
  }
});

describe("corrección", () => {
  const tpl = TEMPLATES.find((t) => t.key === "cp_unitario")!;
  const spec = instantiate(tpl, 42);
  const sol = solve(spec);

  it("todo bien da 100%", () => {
    const g = gradeNumeric(spec, Object.fromEntries(Object.entries(sol).map(([k, v]) => [k, v])));
    expect(g.score).toBeCloseTo(1);
    expect(g.errors).toHaveLength(0);
    expect(g.passedTraps).toContain("divide_por_vendidas");
  });

  it("detecta dividir por unidades vendidas y reconoce el arrastre", () => {
    const cuMal = sol.cp / spec.data.V;
    const g = gradeNumeric(spec, { cp: sol.cp, cu: cuMal, cv: cuMal * spec.data.V, if: cuMal * (spec.data.Pt - spec.data.V) });
    expect(g.errors.map((e) => e.tag)).toContain("divide_por_vendidas");
    expect(g.steps![0].status).toBe("correcto");
    expect(g.steps![1].status).toBe("incorrecto");
    expect(g.steps![2].status).toBe("arrastre");
    expect(g.summary).toMatch(/Hasta «Costo de producción» el procedimiento está bien/);
    expect(g.summary).toMatch(/vendidas/);
    expect(g.score).toBeGreaterThan(0.2);
    expect(g.score).toBeLessThan(0.8);
  });

  it("acepta números en formato argentino", () => {
    expect(parseNumber("1.234,56")).toBeCloseTo(1234.56);
    expect(parseNumber("$ 12.000")).toBe(12000);
    expect(parseNumber("1234.5")).toBeCloseTo(1234.5);
    expect(parseNumber("25%")).toBeCloseTo(0.25);
    expect(parseNumber("-3,5")).toBeCloseTo(-3.5);
    expect(parseNumber("abc")).toBeNull();
  });
});

describe("Excel", () => {
  it("genera VNA con rango y resta la inversión afuera", () => {
    const tpl = TEMPLATES.find((t) => t.key === "van_basico")!;
    const spec = instantiate(tpl, 3);
    const layout = buildLayout(spec, solve(spec));
    const va = layout.rows.find((r) => r.stepId === "va")!;
    expect(va.formula).toMatch(/^=VNA\(B\d+;B\d+:B\d+\)$/);
    expect(va.formulaEn).toMatch(/^=NPV\(B\d+,B\d+:B\d+\)$/);
  });

  it("SUMA usa rango contiguo", () => {
    const tpl = TEMPLATES.find((t) => t.key === "cp_unitario")!;
    const spec = instantiate(tpl, 3);
    const layout = buildLayout(spec, solve(spec));
    expect(layout.rows.find((r) => r.stepId === "cp")!.formula).toBe("=SUMA(B4:B6)");
  });

  it("lee una planilla resuelta con fórmulas", () => {
    const tpl = TEMPLATES.find((t) => t.key === "pe_basico")!;
    const spec = instantiate(tpl, 11);
    const sol = solve(spec);
    const layout = buildLayout(spec, sol);
    const buf = buildWorkbook(spec, layout, true);
    const read = readWorkbookAnswers(buf, spec, layout);
    for (const s of spec.steps) expect(read.answers[s.id]).toBeCloseTo(sol[s.id], 4);
    expect(Object.values(read.usedFormula).every(Boolean)).toBe(true);
    const tplBuf = buildWorkbook(spec, layout, false);
    const empty = readWorkbookAnswers(tplBuf, spec, layout);
    expect(Object.values(empty.answers).every((v) => v === null)).toBe(true);
  });
});
