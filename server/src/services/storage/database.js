import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { storageRoot } from "../../config.js";

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
    ["blog_repo_path", "E:\\idea_space\\blog"],
    ["blog_branch", "main"],
    ["docs_dir", "_docs"],
    ["auto_push", "true"],
    ["default_plan_enabled", "true"],
    ["default_executor_id", "codex-default"],
    ["auto_schedule_enabled", "false"],
  ].forEach(([key, value]) => insertSetting.run({ key, value }));
}

function seedExecutors(db) {
  const insertExecutor = db.prepare(`
    INSERT INTO executors (
      id, type, name, command, args_template, working_directory, timeout_ms, enabled
    ) VALUES (
      @id, @type, @name, @command, @argsTemplate, @workingDirectory, @timeoutMs, @enabled
    )
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      name = excluded.name,
      command = excluded.command,
      args_template = excluded.args_template,
      working_directory = excluded.working_directory,
      timeout_ms = excluded.timeout_ms,
      enabled = excluded.enabled,
      updated_at = CURRENT_TIMESTAMP
  `);

  insertExecutor.run({
    id: "codex-default",
    type: "codex",
    name: "Codex Default",
    command: "F:\\globNodeLib\\codex.cmd",
    argsTemplate: JSON.stringify([
      "exec",
      "-s",
      "workspace-write",
      "--add-dir",
      "E:\\idea_space\\blog_tool",
      "-",
    ]),
    workingDirectory: "E:\\idea_space\\blog",
    timeoutMs: 900000,
    enabled: 1,
  });

  insertExecutor.run({
    id: "claude-default",
    type: "claude-code",
    name: "Claude Code Default",
    command: "C:\\Users\\lmz\\.bun\\bin\\claude.exe",
    argsTemplate: JSON.stringify(["-p", "{promptContent}"]),
    workingDirectory: "E:\\idea_space\\blog",
    timeoutMs: 900000,
    enabled: 1,
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
