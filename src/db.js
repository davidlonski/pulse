"use strict";

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

let db;

/**
 * Singleton SQLite connection. Database file lives under ./data/pulse.db by default.
 */
function getDb() {
  if (!db) {
    const root = path.join(__dirname, "..");
    const dataDir = path.join(root, "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = process.env.SQLITE_PATH || path.join(dataDir, "pulse.db");
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

module.exports = { getDb };
