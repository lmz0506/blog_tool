import express from "express";

import { executeTask } from "../services/taskRunnerService.js";
import { getDefaultPlanSettings } from "../services/settingsService.js";
import {
  createDefaultTask,
  deleteTask,
  getTask,
  listRuns,
  listTasks,
  pickDefaultCategory,
  updateTask,
} from "../services/taskService.js";
import { asyncHandler } from "./asyncHandler.js";

export function createTaskRouter() {
  const router = express.Router();

  router.get("/", (_req, res) => {
    res.json(listTasks());
  });

  router.get("/runs", (_req, res) => {
    res.json(listRuns());
  });

  router.post("/default", (req, res) => {
    const defaultPlan = getDefaultPlanSettings();
    if (!defaultPlan.enabled) {
      return res.status(409).json({
        message: "Built-in default task is disabled.",
      });
    }

    const categoryName = req.body.categoryName || pickDefaultCategory();
    if (!categoryName) {
      return res.status(400).json({
        message: "No default category available in the default pool.",
      });
    }

    const taskId = createDefaultTask(categoryName);
    res.status(201).json(getTask(taskId));
  });

  router.put("/:taskId", (req, res) => {
    res.json(updateTask(Number(req.params.taskId), req.body));
  });

  router.delete("/:taskId", (req, res) => {
    res.json(deleteTask(Number(req.params.taskId)));
  });

  router.post("/:taskId/run", asyncHandler(async (req, res) => {
    let result;
    try {
      result = await executeTask(Number(req.params.taskId), {
        executorId: req.body.executorId,
      });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      throw error;
    }

    if (!result.ok) {
      return res.status(400).json({
        message: result.message,
        task: result.task,
        run: result.run,
      });
    }

    res.json({
      task: result.task,
      run: result.run,
      gitPublish: result.gitPublish,
    });
  }));

  return router;
}
