import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { RecipeDoc } from "./schema.js";

const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "recipes.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS search_cache (
    key TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

const getStmt = db.prepare<[string], { json: string }>("SELECT json FROM recipes WHERE id = ?");
const putStmt = db.prepare("INSERT OR REPLACE INTO recipes (id, json, created_at) VALUES (?, ?, ?)");
const listStmt = db.prepare<[number], { json: string }>(
  "SELECT json FROM recipes ORDER BY created_at DESC LIMIT ?",
);
const searchGet = db.prepare<[string, number], { json: string }>(
  "SELECT json FROM search_cache WHERE key = ? AND created_at > ?",
);
const searchPut = db.prepare("INSERT OR REPLACE INTO search_cache (key, json, created_at) VALUES (?, ?, ?)");

export function getRecipe(id: string): RecipeDoc | null {
  const row = getStmt.get(id);
  return row ? (JSON.parse(row.json) as RecipeDoc) : null;
}

export function saveRecipe(doc: RecipeDoc): void {
  putStmt.run(doc.id, JSON.stringify(doc), doc.createdAt);
}

export function listRecent(limit = 30): RecipeDoc[] {
  return listStmt.all(limit).map((r) => JSON.parse(r.json) as RecipeDoc);
}

/** 검색 결과 캐시 — 유튜브 API 쿼터(하루 100회 검색) 절약용. 기본 6시간 */
export function getSearchCache<T>(key: string, maxAgeMs = 6 * 60 * 60 * 1000): T | null {
  const row = searchGet.get(key, Date.now() - maxAgeMs);
  return row ? (JSON.parse(row.json) as T) : null;
}

export function putSearchCache(key: string, value: unknown): void {
  searchPut.run(key, JSON.stringify(value), Date.now());
}
