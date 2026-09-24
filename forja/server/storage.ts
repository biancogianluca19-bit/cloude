import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { waitUntil } from "@vercel/functions";
import { DATA_DIR, closeDb, dbPath, getDb } from "./db.ts";

// Persistencia para entornos sin disco propio (Vercel). La base SQLite vive en /tmp y se
// sincroniza con un store privado de Vercel Blob; los archivos subidos también se guardan ahí.
// Sin BLOB_READ_WRITE_TOKEN todo esto no hace nada y FORJA usa el disco local.

export const BLOB_MODE = !!process.env.BLOB_READ_WRITE_TOKEN && process.env.FORJA_STORAGE !== "local";
const PREFIX = process.env.FORJA_BLOB_PREFIX ?? "forja/";
const DB_KEY = PREFIX + "db/forja.db";

// Cupo del plan gratuito de Vercel Blob por mes: 2.000 operaciones avanzadas (put, list) y
// 10.000 simples (head, get sin caché). Pasado el cupo, el store queda bloqueado 30 días.
// Por eso los cambios se agrupan: se suben 2 minutos después del primero (o antes, si el navegador
// avisa que la app pasó a segundo plano). Así, estudiando sin parar, son como mucho 30 subidas por hora.
export const BLOB_QUOTA = { advanced: 2000, simple: 10000 };
const FLUSH_AFTER_MS = 120_000;
/** Con el cupo muy usado, se agrupa más todavía (por debajo de los 300 s que vive la función). */
const SAVING_FLUSH_AFTER_MS = 270_000;
/** Cada cuánto una lectura vuelve a mirar el store aunque el navegador ya tenga esta versión. */
const RECHECK_READ_MS = 5 * 60_000;
const RECHECK_WRITE_MS = 60_000;
/** Lectura sin versión del navegador (otro dispositivo, primera visita). */
const CHECK_EVERY_MS = 15_000;
/** Cuánto se espera a que otra instancia suba sus cambios pendientes. */
const WAIT_OTHER_MS = 30_000;

type BlobMod = typeof import("@vercel/blob");
let mod: BlobMod | null = null;
async function blob(): Promise<BlobMod> {
  if (!mod) mod = await import("@vercel/blob");
  return mod;
}

const INSTANCE = Math.random().toString(36).slice(2, 8);
let etag: string | null = null;
const events: string[] = [];
function note(e: string) {
  events.push(new Date().toISOString().slice(11, 19) + " " + e);
  if (events.length > 30) events.shift();
}
let loaded = false;
let lastCheck = 0;
let dirty = false;
let dirtySince = 0;
let seq = 0;
/** Cambios locales todavía sin subir, en orden. null = cambio sin changeset (no se puede fusionar). */
let pending: (Uint8Array | null)[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushWaiter: { promise: Promise<void>; resolve: () => void } | null = null;
let lock: Promise<unknown> = Promise.resolve();
/** Pedidos en curso en esta instancia (informativo). */
let active = 0;
let requestQueue: Promise<unknown> = Promise.resolve();

// Operaciones contadas en esta instancia desde el último guardado; se suman al total del mes en la base.
const ops = { advanced: 0, simple: 0 };

/**
 * En la versión publicada, cada instancia atiende los pedidos de a uno: ninguna escritura
 * corre sobre una copia desactualizada. Devuelve la función para liberar el turno.
 */
export function acquireRequestSlot(): Promise<() => void> {
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const prev = requestQueue;
  requestQueue = prev.then(() => mine);
  return prev.then(() => {
    active++;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      active--;
      release();
    };
  });
}

/** Serializa las operaciones de sincronización dentro de la instancia. */
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = lock.then(fn, fn);
  lock = next.catch(() => {});
  return next;
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** Trae la base del store si cambió desde la última vez. Nunca con cambios locales sin subir. */
async function pull(force = false) {
  const { get } = await blob();
  // Si la copia local no existe (instancia nueva o /tmp limpio), se descarga siempre.
  const haveLocal = fs.existsSync(dbPath());
  ops.simple++;
  const r = await get(DB_KEY, { access: "private", useCache: false, ...(etag && !force && haveLocal ? { ifNoneMatch: etag } : {}) }).catch((e: any) => {
    if (e?.name === "BlobNotFoundError") return null;
    throw e;
  });
  lastCheck = Date.now();
  loaded = true;
  if (!r) return; // todavía no hay base guardada: se usa la local (nueva)
  if (r.statusCode === 304) return;
  const buf = await readStream(r.stream);
  closeDb();
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const suffix of ["-journal", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });
  fs.writeFileSync(file, buf);
  etag = normTag(r.blob.etag);
}

