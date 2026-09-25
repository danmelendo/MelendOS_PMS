// In-memory dataset shared by the mock client (PostgREST emulation) and the
// mock server (RPC and Edge Function emulation). Persisted to localStorage.
import { loadDb, saveDb, type DemoDb } from "./seed";

let _db: DemoDb | null = null;

export function db(): DemoDb {
  if (!_db) _db = loadDb();
  return _db;
}

export function persist() {
  if (_db) saveDb(_db);
}

export function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
