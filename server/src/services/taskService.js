import { getDatabase } from "./storage/database.js";
import { getCategoryByName } from "./categoryService.js";
import { getDefaultPlanSettings } from "./settingsService.js";

function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildTaskPrompt({ categoryName, displayCategoryName, task, docsDir, repositoryPath }) {
  const knowledgePoints = task.items.length > 0
    ? task.items
        .map((item, index) => `${index + 1}. ${item.title}\n   说明：${item.contentBrief || "无"}`)
        .join("\n")
    : `（本任务未指定知识点。请先浏览 ${docsDir}/${categoryName}/ 目录下已有的文章标题，然后自主选择一个该分类下有价值、且现有文章尚未覆盖的主题来写作。）`;

  return `你正在为博客分类「${displayCategoryName}」编写一篇文章。
任务标题：${task.title}
目标知识点：
${knowledgePoints}

要求：
1. 文章保存到仓库：${repositoryPath}
2. 文章必须保存在目录 ${docsDir}/${categoryName}/ 下，目录名必须完全一致，不要新建其他目录。
3. 生成一篇 Markdown 文章，如果任务包含多个知识点，合并成一篇完整文章。
4. 文章必须包含完整代码示例和详细讲解。
5. 读写任何文件都必须使用 UTF-8 编码，避免中文乱码。
6. 严格控制探索范围：最多只允许查看 ${docsDir}/${categoryName}/ 目录下的文件名和文章标题（用于避免主题重复），禁止阅读仓库中的其他任何目录和文件（包括但不限于 .claude、.agents、.codex、_site、node_modules、assets、admin、_layouts、_includes 等），禁止运行构建、测试等无关命令，尽快完成写作。
7. 文章文件开头必须包含 YAML front-matter，字段和格式如下（category 必须是「${displayCategoryName}」，不要用目录名代替）：
---
layout: doc
title: 文章标题
category: ${displayCategoryName}
date: '${formatDateOnly(new Date())}'
tags:
  - 相关标签1
  - 相关标签2
---
8. 如果文章需要配图，图片保存到仓库的 assets/images/docs/ 目录，并在正文中使用 /assets/images/docs/ 开头的路径引用。
9. 不要写入任何结果文件，不要执行 git 提交或推送。
10. 你的最终回复必须只包含一个 JSON 对象，不要附加解释文字。
11. JSON 格式如下：
{
  "marker": "BLOG_TOOL_TASK_DONE",
  "taskId": ${task.id},
  "categoryName": "${categoryName}",
  "status": "done",
  "articlePath": "${docsDir}/${categoryName}/example.md",
  "title": "文章标题"
}
12. 最终回复不要输出代码块，不要输出 Markdown，只输出 JSON。`;
}

