import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  defaultClaudeCommand,
  defaultCodexCommand,
  defaultRepositoryPath,
  isDesktopRuntime,
  storageRoot,
} from "../../config.js";

const databaseFile = path.join(storageRoot, "blog-tool.db");

let database;

function ensureDirectories() {
  mkdirSync(storageRoot, { recursive: true });
}

function seedSettings(db) {
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value)
    VALUES (@key, @value)
  `);

  [
    ["blog_repo_path", defaultRepositoryPath],
    ["blog_branch", "main"],
    ["docs_dir", "_docs"],
    ["auto_push", "true"],
    ["default_plan_enabled", "true"],
    ["default_executor_id", "codex-default"],
    ["auto_schedule_enabled", "false"],
  ].forEach(([key, value]) => insertSetting.run({ key, value }));
}

function seedExecutors(db) {
  // 只在首次初始化时插入种子执行器，避免覆盖用户修改过的配置
  const insertExecutor = db.prepare(`
    INSERT OR IGNORE INTO executors (
      id, type, name, command, args_template, working_directory, timeout_ms, enabled
    ) VALUES (
      @id, @type, @name, @command, @argsTemplate, @workingDirectory, @timeoutMs, @enabled
    )
  `);

  insertExecutor.run({
    id: "codex-default",
    type: "codex",
    name: "Codex Default",
    command: defaultCodexCommand,
    argsTemplate: JSON.stringify([
      "exec",
      "-s",
      "workspace-write",
      "--add-dir",
      "{runDirectory}",
      "-",
    ]),
    workingDirectory: defaultRepositoryPath,
    timeoutMs: 1800000,
    enabled: isDesktopRuntime ? 0 : 1,
  });

  insertExecutor.run({
    id: "claude-default",
    type: "claude-code",
    name: "Claude Code Default",
    command: defaultClaudeCommand,
    argsTemplate: JSON.stringify(["-p", "{promptContent}"]),
    workingDirectory: defaultRepositoryPath,
    timeoutMs: 1800000,
    enabled: isDesktopRuntime ? 0 : 1,
  });
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS executors (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      args_template TEXT NOT NULL,
      working_directory TEXT NOT NULL,
      timeout_ms INTEGER NOT NULL DEFAULT 900000,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL DEFAULT 'blog_scan',
      enabled INTEGER NOT NULL DEFAULT 1,
      is_default_pool INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL,
      title TEXT NOT NULL,
      file_path TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS plan_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'agent_generated',
      status TEXT NOT NULL DEFAULT 'draft',
      goal TEXT,
      executor_id TEXT NOT NULL,
      prompt_text TEXT,
      result_text TEXT,
      stdout_text TEXT,
      stderr_text TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS draft_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      draft_id INTEGER NOT NULL,
      category_name TEXT NOT NULL,
      title TEXT NOT NULL,
      content_brief TEXT DEFAULT '',
      order_no INTEGER NOT NULL,
      scheduled_date TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (draft_id) REFERENCES plan_drafts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL,
      title TEXT NOT NULL,
      task_type TEXT NOT NULL DEFAULT 'planned',
      status TEXT NOT NULL DEFAULT 'pending',
      scheduled_date TEXT,
      executor_id TEXT,
      article_path TEXT,
      article_title TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS task_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      source_draft_item_id INTEGER,
      title TEXT NOT NULL,
      content_brief TEXT DEFAULT '',
      order_no INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      draft_id INTEGER,
      category_name TEXT NOT NULL,
      executor_id TEXT NOT NULL,
      run_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      prompt_text TEXT,
      result_text TEXT,
      stdout_text TEXT,
      stderr_text TEXT,
      agent_marker TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function getTableColumns(db, tableName) {
  return new Set(
    db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all()
      .map((column) => column.name),
  );
}

function ensureColumn(db, tableName, definition) {
  const columnName = definition.trim().split(/\s+/)[0];
  if (getTableColumns(db, tableName).has(columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
}

function readTextFile(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return null;
  }

  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function backfillTaskRunTexts(db) {
  const columns = getTableColumns(db, "task_runs");
  const hasLegacyPaths =
    columns.has("prompt_path") &&
    columns.has("result_path") &&
    columns.has("stdout_path") &&
    columns.has("stderr_path");

  if (!hasLegacyPaths) {
    return;
  }

  const rows = db.prepare(`
    SELECT
      id,
      prompt_path,
      result_path,
      stdout_path,
      stderr_path,
      prompt_text,
      result_text,
      stdout_text,
      stderr_text
    FROM task_runs
  `).all();

  const update = db.prepare(`
    UPDATE task_runs
    SET prompt_text = COALESCE(@promptText, prompt_text),
        result_text = COALESCE(@resultText, result_text),
        stdout_text = COALESCE(@stdoutText, stdout_text),
        stderr_text = COALESCE(@stderrText, stderr_text)
    WHERE id = @id
  `);

  rows.forEach((row) => {
    const promptText = row.prompt_text ?? readTextFile(row.prompt_path);
    const resultText = row.result_text ?? readTextFile(row.result_path);
    const stdoutText = row.stdout_text ?? readTextFile(row.stdout_path);
    const stderrText = row.stderr_text ?? readTextFile(row.stderr_path);

    if (
      promptText === row.prompt_text &&
      resultText === row.result_text &&
      stdoutText === row.stdout_text &&
      stderrText === row.stderr_text
    ) {
      return;
    }

    update.run({
      id: row.id,
      promptText,
      resultText,
      stdoutText,
      stderrText,
    });
  });
}

function backfillDraftTexts(db) {
  const runColumns = getTableColumns(db, "task_runs");
  const draftColumns = getTableColumns(db, "plan_drafts");

  if (
    !runColumns.has("draft_id") ||
    !runColumns.has("prompt_text") ||
    !runColumns.has("result_text") ||
    !runColumns.has("stdout_text") ||
    !runColumns.has("stderr_text") ||
    !draftColumns.has("prompt_text") ||
    !draftColumns.has("result_text") ||
    !draftColumns.has("stdout_text") ||
    !draftColumns.has("stderr_text")
  ) {
    return;
  }

  const drafts = db.prepare(`
    SELECT id, prompt_text, result_text, stdout_text, stderr_text
    FROM plan_drafts
  `).all();

  const findRun = db.prepare(`
    SELECT prompt_text, result_text, stdout_text, stderr_text
    FROM task_runs
    WHERE draft_id = ?
    ORDER BY id DESC
    LIMIT 1
  `);

  const update = db.prepare(`
    UPDATE plan_drafts
    SET prompt_text = COALESCE(@promptText, prompt_text),
        result_text = COALESCE(@resultText, result_text),
        stdout_text = COALESCE(@stdoutText, stdout_text),
        stderr_text = COALESCE(@stderrText, stderr_text),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);

  drafts.forEach((draft) => {
    if (draft.prompt_text && draft.result_text && draft.stdout_text && draft.stderr_text) {
      return;
    }

    const run = findRun.get(draft.id);
    if (!run) {
      return;
    }

    update.run({
      id: draft.id,
      promptText: draft.prompt_text ?? run.prompt_text ?? null,
      resultText: draft.result_text ?? run.result_text ?? null,
      stdoutText: draft.stdout_text ?? run.stdout_text ?? null,
      stderrText: draft.stderr_text ?? run.stderr_text ?? null,
    });
  });
}

