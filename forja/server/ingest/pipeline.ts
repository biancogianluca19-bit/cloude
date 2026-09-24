import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { all, get, run, tx, json, UPLOAD_DIR } from "../db.ts";
import { extractFile, IMAGE_EXT, SUPPORTED, type Unit } from "./extract.ts";
import { sanitize, scanHidden, scanText, severityRank, type Finding } from "./security.ts";
import { invalidateIndex } from "../retrieval/search.ts";
import { assignTopics } from "../learning/topics.ts";
import { ocrImage, ocrPdf } from "./ocr.ts";
import { normalize } from "../retrieval/text.ts";

export type FileKind = "parcial" | "resuelto" | "corregido" | "teoria" | "ejercicios" | "apunte" | "planilla";

export const KIND_LABELS: Record<FileKind, string> = {
  parcial: "Parcial o modelo de examen",
  resuelto: "Ejercicios resueltos por la cátedra",
  corregido: "Parcial corregido",
  teoria: "Teoría / clases de la cátedra",
  ejercicios: "Guía de ejercicios",
  apunte: "Apunte propio",
  planilla: "Planilla de Excel",
};

/** Material que cuenta como evidencia del método del profesor (los apuntes propios no). */
export const PROFESSOR_KINDS: FileKind[] = ["parcial", "resuelto", "corregido", "teoria", "ejercicios", "planilla"];

export function guessKind(name: string, ext: string, sample: string): FileKind {
  const n = normalize(name);
  const s = normalize(sample.slice(0, 3000));
  if (/corregid|correccion|devolucion/.test(n)) return "corregido";
  if (/resuel|solucion|resolucion/.test(n)) return "resuelto";
  if (/parcial|examen|final|recuperatorio|modelo|simulacro/.test(n)) return /resuel|solucion/.test(s) ? "resuelto" : "parcial";
  if (/mis apuntes|mi apunte|apunte propio|mis notas|mi resumen|notas propias/.test(n)) return "apunte";
  if (/catedra|profesor|clase|teorica|unidad/.test(n)) return "teoria";
  if (/apunte/.test(n)) return "apunte";
  if (/guia|practica|ejercicio|tp\b|trabajo practico/.test(n)) return "ejercicios";
  if (["xls", "xlsx", "xlsm", "csv"].includes(ext)) return "planilla";
  if (/(^|\s)(parcial|examen)\b.{0,40}(puntos|tiempo|duracion)/.test(s)) return "parcial";
  if (/resolucion|solucion:/.test(s)) return "resuelto";
  return "teoria";
}

const MAX_CHUNK = 1100;

export function chunkUnit(u: Unit): { location: string; text: string }[] {
  const text = u.text.trim();
  if (!text) return [];
  if (text.length <= MAX_CHUNK) return [{ location: u.location, text }];
  const paras = text.split(/\n+/);
  const out: { location: string; text: string }[] = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n" + p).length > MAX_CHUNK && cur) {
      out.push({ location: u.location, text: cur.trim() });
      // Solapamiento: la última oración del bloque anterior da contexto.
      const tail = cur.split(/(?<=[.!?])\s+/).slice(-1)[0] ?? "";
      cur = tail.length < 250 ? tail + "\n" + p : p;
    } else cur += (cur ? "\n" : "") + p;
    while (cur.length > MAX_CHUNK * 1.6) {
      out.push({ location: u.location, text: cur.slice(0, MAX_CHUNK) });
      cur = cur.slice(MAX_CHUNK - 150);
    }
  }
  if (cur.trim()) out.push({ location: u.location, text: cur.trim() });
  return out.map((c, i) => ({ ...c, location: out.length > 1 ? `${c.location} (parte ${i + 1}/${out.length})` : c.location }));
}

