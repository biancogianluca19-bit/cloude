// Punto de entrada en Vercel: una sola función atiende toda la API.
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.FORJA_DATA_DIR ??= "/tmp/forja";
process.env.FORJA_DEMO_DIR ??= path.join(here, "demo-material");

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let ready: Promise<Handler> | null = null;

async function init(): Promise<Handler> {
  await import("./quiet.ts");
  const { createApp } = await import("./app.ts");
  const storage = await import("./storage.ts");
  const { seedDemo } = await import("./demo/seed.ts");
  // Primera vez: si el store no tiene base todavía, se crea la materia demo y se guarda.
  await storage.syncBefore(true);
  if (process.env.FORJA_NO_DEMO !== "1") {
    const seeded = await seedDemo().catch((e) => console.error("[forja] demo:", e?.message ?? e));
    if (seeded) {
      storage.markDirty();
      await storage.flush();
    }
  }
  return createApp() as unknown as Handler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // La ruta original llega como parámetro (ver scripts/build-vercel.ts).
  const u = new URL(req.url ?? "/", "http://x");
  const p = u.searchParams.get("__forja");
  if (p !== null) {
    u.searchParams.delete("__forja");
    const qs = u.searchParams.toString();
    req.url = "/api/" + p + (qs ? "?" + qs : "");
  }
  try {
    ready ??= init();
    const app = await ready;
    app(req, res);
  } catch (e: any) {
    ready = null;
    console.error("[forja] no pudo iniciar:", e);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "FORJA no pudo iniciar: " + (e?.message ?? e) }));
  }
}
