import express from "express";
import { asyncHandler } from "./asyncHandler.js";

import {
  discoverExecutorCommands,
  listExecutors,
  testExecutor,
  updateExecutor,
} from "../services/executorService.js";

const TEST_PROMPT = "你好，请用一句中文确认你已经成功接收到这条测试命令。";

export function createExecutorRouter() {
  const router = express.Router();

  router.get("/", (_req, res) => {
    res.json(listExecutors());
  });

  router.get("/discover", asyncHandler(async (_req, res) => {
    res.json(await discoverExecutorCommands());
  }));

  router.put("/:executorId", (req, res) => {
    res.json(updateExecutor(req.params.executorId, req.body));
  });

  router.post("/:executorId/test", asyncHandler(async (req, res) => {
    res.json(
      await testExecutor({
        executorId: req.params.executorId,
        promptContent: TEST_PROMPT,
      }),
    );
  }));

  return router;
}
