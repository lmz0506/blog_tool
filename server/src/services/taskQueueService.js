import { getDatabase } from "./storage/database.js";
import { getDefaultPlanSettings } from "./settingsService.js";
import { executeTask } from "./taskRunnerService.js";
import { getTask, updateTaskStatus } from "./taskService.js";

function createConflictError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

// 入队：队列即任务表中 status = 'queued' 的记录。
// 状态变更天然去重——同一任务不可能重复入队（重复入队返回 409）。
export function enqueueTask(taskId, { executorId } = {}) {
  const task = getTask(taskId);

  if (task.status === "queued") {
    throw createConflictError("该任务已在执行队列中，请勿重复添加。");
  }

  if (task.status === "running") {
    throw createConflictError("该任务正在执行中。");
  }

  if (task.status !== "pending" && task.status !== "failed") {
    throw createConflictError("只有待执行或已失败的任务可以加入执行队列。");
  }

  updateTaskStatus(task.id, "queued", { executorId: executorId || null });
  return getTask(taskId);
}

export function dequeueTask(taskId) {
  const task = getTask(taskId);

  if (task.status !== "queued") {
    throw createConflictError("该任务不在执行队列中。");
  }

  updateTaskStatus(task.id, "pending", {});
  return getTask(taskId);
}

function findNextQueuedTask(excludeIds) {
  const db = getDatabase();
  if (excludeIds.size === 0) {
    return db.prepare(`
      SELECT id, executor_id
      FROM tasks
      WHERE status = 'queued'
      ORDER BY COALESCE(scheduled_date, '9999-12-31T23:59:59') ASC, id ASC
      LIMIT 1
    `).get();
  }

  const placeholders = Array.from(excludeIds).map(() => "?").join(", ");
  return db.prepare(`
    SELECT id, executor_id
    FROM tasks
    WHERE status = 'queued' AND id NOT IN (${placeholders})
    ORDER BY COALESCE(scheduled_date, '9999-12-31T23:59:59') ASC, id ASC
    LIMIT 1
  `).get(...excludeIds);
}

let draining = false;

export function isQueueDraining() {
  return draining;
}

// 队列消费者：串行执行队列中的任务，同一时刻只跑一个 Agent。
// 服务启动、定时器触发、手动入队时都会调用；重复调用只会有一个消费循环在跑。
export async function drainQueue(logger) {
  if (draining) {
    return;
  }

  draining = true;
  const skipped = new Set();

  try {
    for (;;) {
      const row = findNextQueuedTask(skipped);
      if (!row) {
        break;
      }

      const taskId = Number(row.id);
      const executorId = row.executor_id || getDefaultPlanSettings().defaultExecutorId;

      try {
        logger?.info(`Queue: executing task #${taskId}`);
        const result = await executeTask(taskId, { executorId });
        if (result.ok) {
          logger?.info(`Queue: task #${taskId} done, article ${result.task.articlePath}`);
        } else {
          logger?.warn(`Queue: task #${taskId} failed: ${result.message}`);
        }
      } catch (error) {
        logger?.error(`Queue: task #${taskId} error: ${error.message}`);

        if (error.statusCode === 409) {
          // 冲突（如同分类草稿在生成）：留在队列中，本轮跳过，下一轮重试
          skipped.add(taskId);
          continue;
        }

        // 其他异常：任务必须离开队列，避免消费循环卡死
        try {
          const current = getDatabase().prepare("SELECT status FROM tasks WHERE id = ?").get(taskId);
          if (current?.status === "queued") {
            updateTaskStatus(taskId, "failed", {});
          }
        } catch {
          // ignore
        }
      }
    }
  } finally {
    draining = false;
  }
}
