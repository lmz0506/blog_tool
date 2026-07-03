import { spawn } from "node:child_process";

import { getDatabase } from "./storage/database.js";

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

function spawnExecutorProcess(executor, args, promptContent) {
  const commandPath = executor.command.toLowerCase();

  if (process.platform === "win32" && (commandPath.endsWith(".cmd") || commandPath.endsWith(".bat"))) {
    const child = spawn(executor.command, args, {
      cwd: executor.workingDirectory,
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });
    child.stdin.write(promptContent);
    child.stdin.end();
    return child;
  }

  if (process.platform === "win32" && commandPath.endsWith(".ps1")) {
    const child = spawn(
      "powershell.exe",
      ["-ExecutionPolicy", "Bypass", "-File", executor.command, ...args],
      {
        cwd: executor.workingDirectory,
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      },
    );
    child.stdin.write(promptContent);
    child.stdin.end();
    return child;
  }

  const child = spawn(executor.command, args, {
    cwd: executor.workingDirectory,
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
  });
  child.stdin.write(promptContent);
  child.stdin.end();
  return child;
}

function normalizeExecutionError(error, executor) {
  if (error?.code === "ENOENT") {
    return `Command not found: ${executor.command}.`;
  }

  return error?.message || "Executor process failed.";
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
      processError = new Error(`Executor timed out after ${executor.timeoutMs}ms.`);
      child.kill("SIGTERM");
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
    throw new Error(`Executor not found: ${executorId}`);
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
        throw new Error("argsTemplate must be a valid JSON array.");
      }
    }
    if (!Array.isArray(argsTemplate) || argsTemplate.some((value) => typeof value !== "string")) {
      throw new Error("argsTemplate must be an array of strings.");
    }
  }

  let timeoutMs = current.timeoutMs;
  if (input.timeoutMs !== undefined) {
    timeoutMs = Number(input.timeoutMs);
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
      throw new Error("timeoutMs must be a number no less than 1000.");
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
    categoryName: metadata.categoryName,
  };
  const args = executor.argsTemplate.map((value) => replaceTemplate(value, context));
  const { exitCode, stdoutText, stderrText } = await captureExecution(executor, args, promptContent);

  const resultPayload = extractJsonObject(stdoutText);
  const resultText = resultPayload ? JSON.stringify(resultPayload, null, 2) : null;
  const status = exitCode === 0 && resultPayload?.marker === "BLOG_TOOL_TASK_DONE" ? "success" : "failed";

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
