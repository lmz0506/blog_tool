import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultProjectRoot = path.resolve(__dirname, "..", "..");
const devRepositoryPath = "E:\\idea_space\\blog";

function resolvePath(envKey, fallbackPath) {
  const value = process.env[envKey];
  return value ? path.resolve(value) : fallbackPath;
}

export const runtimeMode = process.env.BLOG_TOOL_RUNTIME === "desktop" ? "desktop" : "dev";
export const isDesktopRuntime = runtimeMode === "desktop";
export const projectRoot = resolvePath("BLOG_TOOL_PROJECT_ROOT", defaultProjectRoot);
export const storageRoot = resolvePath("BLOG_TOOL_STORAGE_ROOT", path.join(projectRoot, "storage"));
export const toolRoot = resolvePath("BLOG_TOOL_TOOL_ROOT", projectRoot);
export const defaultRepositoryPath = process.env.BLOG_TOOL_DEFAULT_REPO_PATH ?? (isDesktopRuntime ? "" : devRepositoryPath);
export const defaultCodexCommand =
  process.env.BLOG_TOOL_DEFAULT_CODEX_COMMAND ?? (isDesktopRuntime ? "" : "F:\\globNodeLib\\codex.cmd");
export const defaultClaudeCommand =
  process.env.BLOG_TOOL_DEFAULT_CLAUDE_COMMAND ?? (isDesktopRuntime ? "" : "C:\\Users\\lmz\\.bun\\bin\\claude.exe");
