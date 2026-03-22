import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import apiRoutes from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// API routes
app.use("/api", apiRoutes);

// Serve static frontend (production)
const distPath = path.join(__dirname, "../dist");
app.use(express.static(distPath));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`⚡ CLOUT server running on http://localhost:${PORT}`);
});
