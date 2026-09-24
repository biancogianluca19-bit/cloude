// Arma .vercel/output (Build Output API v3): interfaz estática + una función Node con la API.
// Lo ejecuta Vercel como comando de build: `npm run build:vercel`.
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { nodeFileTrace } from "@vercel/nft";

const root = path.resolve(".");
const out = path.join(root, ".vercel", "output");
const fn = path.join(out, "functions", "api.func");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(fn, { recursive: true });

// 1. Interfaz (ya compilada por vite build).
if (!fs.existsSync(path.join(root, "dist", "index.html"))) throw new Error("Falta dist/: corré vite build antes.");
fs.cpSync(path.join(root, "dist"), path.join(out, "static"), { recursive: true });

// 2. Servidor en un solo archivo ESM; las dependencias quedan externas y se copian abajo.
const entry = path.join(fn, "index.mjs");
await build({
  entryPoints: [path.join(root, "server", "vercel.ts")],
  outfile: entry,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "warning",
});

// 3. Dependencias que usa la función (rastreadas) + archivos que se cargan por ruta.
const { fileList } = await nodeFileTrace([entry], { base: root, processCwd: root });
const extra = [
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  "node_modules/pdfjs-dist/legacy/build/pdf.mjs",
  "node_modules/tesseract.js",
  "node_modules/tesseract.js-core",
  "node_modules/node-fetch",
  "node_modules/whatwg-url",
  "node_modules/tr46",
  "node_modules/webidl-conversions",
  "node_modules/regenerator-runtime",
  "node_modules/is-url",
  "node_modules/bmp-js",
  "node_modules/idb-keyval",
  "node_modules/wasm-feature-detect",
  "node_modules/zlibjs",
  "node_modules/opencollective-postinstall",
];
let copied = 0;
const copy = (rel: string) => {
  const src = path.join(root, rel);
  if (!fs.existsSync(src)) return;
  const dst = path.join(fn, rel);
  if (path.resolve(src) === path.resolve(entry)) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true, dereference: true });
  copied++;
};
for (const f of fileList) {
  if (f.startsWith(".vercel/")) continue;
  const abs = path.join(root, f);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) copy(f);
}
for (const e of extra) copy(e);
fs.cpSync(path.join(root, "demo-material"), path.join(fn, "demo-material"), { recursive: true });
fs.writeFileSync(path.join(fn, "package.json"), JSON.stringify({ type: "module" }));

fs.writeFileSync(
  path.join(fn, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      maxDuration: 300,
      memory: 2048,
    },
    null,
    2,
  ),
);

// 4. Rutas: la API va a la función con la ruta original como parámetro; el resto es la SPA.
fs.writeFileSync(
  path.join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "^/assets/(.*)$", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
        { src: "^/api/(.*)$", dest: "/api?__forja=$1" },
        { handle: "filesystem" },
        { src: "^/(.*)$", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);

const size = (dir: string): number =>
  fs.readdirSync(dir, { withFileTypes: true }).reduce((a, d) => a + (d.isDirectory() ? size(path.join(dir, d.name)) : fs.statSync(path.join(dir, d.name)).size), 0);
console.log(`Build Output listo: ${copied} dependencias copiadas, función de ${(size(fn) / 1e6).toFixed(1)} MB.`);
