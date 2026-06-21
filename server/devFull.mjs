import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const viteBin = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");

const children = [
  spawn(process.execPath, [path.join(rootDir, "server", "timeServer.mjs")], {
    cwd: rootDir,
    stdio: "inherit"
  }),
  spawn(process.execPath, [viteBin, "--host", "127.0.0.1"], {
    cwd: rootDir,
    stdio: "inherit"
  })
];

function stopAll(signal) {
  children.forEach((child) => {
    if (!child.killed) child.kill(signal);
  });
}

process.on("SIGINT", () => {
  stopAll("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopAll("SIGTERM");
  process.exit(0);
});

children.forEach((child) => {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      stopAll("SIGTERM");
      process.exit(code);
    }
  });
});
