import cors from "cors";
import express from "express";
import pino from "pino";
import pinoHttp from "pino-http";

import { createCategoryRouter } from "./routes/categories.js";
import { createDraftRouter } from "./routes/drafts.js";
import { createExecutorRouter } from "./routes/executors.js";
import { createRepositoryRouter } from "./routes/repository.js";
import { createTaskRouter } from "./routes/tasks.js";
import { recoverStaleRunningState } from "./services/maintenanceService.js";
import { startScheduler } from "./services/schedulerService.js";
import { initializeDatabase } from "./services/storage/database.js";

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const port = Number(process.env.PORT || 4321);

await initializeDatabase();

const recovered = recoverStaleRunningState();
if (recovered.drafts > 0 || recovered.tasks > 0 || recovered.runs > 0) {
  logger.warn(
    `Recovered stale running records: ${recovered.drafts} drafts, ${recovered.tasks} tasks, ${recovered.runs} runs marked as failed.`,
  );
}

app.use(
  cors({
    origin: process.env.WEB_ORIGIN || "http://localhost:4173",
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(
  pinoHttp({
    logger,
  }),
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "blog-tool-server" });
});

app.use("/api/repository", createRepositoryRouter());
app.use("/api/categories", createCategoryRouter());
app.use("/api/drafts", createDraftRouter());
app.use("/api/tasks", createTaskRouter());
app.use("/api/executors", createExecutorRouter());

app.use((error, _req, res, _next) => {
  logger.error(error);
  res.status(500).json({
    message: error.message || "Unexpected server error.",
  });
});

app.listen(port, () => {
  logger.info(`blog-tool server listening on http://localhost:${port}`);
  startScheduler(logger);
});