function normalizeNullableText(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

function parsePublishResult(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function hasRunningTaskForCategory(categoryName, excludeTaskId = null) {
  const row = getDatabase()
    .prepare(`
      SELECT id
      FROM tasks
      WHERE category_name = @categoryName
        AND status = 'running'
        AND (@excludeTaskId IS NULL OR id != @excludeTaskId)
      LIMIT 1
    `)
    .get({
      categoryName,
      excludeTaskId,
    });

  return Boolean(row);
}

export function listTasks() {
  const db = getDatabase();
  const tasks = db.prepare(`
    SELECT *
    FROM tasks
    ORDER BY
      CASE status
        WHEN 'running' THEN 0
        WHEN 'queued' THEN 1
        WHEN 'pending' THEN 2
        WHEN 'failed' THEN 3
        WHEN 'done' THEN 4
        ELSE 5
      END,
      COALESCE(scheduled_date, '9999-12-31') ASC,
      id ASC
  `).all();

  const itemQuery = db.prepare(`
    SELECT *
    FROM task_items
    WHERE task_id = ?
    ORDER BY order_no ASC, id ASC
  `);

  return tasks.map((task) => ({
    id: task.id,
    categoryName: task.category_name,
    title: task.title,
    taskType: task.task_type,
    status: task.status,
    scheduledDate: task.scheduled_date,
    executorId: task.executor_id,
    articlePath: task.article_path,
    articleTitle: task.article_title,
    publishResult: parsePublishResult(task.publish_result),
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    items: itemQuery.all(task.id).map((item) => ({
      id: item.id,
      title: item.title,
      contentBrief: item.content_brief,
      orderNo: item.order_no,
    })),
  }));
}

export function getTask(taskId) {
  const task = listTasks().find((item) => item.id === Number(taskId));
  if (!task) {
    throw new Error(`任务不存在：${taskId}`);
  }
  return task;
}

export function updateTask(taskId, input) {
  const db = getDatabase();
  const current = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  if (!current) {
    throw new Error(`任务不存在：${taskId}`);
  }

  if (current.status !== "pending") {
    throw new Error("只有待执行任务可以编辑。");
  }

  db.prepare(`
    UPDATE tasks
    SET title = @title,
        scheduled_date = @scheduledDate,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({
    id: taskId,
    title: String(input.title ?? current.title).trim() || current.title,
    scheduledDate:
      normalizeNullableText(input.scheduledDate) === undefined
        ? current.scheduled_date
        : normalizeNullableText(input.scheduledDate),
  });

  if (Array.isArray(input.items)) {
    const existingItems = db.prepare("SELECT * FROM task_items WHERE task_id = ?").all(taskId);
    const itemMap = new Map(existingItems.map((item) => [item.id, item]));
    const updateItem = db.prepare(`
      UPDATE task_items
      SET title = @title,
          content_brief = @contentBrief,
          order_no = @orderNo
      WHERE id = @id AND task_id = @taskId
    `);

    input.items.forEach((itemInput, index) => {
      const currentItem = itemMap.get(Number(itemInput.id));
      if (!currentItem) {
        throw new Error(`任务知识点不存在：${itemInput.id}`);
      }

      updateItem.run({
        id: currentItem.id,
        taskId,
        title: String(itemInput.title ?? currentItem.title).trim() || currentItem.title,
        contentBrief: itemInput.contentBrief ?? currentItem.content_brief,
        orderNo: Number(itemInput.orderNo ?? index + 1),
      });
    });
  }

  return getTask(taskId);
}

export function updateTaskStatus(taskId, status, payload = {}) {
  getDatabase()
    .prepare(`
      UPDATE tasks
      SET status = @status,
          executor_id = COALESCE(@executorId, executor_id),
          article_path = COALESCE(@articlePath, article_path),
          article_title = COALESCE(@articleTitle, article_title),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `)
    .run({
      id: taskId,
      status,
      executorId: payload.executorId || null,
      articlePath: payload.articlePath || null,
      articleTitle: payload.articleTitle || null,
    });
}

export function saveTaskPublishResult(taskId, publishResult) {
  getDatabase()
    .prepare(`
      UPDATE tasks
      SET publish_result = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .run(publishResult ? JSON.stringify(publishResult) : null, taskId);
}

export function savePublishedArticle(task) {
  if (!task.articlePath || !task.articleTitle) {
    return;
  }

  getDatabase()
    .prepare(`
      INSERT INTO articles (category_name, title, file_path, slug, published_at, updated_at)
      VALUES (@categoryName, @title, @filePath, @slug, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(file_path) DO UPDATE SET
        title = excluded.title,
        updated_at = CURRENT_TIMESTAMP
    `)
    .run({
      categoryName: task.categoryName,
      title: task.articleTitle,
      filePath: task.articlePath,
      slug: task.articleTitle
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, ""),
    });
}

export function listRuns() {
  return getDatabase()
    .prepare(`
      SELECT *
      FROM task_runs
      ORDER BY created_at DESC, id DESC
      LIMIT 60
    `)
    .all()
    .map((row) => ({
      id: row.id,
      taskId: row.task_id,
      draftId: row.draft_id,
      categoryName: row.category_name,
      executorId: row.executor_id,
      runType: row.run_type,
      status: row.status,
      promptText: row.prompt_text,
      resultText: row.result_text,
      stdoutText: row.stdout_text,
      stderrText: row.stderr_text,
      agentMarker: row.agent_marker,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      createdAt: row.created_at,
    }));
}

export function createDefaultTask(categoryName) {
  const db = getDatabase();
  const existing = getDefaultTaskRow();

  if (existing) {
    return Number(existing.id);
  }

  const info = db.prepare(`
    INSERT INTO tasks (category_name, title, task_type, status)
    VALUES (?, ?, 'default_random', 'pending')
  `).run(categoryName, `${categoryName} / 系统默认任务`);

  return Number(info.lastInsertRowid);
}

function getDefaultTaskRow() {
  return getDatabase().prepare(`
    SELECT id, status
    FROM tasks
    WHERE task_type = 'default_random'
    ORDER BY
      CASE status
        WHEN 'running' THEN 0
        WHEN 'queued' THEN 1
        WHEN 'pending' THEN 2
        ELSE 3
      END,
      id ASC
    LIMIT 1
  `).get();
}

export function findDefaultTask() {
  const row = getDatabase()
    .prepare(`
      SELECT id, status, category_name
      FROM tasks
      WHERE task_type = 'default_random'
      ORDER BY id DESC
      LIMIT 1
    `)
    .get();

  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    status: row.status,
    categoryName: row.category_name,
  };
}

export function syncDefaultTaskWithPlan() {
  const config = getDefaultPlanSettings();
  const existing = getDefaultTaskRow();

  if (!config.enabled) {
    if (existing?.status === "running") {
      throw new Error("系统默认任务正在执行，不能关闭。");
    }

    if (existing) {
      deleteTask(Number(existing.id));
    }

    return null;
  }

  if (existing) {
    return Number(existing.id);
  }

  const categoryName = pickDefaultCategory();
  if (!categoryName) {
    return null;
  }

  return createDefaultTask(categoryName);
}

export function deleteTask(taskId) {
  const db = getDatabase();
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  if (!task) {
    throw new Error(`任务不存在：${taskId}`);
  }

  if (task.status === "running") {
    throw new Error("执行中的任务不能删除。");
  }

  db.prepare("DELETE FROM task_runs WHERE task_id = ?").run(taskId);
  db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);

  return {
    taskId,
    deleted: true,
  };
}

export function pickDefaultCategory() {
  const config = getDefaultPlanSettings();
  if (!config.enabled) {
    return null;
  }

  const rows = getDatabase()
    .prepare(`
      SELECT name
      FROM categories
      WHERE enabled = 1 AND is_default_pool = 1
      ORDER BY RANDOM()
      LIMIT 1
    `)
    .all();

  return rows[0]?.name || null;
}

export function createTaskPromptContext({ task, categoryName, repository }) {
  const displayCategoryName = getCategoryByName(categoryName)?.displayName || categoryName;

  return buildTaskPrompt({
    categoryName,
    displayCategoryName,
    task,
    docsDir: repository.docsDir,
    repositoryPath: repository.path,
  });
}
