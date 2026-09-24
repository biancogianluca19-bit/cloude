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
const CHECK_EVERY_MS = 15_000;
const FLUSH_DELAY_MS = 1_200;

type BlobMod = typeof import("@vercel/blob");
let mod: BlobMod | null = null;
async function blob(): Promise<BlobMod> {
  if (!mod) mod = await import("@vercel/blob");
  return mod;
}

let etag: string | null = null;
let loaded = false;
let lastCheck = 0;
let dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let lock: Promise<unknown> = Promise.resolve();
/** Pedidos en curso en esta instancia (informativo). */
let active = 0;
let requestQueue: Promise<unknown> = Promise.resolve();

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

/** Trae la base del store si cambió desde la última vez. */
async function pull(force = false) {
  const { get } = await blob();
  // Si la copia local no existe (instancia nueva o /tmp limpio), se descarga siempre.
  const haveLocal = fs.existsSync(dbPath());
  const r = await get(DB_KEY, { access: "private", useCache: false, ...(etag && !force && haveLocal ? { ifNoneMatch: etag } : {}) }).catch((e: any) => {
    if (e?.name === "BlobNotFoundError") return null;
    throw e;
  });
  lastCheck = Date.now();
  if (!r) return; // todavía no hay base guardada: se usa la local (nueva)
  if (r.statusCode === 304) return;
  const buf = await readStream(r.stream);
  closeDb();
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const suffix of ["-journal", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });
  fs.writeFileSync(file, buf);
  etag = r.blob.etag;
}

/**
 * Antes de atender un pedido: asegura que la base local esté al día.
 * Las escrituras siempre verifican; las lecturas, como mucho una vez por minuto.
 */
/** Versión de la base que tiene esta instancia (etag del store). */
export function currentVersion(): string | null {
  return etag;
}

/**
 * @param write  el pedido puede escribir: siempre se verifica contra el store.
 * @param seen   última versión que vio el navegador: si no coincide, esta instancia está atrasada.
 */
export async function syncBefore(write: boolean, seen?: string | null) {
  if (!BLOB_MODE) return;
  if (seen && seen !== etag && !dirty) {
    await exclusive(async () => {
      if (!dirty && seen !== etag) await pull();
      loaded = true;
    });
    if (!write) return;
  }
  // Antes de escribir, lo pendiente de esta instancia se sube primero; así, si otra instancia
  // escribió después, se trae su versión sin pisar nada.
  if (write && dirty) await flush();
  await exclusive(async () => {
    if (dirty) return; // lectura con cambios locales sin subir: la copia local es la más nueva
    if (loaded && !write && Date.now() - lastCheck < CHECK_EVERY_MS) return;
    await pull();
    loaded = true;
  });
}

/** Después de un pedido que cambió la base: se sube agrupando cambios cercanos. */
export function markDirty() {
  if (!BLOB_MODE) return;
  dirty = true;
  if (timer) return;
  const done = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      timer = null;
      flush()
        .catch((e) => console.error("[forja] no se pudo guardar la base:", e?.message ?? e))
        .finally(resolve);
    }, FLUSH_DELAY_MS);
  });
  // Tiene que llamarse durante el pedido: mantiene viva la función hasta terminar de guardar.
  try {
    waitUntil(done);
  } catch {
    /* fuera de Vercel no hace falta */
  }
}

/**
 * Sube la base. Si otra instancia guardó en el medio y se tiene el changeset del pedido,
 * se trae la versión remota y se le aplican encima estos cambios (fusión por fila).
 */