function migrateExecutorToolRoot(db) {
  // 历史数据中写死的工具目录改为 {toolRoot} 占位符，运行时自动解析
  const rows = db.prepare("SELECT id, args_template FROM executors").all();
  const update = db.prepare(`
    UPDATE executors
    SET args_template = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  rows.forEach((row) => {
    let args;
    try {
      args = JSON.parse(row.args_template);
    } catch {
      return;
    }

    if (!Array.isArray(args)) {
      return;
    }

    const next = args.map((arg) =>
      typeof arg === "string" && /idea_space[\\/]+blog_tool\s*$/i.test(arg) ? "{toolRoot}" : arg,
    );

    if (JSON.stringify(next) !== JSON.stringify(args)) {
      update.run(JSON.stringify(next), row.id);
    }
  });
}

function migrateCategoriesDefaultPool(db) {
  // 一次性迁移：所有分类默认加入默认任务池（之后用户仍可单独取消）
  const marker = db
    .prepare("SELECT value FROM settings WHERE key = 'migration_default_pool_all'")
    .get();

  if (marker) {
    return;
  }

  db.exec("UPDATE categories SET is_default_pool = 1, updated_at = CURRENT_TIMESTAMP");
  db.prepare("INSERT INTO settings (key, value) VALUES ('migration_default_pool_all', 'done')").run();
}

function migrateExecutorTimeout(db) {
  // 一次性迁移：写一篇文章实测可能超过 15 分钟，默认超时提高到 30 分钟
  const marker = db
    .prepare("SELECT value FROM settings WHERE key = 'migration_executor_timeout_30m'")
    .get();

  if (marker) {
    return;
  }

  db.exec("UPDATE executors SET timeout_ms = 1800000, updated_at = CURRENT_TIMESTAMP WHERE timeout_ms = 900000");
  db.prepare("INSERT INTO settings (key, value) VALUES ('migration_executor_timeout_30m', 'done')").run();
}

function migrateCodexExecutorRunDirectoryAccess(db) {
  // 安装版里 codex 仅追加了 {toolRoot}，在部分环境下不足以让 Agent 对博客仓库目录获得稳定写权限。
  // 对使用 workspace-write 的 codex 执行器自动补上 --add-dir {runDirectory}。
  const rows = db.prepare("SELECT id, type, args_template FROM executors").all();
  const update = db.prepare(`
    UPDATE executors
    SET args_template = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  rows.forEach((row) => {
    if (row.type !== "codex") {
      return;
    }

    let args;
    try {
      args = JSON.parse(row.args_template);
    } catch {
      return;
    }

    if (!Array.isArray(args) || !args.includes("workspace-write") || args.includes("{runDirectory}")) {
      return;
    }

    const toolRootIndex = args.findIndex((value, index) => value === "--add-dir" && args[index + 1] === "{toolRoot}");
    const next = [...args];

    if (toolRootIndex >= 0) {
      next.splice(toolRootIndex, 0, "--add-dir", "{runDirectory}");
    } else {
      const stdinIndex = next.lastIndexOf("-");
      const insertAt = stdinIndex >= 0 ? stdinIndex : next.length;
      next.splice(insertAt, 0, "--add-dir", "{runDirectory}");
    }

    if (JSON.stringify(next) !== JSON.stringify(args)) {
      update.run(JSON.stringify(next), row.id);
    }
  });
}

function migrateCodexExecutorRemoveToolRootAccess(db) {
  // 工具安装目录会在每次升级时被卸载重装：其上已登记的 codex 沙箱 ACL 授权随之丢失，且新目录
  // 属主为 Administrators，由本工具后台静默拉起的 codex 无法重新授权，导致 Windows 沙箱
  // 初始化整体失败（setup refresh had errors）、Agent 对所有目录（含博客仓库）的写入被拒。
  // Prompt 已走 stdin、结果已走 stdout，Agent 不需要工具目录的写权限，移除 --add-dir {toolRoot}。
  const rows = db.prepare("SELECT id, type, args_template FROM executors").all();
  const update = db.prepare(`
    UPDATE executors
    SET args_template = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  rows.forEach((row) => {
    if (row.type !== "codex") {
      return;
    }

    let args;
    try {
      args = JSON.parse(row.args_template);
    } catch {
      return;
    }

    if (!Array.isArray(args)) {
      return;
    }

    const next = [...args];
    let index = next.findIndex((value, i) => value === "--add-dir" && next[i + 1] === "{toolRoot}");
    while (index >= 0) {
      next.splice(index, 2);
      index = next.findIndex((value, i) => value === "--add-dir" && next[i + 1] === "{toolRoot}");
    }

    if (JSON.stringify(next) !== JSON.stringify(args)) {
      update.run(JSON.stringify(next), row.id);
    }
  });
}

function migrateSchema(db) {
  [
    ["task_runs", "prompt_text TEXT"],
    ["task_runs", "result_text TEXT"],
    ["task_runs", "stdout_text TEXT"],
    ["task_runs", "stderr_text TEXT"],
    ["plan_drafts", "prompt_text TEXT"],
    ["plan_drafts", "result_text TEXT"],
    ["plan_drafts", "stdout_text TEXT"],
    ["plan_drafts", "stderr_text TEXT"],
    ["tasks", "publish_result TEXT"],
    ["categories", "display_name TEXT"],
  ].forEach(([tableName, definition]) => ensureColumn(db, tableName, definition));

  backfillTaskRunTexts(db);
  backfillDraftTexts(db);
  migrateExecutorToolRoot(db);
  migrateCodexExecutorRunDirectoryAccess(db);
  migrateCodexExecutorRemoveToolRootAccess(db);
  migrateCategoriesDefaultPool(db);
  migrateExecutorTimeout(db);
}

export async function initializeDatabase() {
  ensureDirectories();

  if (!database) {
    database = new DatabaseSync(databaseFile);
    database.exec("PRAGMA journal_mode = WAL;");
    createSchema(database);
    migrateSchema(database);
    seedSettings(database);
    seedExecutors(database);
  }

  return database;
}

export function getDatabase() {
  if (!database) {
    throw new Error("Database has not been initialized.");
  }

  return database;
}
