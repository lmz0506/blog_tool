import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";

function startProcess(name, color, command) {
  const child = isWindows
    ? spawn("cmd.exe", ["/d", "/s", "/c", command], {
        stdio: ["inherit", "pipe", "pipe"],
        shell: false,
      })
    : spawn("sh", ["-lc", command], {
        stdio: ["inherit", "pipe", "pipe"],
        shell: false,
      });

  const prefix = `\u001b[${color}m[${name}]\u001b[0m`;

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`${prefix} ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`${prefix} ${chunk}`);
  });

  child.on("exit", (code) => {
    process.stdout.write(`${prefix} exited with code ${code}\n`);
  });

  return child;
}

// server 不用 --watch：任务执行动辄数分钟，watch 模式下代码变动/进程异常会自动重启，
// 直接杀死执行中的 Agent 子进程。需要热重载调试 server 时单独用 npm run dev:server。
const server = startProcess("server", "34", "npm run start --workspace server");
const web = startProcess("web", "35", "npm run dev --workspace web");

function shutdown() {
  server.kill();
  web.kill();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
