import { getDatabase } from "./storage/database.js";
import { getDefaultPlanSettings } from "./settingsService.js";
import { drainQueue, enqueueTask } from "./taskQueueService.js";
import {
  createDefaultTask,
  findDefaultTask,
  pickDefaultCategory,
  updateTaskStatus,
} from "./taskService.js";

const TICK_INTERVAL_MS = 60_000;

let timer = null;

function nowText() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return `${date}T${time}`;
}

function findDueTasks() {
  // scheduled_date 可能是纯日期（视为当天 00:00 起可执行）或带时分秒的完整时间，
  // 字符串比较对两种格式都成立（"2026-07-06" < "2026-07-06T09:30:00"）
  return getDatabase()
    .prepare(`
      SELECT id, title
      FROM tasks
      WHERE status = 'pending'
        AND scheduled_date IS NOT NULL
        AND scheduled_date <= ?
      ORDER BY scheduled_date ASC, id ASC
    `)
    .all(nowText());
}

function enqueueDueTasks(settings, logger) {
  const dueTasks = findDueTasks();

  dueTasks.forEach((dueTask) => {
    try {
      enqueueTask(Number(dueTask.id), { executorId: settings.defaultExecutorId });
      logger.info(`Scheduler: task #${dueTask.id} (${dueTask.title}) enqueued.`);
    } catch (error) {
      // 已入队/执行中等冲突直接忽略
      if (error.statusCode !== 409) {
        logger.error(`Scheduler: enqueue task #${dueTask.id} error: ${error.message}`);
      }
    }
  });

  return dueTasks.length;
}

// 当天是否存在任何排期任务（不论状态：待执行/已入队/执行中/已完成/已失败）
function hasScheduledTasksToday() {
  const today = nowText().slice(0, 10);
  const row = getDatabase()
    .prepare(`
      SELECT 1
      FROM tasks
      WHERE task_type != 'default_random'
        AND scheduled_date IS NOT NULL
        AND substr(scheduled_date, 1, 10) = ?
      LIMIT 1
    `)
    .get(today);

  return Boolean(row);
}

// 默认任务今天是否已经执行过（含手动执行）
function defaultTaskRanToday() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const row = getDatabase()
    .prepare(`
      SELECT 1
      FROM task_runs tr
      JOIN tasks t ON t.id = tr.task_id
      WHERE t.task_type = 'default_random'
        AND tr.run_type = 'write-task'
        AND tr.started_at >= ?
      LIMIT 1
    `)
    .get(startOfToday.toISOString());

  return Boolean(row);
}

// 默认任务兜底策略：默认任务永远存在；当天没有任何排期任务时，默认任务当天自动执行一次
function maybeEnqueueDefaultTask(settings, logger) {
  if (!settings.enabled) {
    return;
  }

  if (hasScheduledTasksToday() || defaultTaskRanToday()) {
    return;
  }

  let defaultTask = findDefaultTask();

  // 保证默认任务永远存在：不存在则从默认池随机选类补建
  if (!defaultTask) {
    const categoryName = pickDefaultCategory();
    if (!categoryName) {
      logger.warn("Scheduler: default task fallback skipped, default pool is empty.");
      return;
    }
    const taskId = createDefaultTask(categoryName);
    defaultTask = { id: taskId, status: "pending" };
    logger.info(`Scheduler: default task #${taskId} created for category ${categoryName}.`);
  }

  if (defaultTask.status === "queued" || defaultTask.status === "running") {
    return;
  }

  // 上一次执行后的 done/failed 状态复位，保证兜底任务可以再次执行
  if (defaultTask.status !== "pending") {
    updateTaskStatus(defaultTask.id, "pending", {});
  }

  try {
    enqueueTask(defaultTask.id, { executorId: settings.defaultExecutorId });
    logger.info(`Scheduler: no scheduled tasks today, default task #${defaultTask.id} enqueued.`);
  } catch (error) {
    if (error.statusCode !== 409) {
      logger.error(`Scheduler: enqueue default task #${defaultTask.id} error: ${error.message}`);
    }
  }
}

function tick(logger) {
  const settings = getDefaultPlanSettings();
  if (!settings.autoScheduleEnabled) {
    return;
  }

  try {
    enqueueDueTasks(settings, logger);
    maybeEnqueueDefaultTask(settings, logger);
  } catch (error) {
    logger.error(`Scheduler tick error: ${error.message}`);
  }

  void drainQueue(logger);
}

export function startScheduler(logger) {
  if (timer) {
    return;
  }

  timer = setInterval(() => {
    tick(logger);
  }, TICK_INTERVAL_MS);
  timer.unref?.();
  logger.info("Scheduler started: due tasks are enqueued and drained serially; default task acts as daily fallback.");
}