export function storeUpload(subjectId: number, originalName: string, buffer: Buffer, mime = ""): number {
  const ext = (path.extname(originalName).slice(1) || "").toLowerCase();
  if (!SUPPORTED.includes(ext)) throw new Error(`Formato .${ext || "?"} no soportado. Aceptados: ${SUPPORTED.join(", ")}`);
  const dir = path.join(UPLOAD_DIR, String(subjectId));
  fs.mkdirSync(dir, { recursive: true });
  const safe = originalName.replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ ]+/g, "_").slice(-120);
  const dest = path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString("hex")}-${safe}`);
  fs.writeFileSync(dest, buffer);
  const { id } = run("INSERT INTO files(subject_id, name, ext, mime, size, path, status) VALUES (?,?,?,?,?,?, 'procesando')", [
    subjectId,
    originalName,
    ext,
    mime,
    buffer.length,
    dest,
  ]);
  return id;
}

export interface ProcessResult {
  fileId: number;
  chunks: number;
  alerts: number;
  quarantined: number;
  warnings: string[];
}

export async function processFile(fileId: number, opts: { kind?: FileKind } = {}): Promise<ProcessResult> {
  const file = get<any>("SELECT * FROM files WHERE id = ?", [fileId]);
  if (!file) throw new Error("Archivo inexistente");
  try {
    let ex = await extractFile(file.path, file.ext);
    const warnings = [...ex.warnings];
    if (ex.needsOcr) {
      const ocr = IMAGE_EXT.includes(file.ext) ? await ocrImage(file.path) : await ocrPdf(file.path);
      if (ocr) {
        ex = { ...ex, units: ocr.units, extractor: ex.extractor + " + " + ocr.method };
        warnings.push(...ocr.warnings);
      } else {
        warnings.push(
          IMAGE_EXT.includes(file.ext)
            ? "No se pudo leer el texto de la imagen. Podés pegar una transcripción desde el detalle del archivo."
            : "El PDF parece escaneado y no se pudo aplicar OCR.",
        );
      }
    }
    const sample = ex.units.map((u) => u.text).join("\n").slice(0, 4000);
    const kind: FileKind = opts.kind ?? (file.kind !== "material" ? file.kind : guessKind(file.name, file.ext, sample));

    let chunkCount = 0;
    let alertCount = 0;
    let quarantined = 0;
    tx(() => {
      run("DELETE FROM chunks WHERE file_id = ?", [fileId]);
      run("DELETE FROM security_alerts WHERE file_id = ?", [fileId]);
      run("DELETE FROM excel_cells WHERE file_id = ?", [fileId]);
      let ord = 0;
      for (const u of ex.units) {
        const hiddenFindings = scanHidden(u.hidden);
        for (const h of hiddenFindings) {
          insertAlert(file.subject_id, fileId, null, u.location, h);
          alertCount++;
        }
        // Caracteres invisibles, base64, etc.: se revisan sobre el texto original y se reportan una vez por unidad.
        const marks = scanText(u.text).filter((f) => f.hidden);
        const clean = sanitize(u.text);
        let first = true;
        for (const c of chunkUnit({ ...u, text: clean })) {
          const visible = scanText(c.text).filter((f) => !f.hidden);
          const danger = visible.some((f) => f.severity === "alto");
          const r = run("INSERT INTO chunks(subject_id, file_id, ord, location, page, heading, text, quarantined) VALUES (?,?,?,?,?,?,?,?)", [
            file.subject_id,
            fileId,
            ord++,
            c.location,
            u.page ?? null,
            u.heading ?? "",
            c.text,
            danger ? 1 : 0,
          ]);
          chunkCount++;
          if (danger) quarantined++;
          for (const f of [...visible, ...(first ? marks : [])]) {
            insertAlert(file.subject_id, fileId, r.id, c.location, f);
            alertCount++;
          }
          first = false;
        }
        if (first && marks.length) {
          for (const f of marks) {
            insertAlert(file.subject_id, fileId, null, u.location, f);
            alertCount++;
          }
        }
      }
      for (const cell of ex.cells) {
        run("INSERT INTO excel_cells(subject_id, file_id, sheet, cell, formula, value, label) VALUES (?,?,?,?,?,?,?)", [
          file.subject_id,
          fileId,
          cell.sheet,
          cell.cell,
          cell.formula,
          cell.value,
          cell.label,
        ]);
      }
      const status = chunkCount === 0 ? "sin_texto" : alertCount && maxSeverity(fileId) >= 3 ? "revisar" : "listo";
      run("UPDATE files SET status = ?, kind = ?, extractor = ?, units = ?, error = ? WHERE id = ?", [
        status,
        kind,
        ex.extractor,
        ex.units.length,
        warnings.length ? warnings.join(" ") : null,
        fileId,
      ]);
    });
    assignTopics(file.subject_id);
    invalidateIndex(file.subject_id);
    return { fileId, chunks: chunkCount, alerts: alertCount, quarantined, warnings };
  } catch (e: any) {
    run("UPDATE files SET status = 'error', error = ? WHERE id = ?", [String(e?.message ?? e), fileId]);
    throw e;
  }
}

function maxSeverity(fileId: number): number {
  const rows = all<{ severity: string }>("SELECT severity FROM security_alerts WHERE file_id = ?", [fileId]);
  return rows.reduce((m, r) => Math.max(m, severityRank(r.severity as any)), 0);
}

function insertAlert(subjectId: number, fileId: number, chunkId: number | null, location: string, f: Finding) {
  const text = f.content || f.snippet;
  run(
    "INSERT INTO security_alerts(subject_id, file_id, chunk_id, location, snippet, reason, rule, severity, hidden, decision) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [subjectId, fileId, chunkId, location, text.length > 1500 ? text.slice(0, 1500) + "…" : text, f.reason, f.rule, f.severity, f.hidden ? 1 : 0, f.severity === "bajo" ? "informativa" : "pendiente"],
  );
}

/**
 * Decisión del usuario sobre una alerta.
 * - excluir: el fragmento queda fuera del conocimiento.
 * - incluir: el fragmento entra como dato (nunca como instrucción). Si era texto oculto,
 *   se agrega como fragmento nuevo marcado como tal.
 */
export function decideAlert(alertId: number, decision: "incluir" | "excluir") {
  const a = get<any>("SELECT * FROM security_alerts WHERE id = ?", [alertId]);
  if (!a) throw new Error("Alerta inexistente");
  tx(() => {
    run("UPDATE security_alerts SET decision = ? WHERE id = ?", [decision === "incluir" ? "incluida" : "excluida", alertId]);
    if (a.chunk_id && !a.hidden) {
      const others = get<{ n: number }>(
        "SELECT count(*) n FROM security_alerts WHERE chunk_id = ? AND id != ? AND severity = 'alto' AND hidden = 0 AND decision NOT IN ('incluida')",
        [a.chunk_id, alertId],
      )!.n;
      run("UPDATE chunks SET quarantined = ? WHERE id = ?", [decision === "incluir" && others === 0 ? 0 : 1, a.chunk_id]);
    } else if (a.hidden && decision === "incluir") {
      const maxOrd = get<{ m: number }>("SELECT coalesce(max(ord), 0) m FROM chunks WHERE file_id = ?", [a.file_id])!.m;
      run("INSERT INTO chunks(subject_id, file_id, ord, location, heading, text, quarantined) VALUES (?,?,?,?,?,?,0)", [
        a.subject_id,
        a.file_id,
        maxOrd + 1,
        a.location + " (texto oculto incluido por vos)",
        "Texto oculto",
        a.snippet,
      ]);
    } else if (a.hidden && decision === "excluir") {
      run("DELETE FROM chunks WHERE file_id = ? AND location = ? AND heading = 'Texto oculto'", [a.file_id, a.location + " (texto oculto incluido por vos)"]);
    }
    const pending = get<{ n: number }>("SELECT count(*) n FROM security_alerts WHERE file_id = ? AND decision = 'pendiente' AND severity = 'alto'", [a.file_id])!.n;
    run("UPDATE files SET status = CASE WHEN status IN ('revisar','listo') THEN ? ELSE status END WHERE id = ?", [pending ? "revisar" : "listo", a.file_id]);
  });
  assignTopics(a.subject_id);
  invalidateIndex(a.subject_id);
}

export function deleteFile(fileId: number) {
  const f = get<any>("SELECT * FROM files WHERE id = ?", [fileId]);
  if (!f) return;
  run("DELETE FROM files WHERE id = ?", [fileId]);
  try {
    fs.unlinkSync(f.path);
  } catch {
    /* ya no estaba */
  }
  invalidateIndex(f.subject_id);
}

/** Texto transcripto a mano por el usuario (para imágenes sin OCR). */
export async function addManualText(fileId: number, text: string) {
  const f = get<any>("SELECT * FROM files WHERE id = ?", [fileId]);
  if (!f) throw new Error("Archivo inexistente");
  const txt = f.path + ".transcripcion.txt";
  fs.writeFileSync(txt, text);
  const findings = scanText(text);
  tx(() => {
    run("DELETE FROM chunks WHERE file_id = ?", [fileId]);
    let ord = 0;
    for (const c of chunkUnit({ location: "transcripción", text: sanitize(text), hidden: [] })) {
      const danger = findings.some((x) => x.severity === "alto");
      const r = run("INSERT INTO chunks(subject_id, file_id, ord, location, text, quarantined) VALUES (?,?,?,?,?,?)", [f.subject_id, fileId, ord++, c.location, c.text, danger ? 1 : 0]);
      for (const x of findings) insertAlert(f.subject_id, fileId, r.id, c.location, x);
    }
    run("UPDATE files SET status = 'listo', extractor = coalesce(extractor,'') || ' + transcripción manual' WHERE id = ?", [fileId]);
  });
  assignTopics(f.subject_id);
  invalidateIndex(f.subject_id);
}

export function fileKinds() {
  return KIND_LABELS;
}

export { json };
