import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

import express from "express";

import { asyncHandler } from "./asyncHandler.js";

function listWindowsDrives() {
  const drives = [];
  for (let code = 65; code <= 90; code += 1) {
    const drive = `${String.fromCharCode(code)}:\\`;
    if (existsSync(drive)) {
      drives.push({ name: drive, path: drive });
    }
  }
  return drives;
}

export function createSystemRouter() {
  const router = express.Router();

  router.get("/browse", asyncHandler(async (req, res) => {
    const requested = String(req.query.path || "").trim();
    const includeFiles = String(req.query.includeFiles || "") === "true";

    if (!requested) {
      if (process.platform === "win32") {
        return res.json({ path: "", parent: null, directories: listWindowsDrives(), files: [] });
      }
      return res.json(await readDirectory("/", includeFiles));
    }

    const target = path.resolve(requested);
    if (!existsSync(target)) {
      return res.status(400).json({ message: `路径不存在：${target}` });
    }

    res.json(await readDirectory(target, includeFiles));
  }));

  return router;
}

async function readDirectory(target, includeFiles) {
  let entries = [];
  try {
    entries = await readdir(target, { withFileTypes: true });
  } catch (error) {
    const failure = new Error(`无法读取目录：${error.message}`);
    failure.statusCode = 400;
    throw failure;
  }

  const directories = [];
  const files = [];

  entries.forEach((entry) => {
    if (entry.isDirectory()) {
      directories.push({ name: entry.name, path: path.join(target, entry.name) });
    } else if (includeFiles && entry.isFile()) {
      files.push({ name: entry.name, path: path.join(target, entry.name) });
    }
  });

  const sorter = (left, right) => left.name.localeCompare(right.name, "zh-CN");
  directories.sort(sorter);
  files.sort(sorter);

  const parentDir = path.dirname(target);
  const parent = parentDir === target ? "" : parentDir;

  return { path: target, parent, directories, files };
}