export function flush(changeset?: Uint8Array | null): Promise<void> {
  if (!BLOB_MODE) return Promise.resolve();
  return exclusive(async () => {
    if (!dirty) return;
    dirty = false;
    const { put, get, BlobPreconditionFailedError } = await blob();
    const opts = { access: "private" as const, allowOverwrite: true, addRandomSuffix: false, contentType: "application/octet-stream" };
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        getDb().exec("PRAGMA wal_checkpoint(TRUNCATE)");
      } catch {
        /* sin WAL */
      }
      const buf = fs.readFileSync(dbPath());
      try {
        const r = await put(DB_KEY, buf, { ...opts, ...(etag ? { ifMatch: etag } : {}) });
        etag = r.etag;
        return;
      } catch (e) {
        if (!(e instanceof BlobPreconditionFailedError)) {
          dirty = true;
          throw e;
        }
        if (changeset && changeset.length) {
          // Fusión: base remota + cambios de este pedido.
          console.warn(`[forja] otra instancia guardó en el medio: fusionando cambios (intento ${attempt + 1})`);
          await pull(true);
          const omitted = mergeChangeset(changeset);
          if (omitted) {
            // Algunas filas chocaron con cambios de otra instancia: se respalda la versión propia.
            await put(`${PREFIX}db/conflictos/${Date.now()}-omitidas.db`, buf, opts).catch(() => {});
          }
          continue;
        }
        // Sin changeset: se respalda la versión remota y se guarda esta.
        console.warn("[forja] conflicto de escritura sin changeset: se respalda la versión remota");
        const remote = await get(DB_KEY, { access: "private", useCache: false });
        if (remote?.statusCode === 200) await put(`${PREFIX}db/conflictos/${Date.now()}.db`, await readStream(remote.stream), opts);
        const r = await put(DB_KEY, buf, opts);
        etag = r.etag;
        return;
      }
    }
    dirty = true;
    throw new Error("No se pudo guardar después de varios intentos");
  });
}

/** Aplica un changeset sobre la base local. Devuelve cuántos cambios se omitieron por conflicto. */
function mergeChangeset(changeset: Uint8Array): number {
  const { constants } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
  let omitted = 0;
  getDb().applyChangeset(changeset, {
    onConflict: (type: number) => {
      // DATA: la fila cambió en las dos: gana este pedido (el más reciente).
      if (type === constants.SQLITE_CHANGESET_DATA) return constants.SQLITE_CHANGESET_REPLACE;
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
  const r = await get(pathname, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200) throw new Error("No se encontró el archivo subido");
  const buf = await readStream(r.stream);
  await del(pathname).catch(() => {});
  return buf;
}

export const INCOMING_PREFIX = PREFIX + "entrantes/";

const INSTANCE = Math.random().toString(36).slice(2, 8);

export function storageInfo() {
  return { mode: BLOB_MODE ? "blob" : "local", instance: INSTANCE, dirty, active, etag: etag ? etag.slice(-8) : null, lastCheck };
}

/**
 * Borra del store los archivos que ya no usa nadie: material o fotos sin fila en la base,
 * subidas directas abandonadas (más de un día) y respaldos de conflictos de más de 14 días.
 */
export async function cleanupOrphans(referenced: Set<string>): Promise<{ deleted: number; kept: number; byKind: Record<string, number> }> {
  if (!BLOB_MODE) return { deleted: 0, kept: 0, byKind: {} };
  const byKind: Record<string, number> = {};
  const { list, del } = await blob();
  const refKeys = new Set([...referenced].map((p) => keyFor(p)));
  const now = Date.now();
  const toDelete: string[] = [];
  let kept = 0;
  let cursor: string | undefined;
  do {
    const r = await list({ prefix: PREFIX, cursor, limit: 1000 });
    for (const b of r.blobs) {
      const age = now - new Date(b.uploadedAt).getTime();
      const isData = b.pathname.startsWith(PREFIX + "data/");
      const isIncoming = b.pathname.startsWith(INCOMING_PREFIX);
      const isConflict = b.pathname.startsWith(PREFIX + "db/conflictos/");
      if ((isData && !refKeys.has(b.pathname)) || (isIncoming && age > 86400_000) || (isConflict && age > 14 * 86400_000)) toDelete.push(b.url);
      else {
        kept++;
        const kind = isData ? "datos" : isIncoming ? "entrantes" : isConflict ? "conflictos" : b.pathname.endsWith("forja.db") ? "base" : "otros";
        byKind[kind] = (byKind[kind] ?? 0) + 1;
      }
    }
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  for (let i = 0; i < toDelete.length; i += 100) await del(toDelete.slice(i, i + 100));
  return { deleted: toDelete.length, kept, byKind };
}