/**
 * Versión de la base que tiene esta instancia. Con cambios sin subir lleva además la marca de
 * la instancia: si el próximo pedido del navegador cae en otra, esa sabe que tiene que esperar.
 */
export function currentVersion(): string | null {
  if (dirty) return `${etag ?? "nueva"}|${INSTANCE}.${seq}`;
  return etag;
}

function parseVersion(v: string): { base: string; owner: string | null } {
  const [base, rest] = v.split("|");
  return { base, owner: rest ? rest.split(".")[0] : null };
}

/**
 * Antes de atender un pedido: asegura que la base local sirva para responderlo.
 * @param write  el pedido puede escribir.
 * @param seen   última versión que vio el navegador.
 */
export async function syncBefore(write: boolean, seen?: string | null) {
  if (!BLOB_MODE) return;
  await exclusive(async () => {
    const v = seen ? parseVersion(seen) : null;
    const mine = etag ?? "nueva";
    if (v?.owner && v.owner !== INSTANCE) {
      // Otra instancia tiene cambios que el navegador ya vio y todavía no subió: se espera a que lo haga.
      if (dirty) await flushLocked();
      await waitForRemoteChange(v.base);
      await pull();
      return;
    }
    if (v && v.base !== mine) {
      // El navegador vio una versión distinta (otra instancia guardó): se sube lo propio y se trae la última.
      if (dirty) await flushLocked();
      await pull();
      return;
    }
    if (dirty) {
      // Esta instancia tiene lo más nuevo; se sube cuando termine la actividad.
      if (!timer) schedule();
      return;
    }
    const age = Date.now() - lastCheck;
    if (loaded) {
      if (v && age < (write ? RECHECK_WRITE_MS : RECHECK_READ_MS)) return;
      if (!v && !write && age < CHECK_EVERY_MS) return;
    }
    await pull();
  });
}

