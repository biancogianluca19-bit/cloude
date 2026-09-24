import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

// Acceso con contraseña para cuando FORJA está publicada en internet.
// Sin FORJA_PASSWORD (uso local) no se pide nada. FORJA_AUTH=off la desactiva sin borrarla.

const COOKIE = "forja_sesion";
const DAYS = 60;

function password() {
  return process.env.FORJA_PASSWORD ?? "";
}

export function authRequired() {
  return process.env.FORJA_AUTH !== "off" && !!password();
}

function secret() {
  return process.env.FORJA_SECRET || crypto.createHash("sha256").update("forja:" + password()).digest("hex");
}

function sign(exp: number) {
  return crypto.createHmac("sha256", secret()).update(String(exp)).digest("base64url");
}

function readCookie(req: Request): string | undefined {
  const raw = req.headers.cookie ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function isAuthed(req: Request): boolean {
  if (!authRequired()) return true;
  const c = readCookie(req);
  if (!c) return false;
  const [expStr, sig] = c.split(".");
  const exp = Number(expStr);
  if (!exp || exp < Date.now() || !sig) return false;
  const expected = sign(exp);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function setCookie(req: Request, res: Response, value: string, maxAge: number) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`);
}

// Límite simple de intentos fallidos por IP (por instancia).
const failures = new Map<string, { n: number; until: number }>();

export function login(req: Request, res: Response) {
  if (!authRequired()) return res.json({ ok: true });
  const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();
  const f = failures.get(ip);
  if (f && f.n >= 8 && f.until > Date.now()) return res.status(429).json({ error: "Demasiados intentos. Esperá unos minutos." });
  const given = String(req.body?.password ?? "");
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(password()).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    failures.set(ip, { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + 15 * 60_000 });
    return res.status(401).json({ error: "Contraseña incorrecta." });
  }
  failures.delete(ip);
  const exp = Date.now() + DAYS * 86400_000;
  setCookie(req, res, `${exp}.${sign(exp)}`, DAYS * 86400);
  res.json({ ok: true });
}

export function logout(req: Request, res: Response) {
  setCookie(req, res, "", 0);
  res.json({ ok: true });
}

const OPEN = new Set(["/api/auth", "/api/login", "/api/logout", "/api/blob/upload"]);

/** Protege toda la API salvo el login. La subida directa valida por su cuenta. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!authRequired() || OPEN.has(req.path) || !req.path.startsWith("/api/")) return next();
  if (isAuthed(req)) return next();
  res.status(401).json({ error: "Iniciá sesión.", auth: true });
}
