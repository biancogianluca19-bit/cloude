import "./quiet.ts";
import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.resolve(process.env.FORJA_DATA_DIR ?? path.join(process.cwd(), "data"));
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  professor TEXT DEFAULT '',
  description TEXT DEFAULT '',
  pass_threshold REAL DEFAULT 0.6,
  is_demo INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ext TEXT NOT NULL,
  mime TEXT DEFAULT '',
  size INTEGER DEFAULT 0,
  path TEXT NOT NULL,
  kind TEXT DEFAULT 'material',
  status TEXT DEFAULT 'procesando',
  error TEXT,
  extractor TEXT,
  units INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL,
  location TEXT NOT NULL,
  page INTEGER,
  heading TEXT DEFAULT '',
  text TEXT NOT NULL,
  topic_id INTEGER,
  quarantined INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS chunks_subject ON chunks(subject_id);

CREATE TABLE IF NOT EXISTS excel_cells (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  sheet TEXT, cell TEXT, formula TEXT, value TEXT, label TEXT
);

CREATE TABLE IF NOT EXISTS security_alerts (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  chunk_id INTEGER,
  location TEXT, snippet TEXT, reason TEXT, rule TEXT,
  severity TEXT, hidden INTEGER DEFAULT 0,
  decision TEXT DEFAULT 'pendiente',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT DEFAULT '',
  keywords TEXT DEFAULT '[]',
  library_key TEXT,
  description TEXT DEFAULT '',
  ord INTEGER DEFAULT 0,
  origin TEXT DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS topic_edges (
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  from_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  PRIMARY KEY (from_id, to_id)
);

CREATE TABLE IF NOT EXISTS profiles (
  subject_id INTEGER PRIMARY KEY REFERENCES subjects(id) ON DELETE CASCADE,
  json TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  units TEXT DEFAULT '[]',
  topic_ids TEXT DEFAULT '[]',
  daily_minutes INTEGER DEFAULT 90,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_id INTEGER,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  template_key TEXT,
  spec TEXT NOT NULL,
  origin TEXT DEFAULT 'practica',
  mock_id INTEGER,
  hints_used INTEGER DEFAULT 0,
  revealed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_id INTEGER,
  answers TEXT NOT NULL,
  score REAL NOT NULL,
  breakdown TEXT,
  feedback TEXT,
  hints_used INTEGER DEFAULT 0,
  revealed INTEGER DEFAULT 0,
  mode TEXT DEFAULT 'practica',
  input TEXT DEFAULT 'tipeado',
  weight REAL DEFAULT 1,
  mock_id INTEGER,
  photo_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS attempts_subject ON attempts(subject_id, created_at);

CREATE TABLE IF NOT EXISTS error_events (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_id INTEGER,
  tag TEXT NOT NULL,
  label TEXT NOT NULL,
  kind TEXT DEFAULT 'error',
  attempt_id INTEGER,
  detail TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mocks (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  exam_id INTEGER,
  title TEXT NOT NULL,
  mode TEXT DEFAULT 'nuevo',
  structure TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  source_file_id INTEGER,
  status TEXT DEFAULT 'en_curso',
  started_at TEXT DEFAULT (datetime('now')),
  submitted_at TEXT,
  score REAL,
  result TEXT
);

CREATE TABLE IF NOT EXISTS flashcards (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_id INTEGER,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  origin TEXT NOT NULL,
  source TEXT DEFAULT '',
  chunk_id INTEGER,
  dedupe_key TEXT,
  priority REAL DEFAULT 0.5,
  ease REAL DEFAULT 2.5,
  interval_days REAL DEFAULT 0,
  reps INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0,
  due_at TEXT DEFAULT (datetime('now')),
  last_review TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(subject_id, dedupe_key)
);

CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL,
  topic_id INTEGER,
  grade INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tutor_messages (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  meta TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS study_sessions (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  minutes INTEGER NOT NULL,
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT,
  tasks TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS reading_events (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_id INTEGER,
  chunk_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
`;

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const file = process.env.FORJA_DB ?? path.join(DATA_DIR, "forja.db");
  const { DatabaseSync: Db } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
  db = new Db(file);
  db.exec(SCHEMA);
  return db;
}

export function closeDb() {
  db?.close();
  db = null;
}

type Params = Record<string, unknown> | unknown[];

function bind(params?: Params): any[] {
  if (params === undefined) return [];
  if (Array.isArray(params)) return params.map(clean);
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) o[k] = clean(v);
  return [o];
}

function clean(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

export function all<T = any>(sql: string, params?: Params): T[] {
  return getDb().prepare(sql).all(...bind(params)) as T[];
}

export function get<T = any>(sql: string, params?: Params): T | undefined {
  return getDb().prepare(sql).get(...bind(params)) as T | undefined;
}

export function run(sql: string, params?: Params): { id: number; changes: number } {
  const r = getDb().prepare(sql).run(...bind(params));
  return { id: Number(r.lastInsertRowid), changes: Number(r.changes) };
}

export function tx<T>(fn: () => T): T {
  const d = getDb();
  d.exec("BEGIN");
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export function json<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function getSetting(key: string): string | undefined {
  return get<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key])?.value;
}

export function setSetting(key: string, value: string | null) {
  if (value === null) run("DELETE FROM settings WHERE key = ?", [key]);
  else run("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value]);
}

/** SQLite guarda datetime('now') en UTC sin zona. Lo convertimos a Date correctamente. */
export function parseDbDate(s: string): Date {
  if (/[zZ]|[+-]\d\d:\d\d$/.test(s)) return new Date(s);
  return new Date(s.replace(" ", "T") + "Z");
}

export function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