async function waitForRemoteChange(base: string) {
  const until = Date.now() + WAIT_OTHER_MS;
  while (Date.now() < until) {
    const t = await remoteEtag();
    if ((t ?? "nueva") !== base) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  note("esperé a otra instancia sin ver cambios");
}

/** Registra que un pedido cambió la base. Se sube agrupado, sin demorar la respuesta. */
export function recordChange(changeset: Uint8Array | null, label = "cambio") {
  if (!BLOB_MODE) return;
  if (!dirty) {
    dirty = true;
    dirtySince = Date.now();
  }
  seq++;
  pending.push(changeset && changeset.length ? changeset : null);
  if (!changeset) note(`sin changeset ${label}`);
  schedule();
}

/** Compatibilidad: un cambio sin changeset. */
export function markDirty() {
  recordChange(null, "manual");
}

function savingMode(): boolean {
  try {
    return monthUsage().advanced >= BLOB_QUOTA.advanced * 0.6;
  } catch {
    return false;
  }
}

function schedule() {
  if (timer) clearTimeout(timer);
  const after = savingMode() ? SAVING_FLUSH_AFTER_MS : FLUSH_AFTER_MS;
  const delay = Math.max(0, dirtySince + after - Date.now());
  timer = setTimeout(() => {
    timer = null;
    flush().catch((e) => console.error("[forja] no se pudo guardar la base:", e?.message ?? e));
  }, delay);
  (timer as any).unref?.();
  if (!flushWaiter) {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    flushWaiter = { promise, resolve };
  }
  // Mantiene viva la función hasta que se suban los cambios (tiene que llamarse durante el pedido).
  try {
    waitUntil(flushWaiter.promise);
  } catch {
    /* fuera de Vercel no hace falta */
  }
}

function settle() {
  flushWaiter?.resolve();
  flushWaiter = null;
}

/** Sube ya los cambios pendientes. Espera a que no haya pedidos en curso en esta instancia. */
export async function flush(): Promise<void> {
  if (!BLOB_MODE || !dirty) return;
  const release = await acquireRequestSlot();
  try {
    await exclusive(flushLocked);
  } finally {
    release();
  }
}

/** Uso estimado antes de que existiera el contador (pruebas de la publicación inicial). */
const USAGE_BEFORE_COUNTER: Record<string, { advanced: number; simple: number }> = {
  "blob_ops:2026-09": { advanced: 900, simple: 3500 },
};

/** Sube ya los cambios pendientes desde dentro de un pedido (que ya tiene el turno de la instancia). */
export function flushNow(): Promise<void> {
  if (!BLOB_MODE || !dirty) return Promise.resolve();
  return exclusive(flushLocked);
}

/** Mes calendario (UTC) para contar operaciones. */
function monthKey() {
  return "blob_ops:" + new Date().toISOString().slice(0, 7);
}

/** Operaciones del mes registradas en la base (aproximado: suma lo que contó cada instancia). */
export function monthUsage(): { advanced: number; simple: number } {
  const raw = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(monthKey()) as { value: string } | undefined;
  const saved = raw ? (JSON.parse(raw.value) as { advanced: number; simple: number; base?: boolean }) : { advanced: 0, simple: 0 };
  // La estimación previa se suma una sola vez (queda marcada con base: true al guardar).
  const before = USAGE_BEFORE_COUNTER[monthKey()];
  if (before && !saved.base) {
    saved.advanced += before.advanced;
    saved.simple += before.simple;
  }
  return { advanced: saved.advanced + ops.advanced, simple: saved.simple + ops.simple };
}

/** Anota en la base las operaciones contadas (queda incluido en la subida que sigue). */
function stampUsage() {
  const u = { ...monthUsage(), base: true };
  u.advanced += 1; // la subida que viene
  getDb().prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(monthKey(), JSON.stringify(u));
}

/**
 * Sube la base. Si otra instancia guardó en el medio, se trae su versión y se le aplican encima
 * los cambios pendientes de esta (fusión por fila). Hay que llamarla sin pedidos a medio camino.
 */
async function flushLocked(): Promise<void> {
  if (!dirty) return settle();
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const { put, get } = await blob();
  const opts = { access: "private" as const, allowOverwrite: true, addRandomSuffix: false, contentType: "application/octet-stream" };
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      // Comparación explícita de versión antes de subir.
      const remoteTag = await remoteEtag();
      if (remoteTag === null || remoteTag === etag) {
        const n = pending.length;
        stampUsage();
        try {
          getDb().exec("PRAGMA wal_checkpoint(TRUNCATE)");
        } catch {
          /* sin WAL */
        }
        const r = await put(DB_KEY, fs.readFileSync(dbPath()), opts);
        ops.advanced = 0;
        ops.simple = 0;
        etag = normTag(r.etag);
        lastCheck = Date.now();
        dirty = false;
        pending = [];
        note(`guardado (${n} cambio${n === 1 ? "" : "s"})`);
        return settle();
      }
      const buf = fs.readFileSync(dbPath());
      if (pending.every((c) => c)) {
        // Fusión: base remota + cambios pendientes de esta instancia, en orden.
        note(`fusión de ${pending.length} cambio(s)`);
        await pull(true);
        let omitted = 0;
        for (const c of pending) omitted += mergeChangeset(c!);
        if (omitted) {
          // Algunas filas chocaron con cambios de otra instancia: se respalda la versión propia.
          ops.advanced++;
          await put(`${PREFIX}db/conflictos/${Date.now()}-omitidas${omitted}.db`, buf, opts).catch(() => {});
        }
        continue;
      }
      // Hay cambios sin changeset: se respalda la versión remota y se guarda esta.
      note("sin changeset: respaldo y sobrescribo");
      ops.simple++;
      const remote = await get(DB_KEY, { access: "private", useCache: false });
      if (remote?.statusCode === 200) {
        ops.advanced++;
        await put(`${PREFIX}db/conflictos/${Date.now()}-sin-changeset.db`, await readStream(remote.stream), opts);
      }
      etag = remoteTag; // se toma la remota como base y se sobrescribe en la vuelta siguiente
    }
    throw new Error("No se pudo guardar después de varios intentos");
  } catch (e) {
    note(`error al guardar: ${(e as any)?.message ?? e}`);
    settle();
    throw e;
  }
}

/**
 * El store responde la descarga comprimida con un etag débil (W/"…") y el head o la subida con el
 * fuerte ("…"). Es la misma versión: se compara sin el prefijo.
 */
