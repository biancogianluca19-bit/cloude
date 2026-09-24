import "./quiet.ts";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { createApp } from "./app.ts";
import { getDb } from "./db.ts";
import { seedDemo } from "./demo/seed.ts";

getDb();
const app = createApp();

const dist = path.resolve(process.cwd(), "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT ?? 3717);
app.listen(port, "0.0.0.0", async () => {
  if (process.env.FORJA_NO_DEMO !== "1") {
    const seeded = await seedDemo().catch((e) => console.error("No se pudo crear la materia demo:", e.message));
    if (seeded) console.log("Materia demo creada.");
  }
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => `http://${i!.address}:${port}`);
  console.log(`FORJA escuchando en http://localhost:${port}${lan.length ? "  ·  desde el celular (misma red wifi): " + lan.join(", ") : ""}`);
  if (!fs.existsSync(dist)) console.log("Modo desarrollo: la interfaz corre en Vite (http://localhost:5173).");
});
