import { test } from "node:test";
import assert from "node:assert/strict";
import { products, programs } from "../data/catalog.ts";
import { searchProducts } from "../lib/search.ts";

const slugs = (q: string) => searchProducts(products, programs, q).map((p) => p.slug);

test("busca por sigla", () => {
  const r = slugs("IPC");
  assert.deepEqual(r.slice(0, 4).sort(), ["ipc-buacar", "ipc-gimeno", "ipc-paruelo", "ipc-perot"]);
  assert.ok(slugs("icse").every((s) => s.startsWith("icse")));
});

test("ignora tildes y mayúsculas", () => {
  assert.equal(slugs("SEMIOLOGIA")[0], "semiologia-verzero");
  assert.equal(slugs("química")[0], "quimica-ferreira");
});

test("busca por cátedra y por nombre completo", () => {
  assert.equal(slugs("perot")[0], "ipc-perot");
  assert.equal(slugs("pensamiento cientifico").length, 4);
  assert.deepEqual(slugs("ipc perot"), ["ipc-perot"]);
});

test("busca por programa", () => {
  const edicion = slugs("edicion");
  assert.ok(edicion.includes("iae") && edicion.includes("fpi"));
  assert.ok(slugs("filo").includes("rome"));
  assert.ok(slugs("english").includes("clases-de-ingles"));
});

test("sin coincidencias devuelve vacío", () => {
  assert.deepEqual(slugs("anatomia"), []);
});

test("el catálogo es coherente", () => {
  const seen = new Set<string>();
  for (const p of products) {
    assert.ok(!seen.has(p.slug), `slug repetido: ${p.slug}`);
    seen.add(p.slug);
    assert.match(p.slug, /^[a-z0-9-]+$/, `slug inválido: ${p.slug}`);
    assert.ok(p.options.length > 0, `${p.slug} no tiene opciones`);
    assert.ok(p.listings.length > 0, `${p.slug} no está en ningún programa`);
    for (const l of p.listings) {
      const program = programs.find((x) => x.id === l.program);
      assert.ok(program?.groups.some((g) => g.id === l.group), `${p.slug}: grupo ${l.program}/${l.group} no existe`);
    }
    const ids = p.options.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length, `${p.slug}: opciones repetidas`);
  }
});

test("todas las imágenes del catálogo existen", async () => {
  const { existsSync } = await import("node:fs");
  for (const p of products) {
    for (const src of [p.cover, ...(p.gallery ?? [])]) {
      assert.ok(existsSync(new URL(`../public${src}`, import.meta.url)), `falta ${src} (${p.slug})`);
    }
  }
});
