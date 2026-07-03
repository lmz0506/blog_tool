import express from "express";
import { asyncHandler } from "./asyncHandler.js";

import {
  getRepositoryConfig,
  saveRepositoryConfig,
  scanRepository
} from "../services/repositoryService.js";

export function createRepositoryRouter() {
  const router = express.Router();

  router.get("/", asyncHandler(async (_req, res) => {
    res.json(await getRepositoryConfig());
  }));

  router.post("/", asyncHandler(async (req, res) => {
    const repository = await saveRepositoryConfig(req.body);
    res.json(repository);
  }));

  router.post("/scan", asyncHandler(async (_req, res) => {
    res.json(await scanRepository());
  }));

  return router;
}
