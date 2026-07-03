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

const server = startProcess("server", "34", "npm run dev --workspace server");
const web = startProcess("web", "35", "npm run dev --workspace web");

function shutdown() {
  server.kill();
  web.kill();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
