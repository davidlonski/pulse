"use strict";

require("dotenv").config();

const express = require("express");
const { getDb } = require("./db");

const app = express();
const PORT = Number(process.env.PORT) || 3200;

// Open SQLite early so startup fails fast if the DB path is unusable
getDb();

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.error(`Pulse listening on http://127.0.0.1:${PORT}`);
});
