import { getDatabase } from "./storage/database.js";
import { defaultRepositoryPath } from "../config.js";

export function getSetting(key) {
  const row = getDatabase().prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row?.value ?? null;
}

export function setSetting(key, value) {
  getDatabase()
    .prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `)
    .run(key, value);
}

export function getRepositorySettings() {
  return {
    path: getSetting("blog_repo_path") ?? defaultRepositoryPath,
    branch: getSetting("blog_branch") || "main",
    docsDir: getSetting("docs_dir") || "_docs",
    autoPush: (getSetting("auto_push") || "true") === "true",
  };
}

export function updateRepositorySettings(input) {
  if (typeof input.path === "string") {
    setSetting("blog_repo_path", input.path);
  }
  if (typeof input.branch === "string") {
    setSetting("blog_branch", input.branch);
  }
  if (typeof input.docsDir === "string") {
    setSetting("docs_dir", input.docsDir);
  }
  if (typeof input.autoPush === "boolean") {
    setSetting("auto_push", String(input.autoPush));
  }

  return getRepositorySettings();
}

export function getDefaultPlanSettings() {
  return {
    enabled: (getSetting("default_plan_enabled") || "true") === "true",
    defaultExecutorId: getSetting("default_executor_id") || "codex-default",
    autoScheduleEnabled: (getSetting("auto_schedule_enabled") || "false") === "true",
  };
}

export function updateDefaultPlanSettings(input) {
  if (typeof input.enabled === "boolean") {
    setSetting("default_plan_enabled", String(input.enabled));
  }
  if (typeof input.defaultExecutorId === "string") {
    setSetting("default_executor_id", input.defaultExecutorId);
  }
  if (typeof input.autoScheduleEnabled === "boolean") {
    setSetting("auto_schedule_enabled", String(input.autoScheduleEnabled));
  }

  return getDefaultPlanSettings();
}
