import express from "express";

import {
  confirmDraft,
  confirmSingleDraftItem,
  createDraft,
  deleteDraftBatch,
  deleteDraftItem,
  executeDraftGeneration,
  getDraftItems,
  hasRunningDraftForCategory,
  listDrafts,
  updateDraftItem,
} from "../services/draftService.js";
import { hasRunningTaskForCategory } from "../services/taskService.js";

export function createDraftRouter() {
  const router = express.Router();

  router.get("/", (_req, res) => {
    res.json(listDrafts());
  });

  router.get("/:draftId/items", (req, res) => {
    res.json(getDraftItems(Number(req.params.draftId)));
  });

  router.post("/generate", (req, res) => {
    const categoryName = String(req.body.categoryName || "").trim();
    const itemCount = Math.min(100, Math.max(1, Number(req.body.itemCount || 6)));

    if (!categoryName) {
      return res.status(400).json({ message: "分类名称不能为空。" });
    }

    if (hasRunningDraftForCategory(categoryName) || hasRunningTaskForCategory(categoryName)) {
      return res.status(409).json({
        message: `分类「${categoryName}」已有正在执行的草稿或任务，请稍后再试。`,
      });
    }

    const draftId = createDraft(categoryName, req.body.goal || "", req.body.executorId);

    // 异步生成：立即返回批次 ID，前端轮询批次状态直到 ready/failed
    void executeDraftGeneration(
      {
        draftId,
        categoryName,
        goal: req.body.goal || "",
        itemCount,
        executorId: req.body.executorId,
      },
      req.log,
    );

    res.status(202).json({ draftId, async: true });
  });

  router.put("/items/:itemId", (req, res) => {
    res.json(updateDraftItem(Number(req.params.itemId), req.body));
  });

  router.post("/:draftId/confirm", (req, res) => {
    res.json({
      createdTaskIds: confirmDraft(Number(req.params.draftId)),
    });
  });

  router.post("/:draftId/confirm-items", (req, res) => {
    const itemIds = Array.isArray(req.body.itemIds) ? req.body.itemIds : [];
    if (itemIds.length === 0) {
      return res.status(400).json({ message: "请先勾选要加入的任务项。" });
    }

    res.json({
      createdTaskIds: confirmDraft(Number(req.params.draftId), itemIds),
    });
  });

  router.delete("/:draftId", (req, res) => {
    res.json(deleteDraftBatch(Number(req.params.draftId)));
  });

  router.delete("/items/:itemId", (req, res) => {
    res.json(deleteDraftItem(Number(req.params.itemId)));
  });

  router.post("/items/:itemId/confirm", (req, res) => {
    res.json(confirmSingleDraftItem(Number(req.params.itemId)));
  });

  return router;
}
