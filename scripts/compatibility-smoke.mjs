import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { runCompatibilityCases } from "./compatibility-cases.mjs";

const port = Number(process.env.HT_COMPATIBILITY_SMOKE_PORT || 55931);
const base = `http://127.0.0.1:${port}`;
const smokeHome = process.env.HT_COMPATIBILITY_SMOKE_HOME || path.join(os.tmpdir(), "htlm-compat-smoke");
const child = spawn(process.execPath, ["packages/daemon/dist/index.js"], {
  env: {
    ...process.env,
    HT_MARKETPLACE_PORT: String(port),
    HT_MARKETPLACE_HOME: smokeHome
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

const stderr = [];
child.stderr.on("data", (chunk) => stderr.push(chunk.toString()));

try {
  await waitForHealth();
  const checks = await runCompatibilityCases(base);
  const failed = checks.filter((check) => !check.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, checks }, null, 2));
  if (failed.length) process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
}

async function waitForHealth() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return;
    } catch {
      // daemon may still be starting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`daemon did not become healthy on ${base}; stderr: ${stderr.join("").slice(-1000)}`);
}
