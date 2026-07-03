import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

import { getCategoryByName } from "./categoryService.js";
import { hasRunningDraftForCategory } from "./draftService.js";
import { runExecutor } from "./executorService.js";
import { publishArticleToGit } from "./gitPublishService.js";
import { getRepositorySettings } from "./settingsService.js";
import {
  createTaskPromptContext,
  getTask,
  hasRunningTaskForCategory,
  savePublishedArticle,
  saveTaskPublishResult,
  updateTaskStatus,
} from "./taskService.js";

function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createConflictError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

export function resolveArticleFile(repository, articlePath) {
  const normalized = String(articlePath || "").trim().replaceAll("\\", "/");
  if (!normalized) {
    throw new Error("Executor did not report an article path.");
  }

  const docsRoot = path.resolve(repository.path, repository.docsDir);
  const absolutePath = path.resolve(repository.path, normalized);

  if (absolutePath !== docsRoot && !absolutePath.startsWith(docsRoot + path.sep)) {
    throw new Error(`Article path escapes docs directory: ${articlePath}`);
  }

  if (!existsSync(absolutePath)) {
    throw new Error(`Article file not found: ${absolutePath}`);
  }

  return {
    absolutePath,
    relativePath: path.relative(repository.path, absolutePath).replaceAll("\\", "/"),
  };
}

export async function validateArticleFrontMatter({ repository, articlePath, categoryName, fallbackTitle }) {
  const { absolutePath, relativePath } = resolveArticleFile(repository, articlePath);
  const raw = await readFile(absolutePath, "utf8");
  const parsed = matter(raw);
  const data = { ...parsed.data };
  const fixedFields = [];

  const category = getCategoryByName(categoryName);
  const displayCategory = category?.displayName || categoryName;

  if (!data.layout) {
    data.layout = "doc";
    fixedFields.push("layout");
  }
  if (!data.title || !String(data.title).trim()) {
    data.title = fallbackTitle || path.basename(absolutePath, path.extname(absolutePath));
    fixedFields.push("title");
  }
  if (!data.category || !String(data.category).trim()) {
    data.category = displayCategory;
    fixedFields.push("category");
  }
  if (!data.date) {
    data.date = formatDateOnly(new Date());
    fixedFields.push("date");
  }
  if (!Array.isArray(data.tags) || data.tags.length === 0) {
    data.tags = [displayCategory];
    fixedFields.push("tags");
  }

  if (fixedFields.length > 0) {
    if (data.date instanceof Date) {
      data.date = formatDateOnly(data.date);
    }
    await writeFile(absolutePath, matter.stringify(parsed.content, data), "utf8");
  }

  return {
    relativePath,
    title: String(data.title),
    fixedFields,
  };
}

export async function executeTask(taskId, { executorId } = {}) {
  const task = getTask(taskId);
  const repository = getRepositorySettings();

  if (task.status !== "pending" && task.status !== "failed") {
    throw createConflictError("Only pending or failed tasks can be executed.");
  }

  if (hasRunningDraftForCategory(task.categoryName) || hasRunningTaskForCategory(task.categoryName, task.id)) {
    throw createConflictError(`Category ${task.categoryName} already has another running draft or task.`);
  }

  updateTaskStatus(task.id, "running", { executorId });

  let run;
  try {
    const prompt = createTaskPromptContext({
      task,
      categoryName: task.categoryName,
      repository,
    });

    run = await runExecutor({
      executorId,
      promptContent: prompt,
      runType: "write-task",
      metadata: {
        taskId: task.id,
        categoryName: task.categoryName,
      },
    });
  } catch (error) {
    updateTaskStatus(task.id, "failed", { executorId });
    throw error;
  }

  if (run.status !== "success" || run.resultPayload?.status !== "done") {
    updateTaskStatus(task.id, "failed", { executorId });
    return {
      ok: false,
      message: "Task execution failed.",
      task: getTask(task.id),
      run,
    };
  }

  let validated;
  try {
    validated = await validateArticleFrontMatter({
      repository,
      articlePath: run.resultPayload.articlePath,
      categoryName: task.categoryName,
      fallbackTitle: run.resultPayload.title,
    });
  } catch (error) {
    updateTaskStatus(task.id, "failed", { executorId });
    return {
      ok: false,
      message: `Article validation failed: ${error.message}`,
      task: getTask(task.id),
      run,
    };
  }

  const completedTask = {
    ...task,
    articlePath: validated.relativePath,
    articleTitle: validated.title || run.resultPayload.title,
    executorId,
    categoryName: task.categoryName,
  };

  updateTaskStatus(task.id, "done", completedTask);
  savePublishedArticle(completedTask);

  let gitPublish;
  try {
    gitPublish = await publishArticleToGit({
      repository,
      task: completedTask,
    });
  } catch (error) {
    gitPublish = {
      committed: false,
      pushed: false,
      branch: repository.branch,
      error: error.message,
    };
  }

  if (validated.fixedFields.length > 0) {
    gitPublish = { ...gitPublish, fixedFrontMatterFields: validated.fixedFields };
  }

  saveTaskPublishResult(task.id, gitPublish);

  return {
    ok: true,
    task: getTask(task.id),
    run,
    gitPublish,
  };
}
