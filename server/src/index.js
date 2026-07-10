import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const entryFile = fileURLToPath(import.meta.url);
let processHooksRegistered = false;

function registerProcessHooks(logger) {
  if (processHooksRegistered) {
    return;
  }

  processHooksRegistered = true;

  // 后台执行 Agent 任务期间进程必须保持存活：
  // 未捕获异常只记录日志，避免进程崩溃（node --watch 下会自动重启）杀死执行中的任务
  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Unhandled promise rejection");
  });
  process.on("uncaughtException", (error) => {
    logger.error({ err: error }, "Uncaught exception");
  });
}

function createApp({ logger, webOrigin }) {
  const app = express();

  app.use(
    cors({
      origin: webOrigin,
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

  return app;
}

export async function startServer(options = {}) {
  const logger = options.logger || pino({ level: process.env.LOG_LEVEL || "info" });
  const webOrigin = options.webOrigin ?? process.env.WEB_ORIGIN ?? "http://localhost:4173";
  const port = Number(options.port ?? process.env.PORT ?? 4321);

  registerProcessHooks(logger);
  await initializeDatabase();

  const recovered = recoverStaleRunningState();
  if (recovered.drafts > 0 || recovered.requeuedTasks > 0 || recovered.runs > 0) {
    logger.warn(
      `Recovered stale records: ${recovered.drafts} drafts marked failed, ${recovered.requeuedTasks} interrupted tasks requeued, ${recovered.runs} runs marked failed.`,
    );
  }

  const app = createApp({ logger, webOrigin });

  return await new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;

      logger.info(`blog-tool server listening on http://localhost:${actualPort}`);
      startScheduler(logger);
      // 重启后继续消费队列中的任务（含中断后被重新入队的任务）
      void drainQueue(logger);

      resolve({
        app,
        server,
        logger,
        actualPort,
      });
    });

    server.on("error", (error) => {
      logger.error({ err: error }, "Server failed to start (port may already be in use).");
      reject(error);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === entryFile) {
  try {
    await startServer();
  } catch {
    process.exit(1);
  }
}
