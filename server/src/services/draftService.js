import { getDatabase } from "./storage/database.js";
import { runExecutor } from "./executorService.js";

function buildPlanPrompt({ categoryName, goal, itemCount }) {
  return `你正在为博客分类「${categoryName}」生成文章任务计划。
目标：${goal || "围绕该分类生成系统化知识点文章计划。"}

要求：
1. 只生成知识点任务计划，不生成文章正文。
2. 输出 ${itemCount || 6} 个任务项，每个任务项对应未来一篇文章。
3. 每个任务项必须包含 title 和 contentBrief。
4. 不要写入任何结果文件。
5. 你的最终回复必须只包含一个 JSON 对象，不要附加解释文字。
6. JSON 结构如下：
{
  "marker": "BLOG_TOOL_TASK_DONE",
  "categoryName": "${categoryName}",
  "items": [
    { "title": "xxx", "contentBrief": "xxx" }
  ]
}
7. 不要输出代码块，不要输出 Markdown，只输出 JSON。`;
}

function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDefaultScheduledDate(index) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + index);
  return formatDateOnly(date);
}

export function listDrafts() {
  const db = getDatabase();
  const drafts = db.prepare(`
    SELECT
      d.*,
      COUNT(i.id) AS item_count
    FROM plan_drafts d
    LEFT JOIN draft_items i ON i.draft_id = d.id
    GROUP BY d.id
    ORDER BY d.created_at DESC
  `).all();

  return drafts.map((draft) => ({
    id: draft.id,
    categoryName: draft.category_name,
    source: draft.source,
    status: draft.status,
    goal: draft.goal,
    executorId: draft.executor_id,
    itemCount: draft.item_count,
    promptText: draft.prompt_text,
    resultText: draft.result_text,
    stdoutText: draft.stdout_text,
    stderrText: draft.stderr_text,
    createdAt: draft.created_at,
    updatedAt: draft.updated_at,
  }));
}

export function hasRunningDraftForCategory(categoryName) {
  const row = getDatabase()
    .prepare(`
      SELECT id
      FROM plan_drafts
      WHERE category_name = ? AND status = 'running'
      LIMIT 1
    `)
    .get(categoryName);

  return Boolean(row);
}

