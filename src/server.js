import express from "express";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", ts: new Date().toISOString() });
  });

  app.use(express.static(path.join(__dirname, "..", "public")));

  return app;
}

export function start(port = Number(process.env.PORT) || 3000) {
  const app = createApp();
  return app.listen(port, () => {
    console.log(`pulse listening on :${port}`);
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) start();
