import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import { projectRoot } from "../config.js";
import { getDatabase } from "./storage/database.js";

const execFileAsync = promisify(execFile);

const CANDIDATE_COMMANDS = ["codex", "claude", "gemini", "qwen", "aider", "cursor-agent"];

export async function discoverExecutorCommands() {
  const finder = process.platform === "win32" ? "where" : "which";
  const results = [];
  const seen = new Set();

  for (const name of CANDIDATE_COMMANDS) {
    try {
      const args = process.platform === "win32" ? [name] : ["-a", name];
      const { stdout } = await execFileAsync(finder, args, { windowsHide: true });
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          const key = line.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            results.push({ name, command: line });
          }
        });
    } catch {
      // 未找到该命令，跳过
    }
  }

  return results;
}

function mapExecutor(row) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    command: row.command,
    argsTemplate: JSON.parse(row.args_template),
    workingDirectory: row.working_directory,
    timeoutMs: row.timeout_ms,
    enabled: Boolean(row.enabled),
  };
}

function replaceTemplate(value, context) {
  return value.replace(/\{(\w+)\}/g, (_match, key) => context[key] ?? "");
}

function extractJsonObject(text) {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch {
      // ignore fenced block parse failures
    }
  }

  const matches = text.match(/\{[\s\S]*\}/g);
  if (!matches) {
    return null;
  }

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(matches[index]);
    } catch {
      // ignore non-JSON matches
    }
  }

  return null;
}

function writePromptToStdin(child, promptContent) {
  // stdin 管道断开（子进程提前退出）时若无 error 监听会抛未捕获异常
  child.stdin.on("error", () => {});
  child.stdin.write(promptContent);
  child.stdin.end();
}

function spawnOptions(executor) {
  return {
    cwd: executor.workingDirectory,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      // 尽量让 Agent 及其子进程以 UTF-8 处理输入输出，减少中文乱码
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
      LANG: "zh_CN.UTF-8",
      LC_ALL: "zh_CN.UTF-8",
    },
  };
}

function spawnExecutorProcess(executor, args, promptContent) {
  const commandPath = executor.command.toLowerCase();

  if (process.platform === "win32" && (commandPath.endsWith(".cmd") || commandPath.endsWith(".bat"))) {
    const child = spawn(executor.command, args, {
      ...spawnOptions(executor),
      shell: true,
    });
    writePromptToStdin(child, promptContent);
    return child;
  }

  if (process.platform === "win32" && commandPath.endsWith(".ps1")) {
    const child = spawn(
      "powershell.exe",
      ["-ExecutionPolicy", "Bypass", "-File", executor.command, ...args],
      {
        ...spawnOptions(executor),
        shell: false,
      },
    );
    writePromptToStdin(child, promptContent);
    return child;
  }

  const child = spawn(executor.command, args, {
    ...spawnOptions(executor),
    shell: false,
  });
  writePromptToStdin(child, promptContent);
  return child;
}

function normalizeExecutionError(error, executor) {
  if (error?.code === "ENOENT") {
    return `命令不存在：${executor.command}`;
  }

  return error?.message || "执行器进程执行失败。";
}

function killProcessTree(child) {
  // Windows 下 .cmd 经 shell 启动会派生子进程树，只杀父进程会残留孙进程继续运行，
  // 用 taskkill /T 整树终止
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    return;
  }

  child.kill("SIGTERM");
}

async function captureExecution(executor, args, promptContent) {
  const stdoutChunks = [];
  const stderrChunks = [];
  let processError = null;

  const exitCode = await new Promise((resolve) => {
    let child;

    try {
      child = spawnExecutorProcess(executor, args, promptContent);
    } catch (error) {
      processError = error;
      resolve(-1);
      return;
    }

    const timer = setTimeout(() => {
      processError = new Error(`执行器超时（${executor.timeoutMs} 毫秒），已终止进程。`);
      killProcessTree(child);
    }, executor.timeoutMs);

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
    child.on("error", (error) => {
      processError = error;
      clearTimeout(timer);
      resolve(-1);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? -1);
    });
  });

  const stdoutText = Buffer.concat(stdoutChunks).toString("utf8");
  let stderrText = Buffer.concat(stderrChunks).toString("utf8");

  if (processError) {
    const errorText = normalizeExecutionError(processError, executor);
    stderrText = stderrText ? `${stderrText}\n${errorText}` : errorText;
  }

  return {
    exitCode,
    stdoutText,
    stderrText,
    processError,
  };
}

export function listExecutors() {
  const rows = getDatabase()
    .prepare("SELECT * FROM executors ORDER BY created_at ASC")
    .all();
  return rows.map(mapExecutor);
}

