import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const suppliedBase = process.env.HT_MARKETPLACE_SCORECARD_URL;
const port = Number(process.env.HT_SCORECARD_GATE_PORT || 55932);
const base = suppliedBase || `http://127.0.0.1:${port}`;
let child;
const stderr = [];

if (!suppliedBase) {
  child = spawn(process.execPath, ["packages/daemon/dist/index.js"], {
    env: {
      ...process.env,
      HT_MARKETPLACE_PORT: String(port),
      HT_MARKETPLACE_HOME: process.env.HT_SCORECARD_GATE_HOME || path.join(os.tmpdir(), "htlm-scorecard-gate")
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.stderr.on("data", (chunk) => stderr.push(chunk.toString()));
}

try {
  if (child) await waitForHealth();
  const res = await fetch(`${base}/api/compatibility/scorecard`);
  if (!res.ok) throw new Error(`scorecard request failed with ${res.status}`);
  const scorecard = await res.json();
  const allowedClaims = new Set(["foundation", "candidate", "best-replacement"]);
  if (!allowedClaims.has(scorecard.claim)) throw new Error(`Unknown scorecard claim: ${scorecard.claim}`);
  if (!Array.isArray(scorecard.evidence) || scorecard.evidence.length === 0) {
    throw new Error("scorecard must include evidence entries");
  }
  if (!Array.isArray(scorecard.gates) || scorecard.gates.length === 0) {
    throw new Error("scorecard must include gate entries");
  }
  if (scorecard.claim === "best-replacement") {
    const incomplete = scorecard.gates.filter((gate) => gate.status !== "pass");
    if (incomplete.length) throw new Error(`best-replacement claim blocked by: ${incomplete.map((gate) => gate.id).join(", ")}`);
  }
  console.log(`scorecard claim ok: ${scorecard.claim}`);
} finally {
  child?.kill("SIGTERM");
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