export function updateDraftStatus(draftId, status) {
  getDatabase()
    .prepare(`
      UPDATE plan_drafts
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .run(status, draftId);
}

export function saveDraftRunLog(draftId, payload) {
  getDatabase()
    .prepare(`
      UPDATE plan_drafts
      SET prompt_text = @promptText,
          result_text = @resultText,
          stdout_text = @stdoutText,
          stderr_text = @stderrText,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @draftId
    `)
    .run({
      draftId,
      promptText: payload.promptText ?? null,
      resultText: payload.resultText ?? null,
      stdoutText: payload.stdoutText ?? null,
      stderrText: payload.stderrText ?? null,
    });
}

export function getDraftItems(draftId) {
  return getDatabase()
    .prepare(`
      SELECT *
      FROM draft_items
      WHERE draft_id = ?
      ORDER BY order_no ASC, id ASC
    `)
    .all(draftId)
    .map((row) => ({
      id: row.id,
      draftId: row.draft_id,
      categoryName: row.category_name,
      title: row.title,
      contentBrief: row.content_brief,
      orderNo: row.order_no,
      scheduledDate: row.scheduled_date,
      status: row.status,
    }));
}

export function createDraft(categoryName, goal, executorId) {
  const info = getDatabase()
    .prepare(`
      INSERT INTO plan_drafts (category_name, goal, executor_id, status)
      VALUES (?, ?, ?, 'running')
    `)
    .run(categoryName, goal, executorId);

  return Number(info.lastInsertRowid);
}

export function saveDraftResult({ draftId, categoryName, items }) {
  const db = getDatabase();
  const insertItem = db.prepare(`
    INSERT INTO draft_items (
      draft_id, category_name, title, content_brief, order_no, scheduled_date, status
    ) VALUES (
      @draftId, @categoryName, @title, @contentBrief, @orderNo, @scheduledDate, 'draft'
    )
  `);

  items.forEach((item, index) => {
    insertItem.run({
      draftId,
      categoryName,
      title: item.title,
      contentBrief: item.contentBrief || "",
      orderNo: index + 1,
      scheduledDate: item.scheduledDate || buildDefaultScheduledDate(index),
    });
  });

  db.prepare(`
    UPDATE plan_drafts
    SET status = 'ready',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(draftId);
}

export function updateDraftItem(itemId, input) {
  const db = getDatabase();
  const current = db.prepare("SELECT * FROM draft_items WHERE id = ?").get(itemId);
  if (!current) {
    throw new Error(`草稿任务项不存在：${itemId}`);
  }

  db.prepare(`
    UPDATE draft_items
    SET title = @title,
        content_brief = @contentBrief,
        order_no = @orderNo,
        scheduled_date = @scheduledDate,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({
    id: itemId,
    title: input.title ?? current.title,
    contentBrief: input.contentBrief ?? current.content_brief,
    orderNo: Number(input.orderNo ?? current.order_no),
    scheduledDate: input.scheduledDate ?? current.scheduled_date,
  });

  return db.prepare("SELECT * FROM draft_items WHERE id = ?").get(itemId);
}

export function confirmDraft(draftId, itemIds = null) {
  const db = getDatabase();
  const draft = db.prepare("SELECT * FROM plan_drafts WHERE id = ?").get(draftId);
  if (!draft) {
    throw new Error(`草稿批次不存在：${draftId}`);
  }

  let items = db.prepare(`
    SELECT *
    FROM draft_items
    WHERE draft_id = ? AND status != 'confirmed'
    ORDER BY order_no ASC, id ASC
  `).all(draftId);

  if (Array.isArray(itemIds)) {
    const idSet = new Set(itemIds.map(Number));
    items = items.filter((item) => idSet.has(item.id));
  }

  if (items.length === 0) {
    throw new Error("没有可确认的草稿任务项。");
  }

  const grouped = new Map();
  items.forEach((item) => {
    const key = item.scheduled_date || `unscheduled-${item.id}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(item);
  });

  const insertTask = db.prepare(`
    INSERT INTO tasks (
      category_name, title, task_type, status, scheduled_date
    ) VALUES (
      @categoryName, @title, 'planned', 'pending', @scheduledDate
    )
  `);

  const insertTaskItem = db.prepare(`
    INSERT INTO task_items (
      task_id, source_draft_item_id, title, content_brief, order_no
    ) VALUES (
      @taskId, @sourceDraftItemId, @title, @contentBrief, @orderNo
    )
  `);

  const createdTasks = [];

  for (const [scheduledDate, groupItems] of grouped.entries()) {
    const title =
      groupItems.length === 1
        ? groupItems[0].title
        : `${draft.category_name} / ${
            scheduledDate.startsWith("unscheduled-") ? "未排期" : scheduledDate.replace("T", " ")
          } 合并任务`;

    const taskInfo = insertTask.run({
      categoryName: draft.category_name,
      title,
      scheduledDate: scheduledDate.startsWith("unscheduled-") ? null : scheduledDate,
    });

    const taskId = Number(taskInfo.lastInsertRowid);

    groupItems.forEach((item, index) => {
      insertTaskItem.run({
        taskId,
        sourceDraftItemId: item.id,
        title: item.title,
        contentBrief: item.content_brief,
        orderNo: index + 1,
      });
    });

    createdTasks.push(taskId);
  }

  const confirmPlaceholders = items.map(() => "?").join(", ");
  db.prepare(`
    UPDATE draft_items
    SET status = 'confirmed',
        updated_at = CURRENT_TIMESTAMP
    WHERE id IN (${confirmPlaceholders})
  `).run(...items.map((item) => item.id));

  // 所有任务项都确认后，批次才标记为 confirmed
  const pendingCount = db.prepare(`
    SELECT COUNT(*) AS cnt FROM draft_items
    WHERE draft_id = ? AND status != 'confirmed'
  `).get(draftId);

  if (pendingCount.cnt === 0) {
    db.prepare(`
      UPDATE plan_drafts
      SET status = 'confirmed',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(draftId);
  }

  return createdTasks;
}

export function deleteDraftBatch(draftId) {
  const db = getDatabase();
  const draft = db.prepare("SELECT * FROM plan_drafts WHERE id = ?").get(draftId);
  if (!draft) {
    throw new Error(`草稿批次不存在：${draftId}`);
  }

  if (draft.status === "running") {
    throw new Error("执行中的草稿批次不能删除。");
  }

  db.prepare("DELETE FROM task_runs WHERE draft_id = ?").run(draftId);
  db.prepare("DELETE FROM plan_drafts WHERE id = ?").run(draftId);

  return {
    draftId,
    deleted: true,
  };
}

export function confirmSingleDraftItem(itemId) {
  const db = getDatabase();
  const item = db.prepare("SELECT * FROM draft_items WHERE id = ?").get(itemId);
  if (!item) {
    throw new Error(`草稿任务项不存在：${itemId}`);
  }

  if (item.status === "confirmed") {
    throw new Error("该任务项已确认过，无需重复加入。");
  }

  const draft = db.prepare("SELECT * FROM plan_drafts WHERE id = ?").get(item.draft_id);
  if (!draft) {
    throw new Error(`草稿批次不存在：${item.draft_id}`);
  }

  const insertTask = db.prepare(`
    INSERT INTO tasks (
      category_name, title, task_type, status, scheduled_date
    ) VALUES (
      @categoryName, @title, 'planned', 'pending', @scheduledDate
    )
  `);

  const insertTaskItem = db.prepare(`
    INSERT INTO task_items (
      task_id, source_draft_item_id, title, content_brief, order_no
    ) VALUES (
      @taskId, @sourceDraftItemId, @title, @contentBrief, @orderNo
    )
  `);

  const taskInfo = insertTask.run({
    categoryName: item.category_name,
    title: item.title,
    scheduledDate: item.scheduled_date,
  });

  const taskId = Number(taskInfo.lastInsertRowid);

  insertTaskItem.run({
    taskId,
    sourceDraftItemId: item.id,
    title: item.title,
    contentBrief: item.content_brief,
    orderNo: 1,
  });

  db.prepare(`
    UPDATE draft_items
    SET status = 'confirmed',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(itemId);

  // 如果该批次所有 item 都已确认，将批次也标记为 confirmed
  const pendingCount = db.prepare(`
    SELECT COUNT(*) AS cnt FROM draft_items
    WHERE draft_id = ? AND status != 'confirmed'
  `).get(item.draft_id);

  if (pendingCount.cnt === 0) {
    db.prepare(`
      UPDATE plan_drafts
      SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(item.draft_id);
  }

  return { taskId, itemId };
}

export function deleteDraftItem(itemId) {
  const db = getDatabase();
  const item = db.prepare("SELECT * FROM draft_items WHERE id = ?").get(itemId);
  if (!item) {
    throw new Error(`草稿任务项不存在：${itemId}`);
  }

  const draft = db.prepare("SELECT * FROM plan_drafts WHERE id = ?").get(item.draft_id);
  if (draft && draft.status === "running") {
    throw new Error("执行中的批次不能删除任务项。");
  }

  db.prepare("DELETE FROM draft_items WHERE id = ?").run(itemId);

  return {
    itemId,
    deleted: true,
  };
}

export function createPlanPromptContext(input) {
  return buildPlanPrompt(input);
}

// 草稿生成的后台执行：调用方立即返回，生成结果/失败状态写库，前端轮询批次状态
export async function executeDraftGeneration({ draftId, categoryName, goal, itemCount, executorId }, logger) {
  const prompt = buildPlanPrompt({ categoryName, goal, itemCount });

  let run;
  try {
    run = await runExecutor({
      executorId,
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
    logger?.error(`Draft #${draftId} generation error: ${error.message}`);
    return;
  }

  saveDraftRunLog(draftId, {
    promptText: prompt,
    resultText: run.resultText,
    stdoutText: run.stdoutText,
    stderrText: run.stderrText,
  });

  if (run.status !== "success" || !Array.isArray(run.resultPayload?.items)) {
    updateDraftStatus(draftId, "failed");
    logger?.warn(`Draft #${draftId} generation failed.`);
    return;
  }

  saveDraftResult({
    draftId,
    categoryName,
    items: run.resultPayload.items,
  });
  logger?.info(`Draft #${draftId} generated ${run.resultPayload.items.length} items.`);
}
