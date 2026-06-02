import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const attachOnly = process.env.HT_STUDIO_ATTACH_ONLY === "1";
const writeDocAssets = process.argv.includes("--docs-assets") || process.env.HT_WRITE_DOC_ASSETS === "1";
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
      const url = res.url();
      const status = res.status();
      if (status >= 500 || (status >= 400 && url.startsWith(studioUrl))) badResponses.push(`${status} ${url}`);
    });

    await page.goto(studioUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Marketplace" }).waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "Search" }).waitFor({ timeout: 10_000 });
    await page.locator(".ht-recommendation-panel").waitFor({ timeout: 25_000 });
    await page.locator(".ht-catalog-item-compact").first().waitFor({ timeout: 25_000 });
    await page.locator(".ht-catalog-item-compact").first().click();
    await page.locator(".ht-model-detail-pane").getByText("Source facts").waitFor({ timeout: 15_000 });
    await page.locator(".ht-model-detail-pane").getByText("License signal").waitFor({ timeout: 15_000 });
    await page.locator(".ht-model-detail-pane").getByText("Recommendation basis").waitFor({ timeout: 15_000 });

    const tabLabels = (await page.locator(".ht-codex-tab-btn").allTextContents()).map((label) => label.trim());
    for (const expected of ["Model card", "Prompt notes", "Local fit"]) {
      if (!tabLabels.some(label => label.startsWith(expected))) throw new Error(`Missing marketplace detail tab: ${expected}. Saw: ${tabLabels.join(", ")}`);
    }

    await page.getByRole("button", { name: "Prompt notes" }).click();
    await page.getByText("Template status").waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "Local fit" }).click();
    await page.getByText("GPU diagnostics").waitFor({ timeout: 10_000 });
    if (writeDocAssets) await captureDocAsset(page, "marketplace-desktop.png");

    await page.getByRole("button", { name: "View Settings" }).click();
    await page.getByRole("button", { name: "Advanced", exact: true }).click();
    await page.getByRole("button", { name: "Close", exact: true }).click();

    const bodyText = await page.locator("body").innerText();
    const forbidden = [
      "Verified model repo",
      "Staff Pick",
      "zero bottlenecking",
      "partial offloading without active CPU latency spikes",
      "Full GPU Offload",
      "Lumina playground",
      "ð",
      "â"
    ];
    const found = forbidden.filter((text) => bodyText.includes(text));
    if (found.length) throw new Error(`Marketplace still renders forbidden audit text: ${found.join(", ")}`);

    await page.getByRole("button", { name: "Runtimes" }).click();
    await page.getByRole("heading", { name: "Runtimes" }).waitFor({ timeout: 10_000 });
    const openAiRuntime = page.locator(".ht-runtime").filter({ hasText: "OpenAI-compatible endpoint" }).first();
    await openAiRuntime.locator("code").filter({ hasText: "OPENAI_COMPATIBLE_BASE_URL" }).waitFor({ timeout: 10_000 });
    if ((await openAiRuntime.getByRole("button", { name: /install/i }).count()) > 0) {
      throw new Error("OpenAI-compatible endpoint must be configured, not installed.");
    }
    if ((await page.getByText("One-Click Install").count()) > 0) {
      throw new Error("Runtime page still exposes the old one-click install copy.");
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (overflow) throw new Error("Marketplace desktop layout has horizontal overflow.");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (mobileOverflow) throw new Error("Marketplace mobile layout has horizontal overflow.");
    if (writeDocAssets) {
      await page.evaluate(() => window.scrollTo({ top: 760, left: 0, behavior: "instant" }));
      await page.waitForTimeout(100);
      await captureDocAsset(page, "marketplace-mobile.png");
    }

    if (consoleErrors.length || failedRequests.length || badResponses.length) {
      throw new Error(
        `Marketplace browser smoke found errors\nconsole=${consoleErrors.join("\n")}\nfailed=${failedRequests.join("\n")}\nresponses=${badResponses.join("\n")}`
      );
    }
  } finally {
    await browser.close();
  }
  console.log("marketplace smoke ok");
} finally {
  await stopChildren();
}

async function startLocalStack() {
  if (!fs.existsSync("packages/daemon/dist/index.js")) {
    throw new Error("Daemon dist entry is missing. Run npm run build before marketplace smoke.");
  }
  const api = new URL(apiUrl);
  const studio = new URL(studioUrl);
  children.push(spawnLogged("daemon", process.execPath, ["packages/daemon/dist/index.js"], {
    env: { ...process.env, HT_MARKETPLACE_PORT: api.port, HT_MARKETPLACE_HOST: api.hostname, OPENAI_COMPATIBLE_BASE_URL: "" },
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

async function captureDocAsset(page, fileName) {
  const assetDir = path.resolve("docs", "assets");
  fs.mkdirSync(assetDir, { recursive: true });
  await page.screenshot({
    path: path.join(assetDir, fileName),
    fullPage: false
  });
}
