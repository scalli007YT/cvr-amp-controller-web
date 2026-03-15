/**
 * dev-spawn.js — waits for Next.js to be ready, then spawns Electron.
 * Used by the electron:spawn npm script to avoid shell && chaining,
 * which breaks on PowerShell.
 */
const { spawn } = require("child_process");
const waitOn = require("wait-on");

waitOn({ resources: ["http://localhost:3000"], timeout: 60000 })
  .then(() => {
    const electron = require("electron");
    const child = spawn(electron, ["."], {
      stdio: "inherit",
      env: { ...process.env, ELECTRON_DEV: "1" }
    });
    child.on("exit", (code) => process.exit(code ?? 0));
  })
  .catch((err) => {
    console.error("wait-on failed:", err.message);
    process.exit(1);
  });
