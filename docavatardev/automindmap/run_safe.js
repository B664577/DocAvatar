import express from "express";
import { fileURLToPath } from "url";
import { dirname } from "path";
import http from "http";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
app.use(express.static(__dirname));
app.get("/health", (req, res) => res.json({ ok: true }));
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 5173);
http.createServer(app).listen(port, host, () => {
  console.log();
});
