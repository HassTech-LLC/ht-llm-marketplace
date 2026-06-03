import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const attachOnly = process.env.HT_STUDIO_ATTACH_ONLY === "1";
const apiPort = process.env.HT_STUDIO_API_PORT || (!attachOnly ? String(await freePort()) : "3001");
const studioPort = process.env.HT_STUDIO_PORT || (!attachOnly ? String(await freePort()) : "3000");
const apiUrl = process.env.HT_STUDIO_API_URL || `http://127.0.0.1:${apiPort}`;
const studioUrl = process.env.HT_STUDIO_URL || `http://127.0.0.1:${studioPort}`;
const children = [];
const childOutput = new Map();

try {
  if (!attachOnly) await startLocalStack();
  await waitFor(`${apiUrl}/health`);
  await waitFor(studioUrl, false);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const consoleErrors = [];
    const failedRequests = [];
    const badResponses = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`));
    page.on("response", (res) => {
      if (res.status() >= 400) badResponses.push(`${res.status()} ${res.url()}`);
    });
    await page.goto(studioUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Marketplace" }).waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "HT Studio" }).click();
    await page.getByRole("heading", { name: "HT Studio" }).waitFor({ timeout: 10_000 });
    await page.getByText(/Runtime health/i).waitFor({ timeout: 15_000 });
    await page.waitForTimeout(750);
    const tabs = (await page.locator(".studio-tabbar button").allTextContents()).map((tab) => tab.trim());
    if (tabs.length !== 2 || tabs[0] !== "Marketplace" || tabs[1] !== "HT Studio") {
      throw new Error(`Unexpected Studio tabs: ${tabs.join(", ")}`);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (overflow) throw new Error("Studio desktop layout has horizontal overflow.");
    if (consoleErrors.length || failedRequests.length || badResponses.length) {
      throw new Error(
        `Studio browser smoke found errors\nconsole=${consoleErrors.join("\n")}\nfailed=${failedRequests.join("\n")}\nresponses=${badResponses.join("\n")}`
      );
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (mobileOverflow) throw new Error("Studio mobile layout has horizontal overflow.");
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
  const api = new URL(apiUrl);
  const studio = new URL(studioUrl);
  children.push(spawnLogged("daemon", process.execPath, ["packages/daemon/dist/index.js"], {
    env: {
      ...process.env,
      HT_MARKETPLACE_PORT: api.port,
      HT_MARKETPLACE_HOST: api.hostname,
      HT_MARKETPLACE_ALLOWED_ORIGINS: studio.origin
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  }));
  const viteBin = path.resolve("node_modules", "vite", "bin", "vite.js");
  children.push(spawnLogged("studio", process.execPath, [viteBin, "--host", studio.hostname, "--port", studio.port, "--strictPort"], {
    cwd: path.resolve("apps", "studio"),
    env: { ...process.env, VITE_HT_MARKETPLACE_API_URL: apiUrl },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  }));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Unable to allocate free port"));
      });
    });
  });
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
