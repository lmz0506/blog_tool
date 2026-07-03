import { getDatabase } from "./storage/database.js";
import { getDefaultPlanSettings } from "./settingsService.js";
import { executeTask } from "./taskRunnerService.js";

const TICK_INTERVAL_MS = 60_000;

let timer = null;
let busy = false;

function todayText() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function findDueTask() {
  return getDatabase()
    .prepare(`
      SELECT id, title, category_name
      FROM tasks
      WHERE status = 'pending'
        AND scheduled_date IS NOT NULL
        AND scheduled_date <= ?
      ORDER BY scheduled_date ASC, id ASC
      LIMIT 1
    `)
    .get(todayText());
}

async function tick(logger) {
  if (busy) {
    return;
  }

  const settings = getDefaultPlanSettings();
  if (!settings.autoScheduleEnabled) {
    return;
  }

  const dueTask = findDueTask();
  if (!dueTask) {
    return;
  }

  busy = true;
  try {
    logger.info(`Scheduler: executing due task #${dueTask.id} (${dueTask.title})`);
    const result = await executeTask(Number(dueTask.id), {
      executorId: settings.defaultExecutorId,
    });
    if (result.ok) {
      logger.info(`Scheduler: task #${dueTask.id} done, article ${result.task.articlePath}`);
    } else {
      logger.warn(`Scheduler: task #${dueTask.id} failed: ${result.message}`);
    }
  } catch (error) {
    logger.error(`Scheduler: task #${dueTask.id} error: ${error.message}`);
  } finally {
    busy = false;
  }
}

export function startScheduler(logger) {
  if (timer) {
    return;
  }

  timer = setInterval(() => {
    void tick(logger);
  }, TICK_INTERVAL_MS);
  timer.unref?.();
  logger.info("Scheduler started: due pending tasks run automatically when enabled.");
}
