import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import request from "supertest";

// Simula Vercel Blob en memoria, con etags y escritura condicional (ifMatch).
const store = new Map<string, { buf: Buffer; etag: string }>();
let n = 0;
class BlobPreconditionFailedError extends Error {}
vi.mock("@vercel/blob", () => ({
  BlobPreconditionFailedError,
  put: vi.fn(async (key: string, body: Buffer, opts: any) => {
    const cur = store.get(key);
    if (opts.ifMatch && cur && cur.etag !== opts.ifMatch) throw new BlobPreconditionFailedError("etag");
    const etag = `e${++n}`;
    store.set(key, { buf: Buffer.from(body), etag });
    return { etag, pathname: key, url: "x" };
  }),
  get: vi.fn(async (key: string, opts: any) => {
    const cur = store.get(key);
    if (!cur) {
      const e: any = new Error("no existe");
      e.name = "BlobNotFoundError";
      throw e;
    }
    if (opts.ifNoneMatch && opts.ifNoneMatch === cur.etag) return { statusCode: 304, stream: null, blob: { etag: cur.etag } };
    return { statusCode: 200, stream: new Blob([cur.buf]).stream(), blob: { etag: cur.etag } };
  }),
  del: vi.fn(async (key: string) => void store.delete(key)),
}));
vi.mock("@vercel/functions", () => ({ waitUntil: () => {} }));

const DATA = path.resolve("test-data/deploy");
fs.rmSync(DATA, { recursive: true, force: true });
process.env.FORJA_DATA_DIR = DATA;
process.env.FORJA_FORCE_DEMO = "1";
process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_prueba";
process.env.FORJA_PASSWORD = "clave-de-prueba";

const storage = await import("../server/storage.ts");
const db = await import("../server/db.ts");
const { createApp } = await import("../server/app.ts");

describe("contraseña", () => {
  const app = createApp();
  it("sin sesión la API responde 401 y el login la abre", async () => {
    await request(app).get("/api/subjects").expect(401);
    expect((await request(app).get("/api/auth")).body).toEqual({ required: true, ok: false });
    await request(app).post("/api/login").send({ password: "otra" }).expect(401);
    const r = await request(app).post("/api/login").send({ password: "clave-de-prueba" }).expect(200);
    const cookie = r.headers["set-cookie"][0].split(";")[0];
    await request(app).get("/api/subjects").set("Cookie", cookie).expect(200);
    await request(app).get("/api/subjects").set("Cookie", cookie.replace(/.$/, "x")).expect(401);
  });
  it("pedir un token de subida directa exige sesión", async () => {
    await request(app).post("/api/blob/upload").send({ type: "blob.generate-client-token", payload: {} }).expect(401);
  });
});

describe("sincronización con Blob", () => {
  it("guarda la base y la recupera en una instancia nueva", async () => {
    expect(storage.BLOB_MODE).toBe(true);
    await storage.syncBefore(true);
    db.run("INSERT INTO subjects(name) VALUES ('Guardada')");
    storage.markDirty();
    await storage.flush();
    const key = [...store.keys()].find((k) => k.endsWith("db/forja.db"))!;
    expect(key).toBeTruthy();
    // "Otra instancia": borramos la copia local y sincronizamos.
    db.closeDb();
    fs.rmSync(db.dbPath(), { force: true });
    await storage.syncBefore(true);
    expect(db.get<any>("SELECT name FROM subjects WHERE name = 'Guardada'")).toBeTruthy();
  });

  it("si otra instancia escribió en el medio, respalda la remota y no pierde el cambio local", async () => {
    const key = [...store.keys()].find((k) => k.endsWith("db/forja.db"))!;
    await storage.syncBefore(true);
    db.run("INSERT INTO subjects(name) VALUES ('Local')");
    // Otra instancia sube una versión distinta.
    store.set(key, { buf: store.get(key)!.buf, etag: "ajena" });
    storage.markDirty();
    await storage.flush();
    expect([...store.keys()].some((k) => k.includes("db/conflictos/"))).toBe(true);
    db.closeDb();
    fs.rmSync(db.dbPath(), { force: true });
    await storage.syncBefore(true);
    expect(db.get<any>("SELECT name FROM subjects WHERE name = 'Local'")).toBeTruthy();
  });

  it("los archivos subidos se guardan y se recuperan si faltan en la instancia", async () => {
    const p = path.join(db.UPLOAD_DIR, "9", "archivo.txt");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "contenido");
    await storage.persistFile(p);
    fs.rmSync(p);
    expect(await storage.ensureLocalFile(p)).toBe(true);
    expect(fs.readFileSync(p, "utf8")).toBe("contenido");
    await expect(storage.persistFile("/etc/passwd")).rejects.toThrow(/fuera/);
  });

  it("solo acepta archivos entrantes del área de subida", async () => {
    await expect(storage.takeIncoming("forja/db/forja.db")).rejects.toThrow(/inválida/);
  });
});