export function normTag(t: string | null | undefined): string | null {
  return t ? t.replace(/^W\//, "") : null;
}

/** Versión actual de la base en el store (null si todavía no existe). */
async function remoteEtag(): Promise<string | null> {
  const { head } = await blob();
  ops.simple++;
  try {
    return normTag(((await head(DB_KEY)) as any).etag);
  } catch (e: any) {
    if (e?.name === "BlobNotFoundError") return null;
    throw e;
  }
}

/** Aplica un changeset sobre la base local. Devuelve cuántos cambios se omitieron por conflicto. */
function mergeChangeset(changeset: Uint8Array): number {
  const { constants } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
  let omitted = 0;
  getDb().applyChangeset(changeset, {
    onConflict: (type: number) => {
      // DATA: la fila cambió en las dos: gana este cambio (el más reciente).
      if (type === constants.SQLITE_CHANGESET_DATA) return constants.SQLITE_CHANGESET_REPLACE;
      // NOTFOUND: la fila ya no está (p. ej. borrada en cascada): no hay nada que perder.
      if (type === constants.SQLITE_CHANGESET_NOTFOUND) return constants.SQLITE_CHANGESET_OMIT;
      omitted++;
      return constants.SQLITE_CHANGESET_OMIT;
    },
  });
  return omitted;
}

function keyFor(localPath: string): string {
  const rel = path.relative(DATA_DIR, path.resolve(localPath));
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Ruta fuera de la carpeta de datos");
  return PREFIX + "data/" + rel.split(path.sep).join("/");
}

/** Guarda en el store un archivo de la carpeta de datos (material subido, fotos). */
export async function persistFile(localPath: string) {
  if (!BLOB_MODE) return;
  const { put } = await blob();
  ops.advanced++;
  await put(keyFor(localPath), fs.readFileSync(localPath), { access: "private", allowOverwrite: true, addRandomSuffix: false });
}

/** Si el archivo no está en esta instancia, lo baja del store. */
export async function ensureLocalFile(localPath: string): Promise<boolean> {
  if (fs.existsSync(localPath)) return true;
  if (!BLOB_MODE) return false;
  const { get } = await blob();
  const r = await get(keyFor(localPath), { access: "private" }).catch(() => null);
  if (!r || r.statusCode !== 200) return false;
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, await readStream(r.stream));
  return true;
}

export async function removeFile(localPath: string) {
  if (!BLOB_MODE) return;
  const { del } = await blob();
  await del(keyFor(localPath)).catch(() => {});
}

/** Descarga un archivo subido directamente desde el navegador (subidas grandes) y lo borra del área temporal. */
export async function takeIncoming(pathname: string): Promise<Buffer> {
  if (!pathname.startsWith(PREFIX + "entrantes/")) throw new Error("Ruta de subida inválida");
  const { get, del } = await blob();
  ops.advanced++; // la subida desde el navegador
  ops.simple++;
  const r = await get(pathname, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200) throw new Error("No se encontró el archivo subido");
  const buf = await readStream(r.stream);
  await del(pathname).catch(() => {});
  return buf;
}

export const INCOMING_PREFIX = PREFIX + "entrantes/";

export function storageInfo() {
  let usage: { advanced: number; simple: number } | null = null;
  try {
    usage = BLOB_MODE ? monthUsage() : null;
  } catch {
    usage = null;
  }
  return { mode: BLOB_MODE ? "blob" : "local", instance: INSTANCE, dirty, pending: pending.length, active, etag: etag ? etag.slice(-8) : null, lastCheck, events, usage, quota: BLOB_QUOTA, saving: BLOB_MODE && savingMode() };
}

/**
 * Borra del store los archivos que ya no usa nadie: material o fotos sin fila en la base,
 * subidas directas abandonadas (más de un día) y respaldos de conflictos de más de 14 días
 * (o todos, con allConflicts).
 */
export async function cleanupOrphans(referenced: Set<string>, opts: { allConflicts?: boolean } = {}): Promise<{ deleted: number; kept: number; byKind: Record<string, number>; recentConflicts?: string[] }> {
  if (!BLOB_MODE) return { deleted: 0, kept: 0, byKind: {} };
  const byKind: Record<string, number> = {};
  const conflicts: string[] = [];
  const { list, del } = await blob();
  const refKeys = new Set([...referenced].map((p) => keyFor(p)));
  const now = Date.now();
  const toDelete: string[] = [];
  let kept = 0;
  let cursor: string | undefined;
  do {
    ops.advanced++;
    const r = await list({ prefix: PREFIX, cursor, limit: 1000 });
    for (const b of r.blobs) {
      const age = now - new Date(b.uploadedAt).getTime();
      const isData = b.pathname.startsWith(PREFIX + "data/");
      const isIncoming = b.pathname.startsWith(INCOMING_PREFIX);
      const isConflict = b.pathname.startsWith(PREFIX + "db/conflictos/");
      if ((isData && !refKeys.has(b.pathname)) || (isIncoming && age > 86400_000) || (isConflict && (opts.allConflicts || age > 14 * 86400_000))) toDelete.push(b.url);
      else {
        kept++;
        if (isConflict) conflicts.push(b.pathname.slice((PREFIX + "db/conflictos/").length));
        const kind = isData ? "datos" : isIncoming ? "entrantes" : isConflict ? "conflictos" : b.pathname.endsWith("forja.db") ? "base" : "otros";
        byKind[kind] = (byKind[kind] ?? 0) + 1;
      }
    }
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  for (let i = 0; i < toDelete.length; i += 100) await del(toDelete.slice(i, i + 100));
  return { deleted: toDelete.length, kept, byKind, recentConflicts: conflicts.sort().slice(-25) };
}
