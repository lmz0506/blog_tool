import express from "express";

import { pushRepositoryBranch } from "../services/gitPublishService.js";
import { dequeueTask, drainQueue, enqueueTask } from "../services/taskQueueService.js";
import { getDefaultPlanSettings, getRepositorySettings } from "../services/settingsService.js";
import {
  createDefaultTask,
  deleteTask,
  getTask,
  listRuns,
  listTasks,
  pickDefaultCategory,
  saveTaskPublishResult,
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
        message: "系统内置默认任务未启用，请先在配置中心「自动化」标签页开启并保存。",
      });
    }

    const categoryName = req.body.categoryName || pickDefaultCategory();
    if (!categoryName) {
      return res.status(400).json({
        message: "默认任务池中没有可用分类，请先在「分类管理」中勾选「加入默认任务池」。",
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

  router.post("/:taskId/run", (req, res) => {
    try {
      // 手动执行统一走队列：入队去重 + 单一消费者串行执行，杜绝重复执行
      const task = enqueueTask(Number(req.params.taskId), {
        executorId: req.body.executorId,
      });
      void drainQueue(req.log);
      res.status(202).json({ task, queued: true });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      throw error;
    }
  });

  router.post("/:taskId/dequeue", (req, res) => {
    try {
      res.json(dequeueTask(Number(req.params.taskId)));
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      throw error;
    }
  });

  router.post("/:taskId/push", asyncHandler(async (req, res) => {
    const task = getTask(Number(req.params.taskId));
    if (!task.articlePath) {
      return res.status(400).json({ message: "该任务没有已生成的文章，无法推送。" });
    }

    const repository = getRepositorySettings();

    try {
      await pushRepositoryBranch(repository);
    } catch (error) {
      saveTaskPublishResult(task.id, {
        ...(task.publishResult || {}),
        pushed: false,
        pushError: error.message,
        branch: repository.branch,
      });
      return res.status(502).json({
        message: `推送失败：${error.message}`,
        task: getTask(task.id),
      });
    }

    const publishResult = {
      ...(task.publishResult || {}),
      committed: true,
      pushed: true,
      branch: repository.branch,
    };
    delete publishResult.pushError;
    delete publishResult.pushSkipped;
    saveTaskPublishResult(task.id, publishResult);

    res.json({ task: getTask(task.id) });
  }));

  return router;
}