export function getExecutor(executorId) {
  const row = getDatabase().prepare("SELECT * FROM executors WHERE id = ?").get(executorId);
  if (!row) {
    throw new Error(`执行器不存在：${executorId}`);
  }
  return mapExecutor(row);
}

export function updateExecutor(executorId, input) {
  const current = getExecutor(executorId);

  let argsTemplate = current.argsTemplate;
  if (input.argsTemplate !== undefined) {
    argsTemplate = input.argsTemplate;
    if (typeof argsTemplate === "string") {
      try {
        argsTemplate = JSON.parse(argsTemplate);
      } catch {
        throw new Error("参数模板必须是合法的 JSON 数组。");
      }
    }
    if (!Array.isArray(argsTemplate) || argsTemplate.some((value) => typeof value !== "string")) {
      throw new Error("参数模板必须是字符串数组。");
    }
  }

  let timeoutMs = current.timeoutMs;
  if (input.timeoutMs !== undefined) {
    timeoutMs = Number(input.timeoutMs);
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
      throw new Error("超时时间必须是不小于 1000 的数字（毫秒）。");
    }
  }

  const next = {
    ...current,
    ...input,
    name: String(input.name ?? current.name).trim() || current.name,
    command: String(input.command ?? current.command).trim() || current.command,
    enabled: input.enabled ?? current.enabled,
    argsTemplate,
    timeoutMs,
  };

  getDatabase()
    .prepare(`
      UPDATE executors
      SET type = @type,
          name = @name,
          command = @command,
          args_template = @argsTemplate,
          working_directory = @workingDirectory,
          timeout_ms = @timeoutMs,
          enabled = @enabled,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `)
    .run({
      id: executorId,
      type: next.type,
      name: next.name,
      command: next.command,
      argsTemplate: JSON.stringify(next.argsTemplate),
      workingDirectory: next.workingDirectory,
      timeoutMs: next.timeoutMs,
      enabled: next.enabled ? 1 : 0,
    });

  return getExecutor(executorId);
}

export async function testExecutor({ executorId, promptContent }) {
  const executor = getExecutor(executorId);
  const context = {
    promptFile: "",
    promptContent,
    runDirectory: executor.workingDirectory,
    toolRoot: projectRoot,
    categoryName: "executor-test",
  };

  const args = executor.argsTemplate.map((value) => replaceTemplate(value, context));
  const { exitCode, stdoutText, stderrText } = await captureExecution(executor, args, promptContent);

  return {
    executorId,
    command: executor.command,
    args,
    exitCode,
    success: exitCode === 0,
    promptText: promptContent,
    stdoutText,
    stderrText,
  };
}

export async function runExecutor({ executorId, promptContent, runType, metadata }) {
  const executor = getExecutor(executorId);
  const db = getDatabase();
  const insertRun = db.prepare(`
    INSERT INTO task_runs (
      task_id, draft_id, category_name, executor_id, run_type,
      status, prompt_text, started_at
    ) VALUES (
      @taskId, @draftId, @categoryName, @executorId, @runType,
      'running', @promptText, @startedAt
    )
  `);

  const startedAt = new Date().toISOString();
  const runInfo = insertRun.run({
    taskId: metadata.taskId || null,
    draftId: metadata.draftId || null,
    categoryName: metadata.categoryName,
    executorId,
    runType,
    promptText: promptContent,
    startedAt,
  });

  const runId = Number(runInfo.lastInsertRowid);
  const context = {
    promptFile: "",
    promptContent,
    runDirectory: executor.workingDirectory,
    toolRoot: projectRoot,
    categoryName: metadata.categoryName,
  };
  const args = executor.argsTemplate.map((value) => replaceTemplate(value, context));
  const { exitCode, stdoutText, stderrText } = await captureExecution(executor, args, promptContent);

  const resultPayload = extractJsonObject(stdoutText);
  const resultText = resultPayload ? JSON.stringify(resultPayload, null, 2) : null;
  // 以完成标记为准：Agent 可能在打印完结果后才被超时终止（退出码非 0），
  // 此时产出已经完成，后续的文章校验环节会兜底验证文件真实性
  const status = resultPayload?.marker === "BLOG_TOOL_TASK_DONE" ? "success" : "failed";

  db.prepare(`
    UPDATE task_runs
    SET status = @status,
        result_text = @resultText,
        stdout_text = @stdoutText,
        stderr_text = @stderrText,
        finished_at = @finishedAt,
        agent_marker = @agentMarker
    WHERE id = @id
  `).run({
    id: runId,
    status,
    resultText,
    stdoutText,
    stderrText,
    finishedAt: new Date().toISOString(),
    agentMarker: resultPayload?.marker || null,
  });

  return {
    runId,
    exitCode,
    status,
    promptText: promptContent,
    resultText,
    stdoutText,
    stderrText,
    resultPayload,
  };
}
