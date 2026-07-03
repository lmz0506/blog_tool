import express from "express";

import {
  createCategory,
  getCategoryById,
  getDefaultPlan,
  listArticles,
  listCategories,
  updateCategory,
  updateDefaultPlan,
} from "../services/categoryService.js";
import { getTask, syncDefaultTaskWithPlan } from "../services/taskService.js";

export function createCategoryRouter() {
  const router = express.Router();

  router.get("/", (_req, res) => {
    res.json(listCategories());
  });

  router.get("/articles", (req, res) => {
    res.json(listArticles(req.query.categoryName || ""));
  });

  router.post("/", (req, res) => {
    try {
      res.status(201).json(createCategory(req.body));
    } catch (error) {
      const status = String(error.message || "").includes("already exists") ? 409 : 400;
      res.status(status).json({ message: error.message });
    }
  });

  router.put("/:categoryId", (req, res) => {
    const categoryId = Number(req.params.categoryId);
    if (!getCategoryById(categoryId)) {
      return res.status(404).json({ message: "Category not found." });
    }

    try {
      res.json(updateCategory(categoryId, req.body));
    } catch (error) {
      const status = String(error.message || "").includes("already exists") ? 409 : 400;
      res.status(status).json({ message: error.message });
    }
  });

  router.get("/default-plan", (_req, res) => {
    res.json(getDefaultPlan());
  });

  router.post("/default-plan", (req, res) => {
    try {
      const settings = updateDefaultPlan(req.body);
      const defaultTaskId = syncDefaultTaskWithPlan();
      res.json({
        settings,
        defaultTask: defaultTaskId ? getTask(defaultTaskId) : null,
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  return router;
}
