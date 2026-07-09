import { existsSync } from "node:fs";
import path from "node:path";

import cors from "cors";
import express from "express";
import pino from "pino";
import pinoHttp from "pino-http";

import { projectRoot } from "./config.js";
import { createCategoryRouter } from "./routes/categories.js";
import { createDraftRouter } from "./routes/drafts.js";
import { createExecutorRouter } from "./routes/executors.js";
import { createRepositoryRouter } from "./routes/repository.js";
import { createSystemRouter } from "./routes/system.js";
import { createTaskRouter } from "./routes/tasks.js";
import { recoverStaleRunningState } from "./services/maintenanceService.js";
import { startScheduler } from "./services/schedulerService.js";
import { drainQueue } from "./services/taskQueueService.js";
import { initializeDatabase } from "./services/storage/database.js";

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const port = Number(process.env.PORT || 4321);

// 后台执行 Agent 任务期间进程必须保持存活：
// 未捕获异常只记录日志，避免进程崩溃（node --watch 下会自动重启）杀死执行中的任务
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});
process.on("uncaughtException", (error) => {
  logger.error({ err: error }, "Uncaught exception");
});

await initializeDatabase();

const recovered = recoverStaleRunningState();
if (recovered.drafts > 0 || recovered.requeuedTasks > 0 || recovered.runs > 0) {
  logger.warn(
    `Recovered stale records: ${recovered.drafts} drafts marked failed, ${recovered.requeuedTasks} interrupted tasks requeued, ${recovered.runs} runs marked failed.`,
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
app.use("/api/system", createSystemRouter());

// 托管前端构建产物：npm run build 后直接访问 http://localhost:4321 即可使用，无需 Vite
const webDistDir = path.join(projectRoot, "web", "dist");
if (existsSync(webDistDir)) {
  app.use(express.static(webDistDir));
}

app.use((error, _req, res, _next) => {
  logger.error(error);
  res.status(error.statusCode || 500).json({
    message: error.message || "Unexpected server error.",
  });
});

const server = app.listen(port, () => {
  logger.info(`blog-tool server listening on http://localhost:${port}`);
  startScheduler(logger);
  // 重启后继续消费队列中的任务（含中断后被重新入队的任务）
  void drainQueue(logger);
});

server.on("error", (error) => {
  logger.error({ err: error }, "Server failed to start (port may already be in use).");
  process.exit(1);
});
