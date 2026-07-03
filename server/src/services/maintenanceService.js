import { getDatabase } from "./storage/database.js";

export function recoverStaleRunningState() {
  const db = getDatabase();

  const drafts = db.prepare(`
    UPDATE plan_drafts
    SET status = 'failed', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'running'
  `).run();

  const tasks = db.prepare(`
    UPDATE tasks
    SET status = 'failed', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'running'
  `).run();

  const runs = db.prepare(`
    UPDATE task_runs
    SET status = 'failed', finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP)
    WHERE status = 'running'
  `).run();

  return {
    drafts: Number(drafts.changes),
    tasks: Number(tasks.changes),
    runs: Number(runs.changes),
  };
}
