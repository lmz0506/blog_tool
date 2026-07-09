import { getDatabase } from "./storage/database.js";

export function recoverStaleRunningState() {
  const db = getDatabase();

  const drafts = db.prepare(`
    UPDATE plan_drafts
    SET status = 'failed', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'running'
  `).run();

  // 程序中断时执行中的任务回到队列，重启后由队列消费者继续执行
  const tasks = db.prepare(`
    UPDATE tasks
    SET status = 'queued', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'running'
  `).run();

  const runs = db.prepare(`
    UPDATE task_runs
    SET status = 'failed', finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP)
    WHERE status = 'running'
  `).run();

  return {
    drafts: Number(drafts.changes),
    requeuedTasks: Number(tasks.changes),
    runs: Number(runs.changes),
  };
}
