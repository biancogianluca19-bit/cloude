import fs from "node:fs";
import path from "node:path";
import { get, run } from "../db.ts";
import { storeUpload, processFile } from "../ingest/pipeline.ts";
import { refreshSubject } from "../app.ts";

export const DEMO_DIR = path.resolve(process.env.FORJA_DEMO_DIR ?? path.join(process.cwd(), "demo-material"));

export function demoFiles(): string[] {
  if (!fs.existsSync(DEMO_DIR)) return [];
  return fs.readdirSync(DEMO_DIR).filter((f) => !f.startsWith(".")).sort();
}

/** Carga el material de ejemplo en una materia usando el mismo pipeline que un archivo real. */
export async function loadDemoFiles(subjectId: number) {
  const results = [];
  for (const f of demoFiles()) {
    const fid = storeUpload(subjectId, f, fs.readFileSync(path.join(DEMO_DIR, f)));
    results.push({ name: f, ...(await processFile(fid)) });
  }
  await refreshSubject(subjectId);
  return results;
}

function localIso(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Materia demo completa. Solo se crea si todavía no hay ninguna materia. */
export async function seedDemo(force = false) {
  if (!force && get("SELECT 1 FROM subjects LIMIT 1")) return null;
  if (!demoFiles().length) return null;
  const { id } = run("INSERT INTO subjects(name, professor, description, pass_threshold, is_demo) VALUES (?,?,?,?,1)", [
    "Sistemas de Costos (demo)",
    "Prof. Laura Méndez (ficticia)",
    "Materia de ejemplo con material inventado: apunte de cátedra, clase, resueltos, dos parciales, un parcial corregido, una planilla y apuntes propios.",
    0.6,
  ]);
  await loadDemoFiles(id);
  const d = new Date();
  d.setDate(d.getDate() + 6);
  d.setHours(8, 0, 0, 0);
  run("INSERT INTO exams(subject_id, title, date, units, topic_ids, daily_minutes) VALUES (?,?,?,?,?,?)", [id, "Primer parcial", localIso(d), "[]", "[]", 90]);
  return id;
}
