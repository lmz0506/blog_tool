import express from "express";
import { asyncHandler } from "./asyncHandler.js";

import { listExecutors, testExecutor, updateExecutor } from "../services/executorService.js";

export function createExecutorRouter() {
  const router = express.Router();

  router.get("/", (_req, res) => {
    res.json(listExecutors());
  });

  router.put("/:executorId", (req, res) => {
    res.json(updateExecutor(req.params.executorId, req.body));
  });

  router.post("/:executorId/test", asyncHandler(async (req, res) => {
    res.json(
      await testExecutor({
        executorId: req.params.executorId,
        promptContent: req.body.promptContent || "Reply with a short test message.",
      }),
    );
  }));

  return router;
}
