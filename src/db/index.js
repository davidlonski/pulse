import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = fs.readFileSync(path.join(__dirname, "migrations.sql"), "utf8");

export function openDb(
  dbPath = process.env.PULSE_DB_PATH || path.join(__dirname, "..", "..", "data", "pulse.sqlite")
) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(MIGRATIONS);
  return db;
}

export { MIGRATIONS };
