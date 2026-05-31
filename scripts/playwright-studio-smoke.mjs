import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const apiUrl = process.env.HT_STUDIO_API_URL || "http://127.0.0.1:3001";
const studioUrl = process.env.HT_STUDIO_URL || "http://127.0.0.1:3000";
const attachOnly = process.env.HT_STUDIO_ATTACH_ONLY === "1";
const children = [];
const childOutput = new Map();

try {
  if (!attachOnly) await startLocalStack();
  await waitFor(`${apiUrl}/health`);
  await waitFor(studioUrl, false);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await page.goto(studioUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Marketplace" }).waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "HT Studio" }).click();
    await page.getByText("Run a Model").waitFor({ timeout: 10_000 });
    const body = await page.textContent("body");
    if (body?.includes("Documents") || body?.includes("Readiness Dashboard")) {
      throw new Error("Removed Documents/Proof surfaces are still visible.");
    }
  } finally {
    await browser.close();
  }
  console.log("studio smoke ok");
} finally {
  await stopChildren();
}

async function startLocalStack() {
  if (!fs.existsSync("packages/daemon/dist/index.js")) {
    throw new Error("Daemon dist entry is missing. Run npm run build before studio smoke.");
  }
  children.push(spawnLogged("daemon", process.execPath, ["packages/daemon/dist/index.js"], {
    env: { ...process.env, HT_MARKETPLACE_PORT: "3001", HT_MARKETPLACE_HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  }));
  const viteBin = path.resolve("node_modules", "vite", "bin", "vite.js");
  children.push(spawnLogged("studio", process.execPath, [viteBin, "--host", "127.0.0.1", "--port", "3000", "--strictPort"], {
    cwd: path.resolve("apps", "studio"),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  }));
}

async function waitFor(url, json = true) {
  for (let i = 0; i < 80; i += 1) {
    const exited = children.find((child) => child.exitCode !== null);
    if (exited) throw new Error(`Child process exited early with ${exited.exitCode}\n${combinedOutput()}`);
    try {
      const res = await fetch(url);
      if (res.ok) {
        if (json) await res.json();
        return;
      }
    } catch {
      // service is still starting
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}\n${combinedOutput()}`);
}

async function stopChildren() {
  await Promise.all(children.map((child) => stopChild(child)));
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, delay(3000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnLogged(label, command, args, options) {
  const child = spawn(command, args, options);
  childOutput.set(child, `${label}:\n`);
  child.stdout?.on("data", (chunk) => appendOutput(child, chunk));
  child.stderr?.on("data", (chunk) => appendOutput(child, chunk));
  return child;
}

function appendOutput(child, chunk) {
  const current = childOutput.get(child) || "";
  childOutput.set(child, (current + chunk.toString()).slice(-3000));
}

function combinedOutput() {
  return [...childOutput.values()].join("\n");
}
