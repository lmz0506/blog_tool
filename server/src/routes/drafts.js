import express from "express";

import { runExecutor } from "../services/executorService.js";
import {
  confirmDraft,
  confirmSingleDraftItem,
  createDraft,
  createPlanPromptContext,
  deleteDraftBatch,
  deleteDraftItem,
  getDraftItems,
  hasRunningDraftForCategory,
  listDrafts,
  saveDraftResult,
  saveDraftRunLog,
  updateDraftItem,
  updateDraftStatus,
} from "../services/draftService.js";
import { hasRunningTaskForCategory } from "../services/taskService.js";
import { asyncHandler } from "./asyncHandler.js";

export function createDraftRouter() {
  const router = express.Router();

  router.get("/", (_req, res) => {
    res.json(listDrafts());
  });

  router.get("/:draftId/items", (req, res) => {
    res.json(getDraftItems(Number(req.params.draftId)));
  });

  router.post("/generate", asyncHandler(async (req, res) => {
    const categoryName = String(req.body.categoryName || "").trim();
    const itemCount = Math.min(100, Math.max(1, Number(req.body.itemCount || 6)));

    if (!categoryName) {
      return res.status(400).json({ message: "Category name is required." });
    }

    if (hasRunningDraftForCategory(categoryName) || hasRunningTaskForCategory(categoryName)) {
      return res.status(409).json({
        message: `Category ${categoryName} already has a running draft or task.`,
      });
    }

    const draftId = createDraft(categoryName, req.body.goal || "", req.body.executorId);
    const prompt = createPlanPromptContext({
      categoryName,
      goal: req.body.goal || "",
      itemCount,
    });

    let run;
    try {
      run = await runExecutor({
        executorId: req.body.executorId,
        promptContent: prompt,
        runType: "draft-plan",
        metadata: {
          draftId,
          categoryName,
        },
      });
    } catch (error) {
      updateDraftStatus(draftId, "failed");
      saveDraftRunLog(draftId, {
        promptText: prompt,
        stderrText: error.message,
      });
      throw error;
    }

    saveDraftRunLog(draftId, {
      promptText: prompt,
      resultText: run.resultText,
      stdoutText: run.stdoutText,
      stderrText: run.stderrText,
    });

    if (run.status !== "success" || !Array.isArray(run.resultPayload?.items)) {
      updateDraftStatus(draftId, "failed");
      return res.status(400).json({
        message: "Draft generation failed.",
        run,
      });
    }

    saveDraftResult({
      draftId,
      categoryName,
      items: run.resultPayload.items,
    });

    res.status(201).json({
      draftId,
      run,
      items: getDraftItems(draftId),
    });
  }));

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
      return res.status(400).json({ message: "itemIds is required." });
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
