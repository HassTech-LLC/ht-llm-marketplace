import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const root = process.cwd();
const cli = path.join(root, "packages", "cli", "src", "index.js");
const assetDir = path.join(root, "docs", "assets");
const transcriptPath = path.join(root, "docs", "proofs", "terminal-logs", "cli-usability-transcript.txt");
const tmpParent = path.join(os.tmpdir(), "htlm-terminal-proof");
fs.mkdirSync(tmpParent, { recursive: true });
fs.mkdirSync(assetDir, { recursive: true });
fs.mkdirSync(path.dirname(transcriptPath), { recursive: true });

const port = await freePort();
const apiUrl = `http://127.0.0.1:${port}`;
const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", apiUrl);
  response.setHeader("content-type", "application/json");

  if (request.method === "GET" && url.pathname === "/health") {
    return json(response, { ok: true, version: "0.1.0", storage: { database: true } });
  }
  if (request.method === "GET" && url.pathname === "/api/system/scan") {
    return json(response, {
      os: { platform: "win32", arch: "x64", cpuCount: 12, totalMemoryBytes: 34_000_000_000, freeMemoryBytes: 18_000_000_000 },
      disk: { modelsBytes: 0, freeBytes: 900_000_000_000 },
      gpus: [{ name: "Local proof GPU", memoryTotalBytes: 16_000_000_000 }],
      runtimes: [{ id: "llamacpp", label: "llama.cpp", installed: true, online: true, notes: [] }],
      notes: [],
      scannedAt: new Date(0).toISOString()
    });
  }
  if (request.method === "GET" && url.pathname === "/api/inventory") {
    return json(response, { artifacts: [] });
  }
  if (request.method === "GET" && url.pathname === "/api/downloads") {
    return json(response, {
      jobs: [{
        id: "proof-job-1",
        type: "hf-file",
        status: "completed",
        progress: 100,
        source: "test/model",
        target: "test-model.Q4_K_M.gguf",
        artifactId: "proof-artifact-1",
        updatedAt: new Date(0).toISOString()
      }]
    });
  }
  if (request.method === "GET" && url.pathname === "/api/catalog/search") {
    return json(response, {
      items: [
        {
          id: "hf:test/model",
          source: "huggingface",
          repoId: "test/model",
          name: "Test Model GGUF",
          author: "test",
          tags: ["gguf"],
          license: "Apache-2.0",
          format: "gguf",
          fit: { level: "good", label: "GPU fit", reasons: [] }
        },
        {
          id: "ollama:qwen2.5:0.5b",
          source: "ollama",
          repoId: "qwen2.5:0.5b",
          name: "qwen2.5:0.5b",
          author: "community",
          tags: ["chat"],
          license: "unknown",
          format: "ollama",
          fit: { level: "good", label: "Laptop fit", reasons: [] }
        }
      ]
    });
  }
  if (request.method === "GET" && url.pathname === "/api/catalog/hf/files") {
    return json(response, {
      files: [{
        repoId: "test/model",
        path: "test-model.Q4_K_M.gguf",
        format: "gguf",
        sizeBytes: 1_234_567,
        downloadUrl: "https://example.test/test-model.gguf",
        runnable: true,
        fit: { level: "good", label: "GPU fit", reasons: [] }
      }]
    });
  }

  response.statusCode = 404;
  return json(response, { error: `Unhandled ${request.method} ${url.pathname}` });
});

let tempProject;
try {
  await listen(server, port);
  tempProject = fs.mkdtempSync(path.join(tmpParent, "project-"));
  const sections = [];

  sections.push(await runCli(["targets"]));
  sections.push(await runCli(["profile", "terminal-agent"]));
  sections.push(await runCli(["init", "--target", "terminal"], { cwd: tempProject, normalizeTemp: tempProject }));
  sections.push(await runCli(["status"], { env: { HT_MARKETPLACE_API_URL: apiUrl } }));
  sections.push(await runCli(["search", "qwen", "--limit", "2"], { env: { HT_MARKETPLACE_API_URL: apiUrl } }));
  sections.push(await runCli(["files", "test/model"], { env: { HT_MARKETPLACE_API_URL: apiUrl } }));
  sections.push(await runCli(["downloads"], { env: { HT_MARKETPLACE_API_URL: apiUrl } }));
  sections.push(await runCli(["lifecycle", "test/model"], { env: { HT_MARKETPLACE_API_URL: apiUrl } }));

  const transcript = [
    "HT Local LLM Marketplace terminal usability transcript",
    `Captured: ${new Date().toISOString()}`,
    "Commands were executed against the repo CLI. Network-dependent status/search/file/download views used a deterministic local mock daemon.",
    "",
    ...sections
  ].join("\n\n");
  fs.writeFileSync(transcriptPath, transcript, "utf8");
  await renderTerminalProof(transcript);
  console.log(`terminal transcript written to ${path.relative(root, transcriptPath)}`);
  console.log("terminal proof assets written to docs/assets/terminal-usability.png and docs/assets/terminal-demo.webm");
} finally {
  await close(server);
  if (tempProject) cleanup(tempProject);
  if (fs.existsSync(tmpParent) && fs.readdirSync(tmpParent).length === 0) fs.rmdirSync(tmpParent);
}

function runCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: options.cwd || root,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`CLI command timed out: ${args.join(" ")}\n${stdout}\n${stderr}`));
    }, 20_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`CLI command failed (${code}): ${args.join(" ")}\n${stdout}\n${stderr}`));
        return;
      }
      let output = stdout.trimEnd();
      if (options.normalizeTemp) {
        output = output.replaceAll(options.normalizeTemp, "<temp-project>");
      }
      resolve([`$ node packages/cli/src/index.js ${args.join(" ")}`, "", output].join("\n"));
    });
  });
}

async function renderTerminalProof(transcript) {
  const browser = await chromium.launch();
  try {
    const html = terminalHtml(transcript);
    const screenshotPage = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    await screenshotPage.setContent(html, { waitUntil: "load" });
    await screenshotPage.screenshot({ path: path.join(assetDir, "terminal-usability.png"), fullPage: false });
    await screenshotPage.close();

    const videoDir = path.join(os.tmpdir(), "htlm-terminal-video");
    fs.mkdirSync(videoDir, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      recordVideo: { dir: videoDir, size: { width: 1366, height: 900 } }
    });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForTimeout(500);
    const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    for (const y of [0, 280, 560, 840, 1120, 1400, 1680]) {
      await page.evaluate((nextY) => window.scrollTo({ top: Math.min(nextY, document.documentElement.scrollHeight), left: 0, behavior: "smooth" }), y);
      await page.waitForTimeout(450);
      if (y >= maxScroll) break;
    }
    await page.waitForTimeout(650);
    const video = page.video();
    await context.close();
    if (video) {
      const tempVideo = await video.path();
      const destVideo = path.join(assetDir, "terminal-demo.webm");
      if (fs.existsSync(destVideo)) fs.unlinkSync(destVideo);
      fs.renameSync(tempVideo, destVideo);
    }
    cleanup(videoDir);
  } finally {
    await browser.close();
  }
}

function terminalHtml(transcript) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>HT Local LLM Marketplace Terminal Proof</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #05080d;
      color: #dbeafe;
      font-family: Inter, Segoe UI, Arial, sans-serif;
      padding: 28px;
    }
    .stage {
      width: 100%;
      max-width: 1240px;
      margin: 0 auto;
    }
    header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 18px;
    }
    h1 {
      margin: 0;
      font-size: 30px;
      line-height: 1.1;
      letter-spacing: 0;
    }
    .meta {
      color: #8fb8cf;
      font-size: 15px;
      text-align: right;
    }
    .terminal {
      border: 1px solid #223042;
      background: linear-gradient(180deg, #0d1420 0%, #070b12 100%);
      box-shadow: 0 24px 80px rgba(0, 0, 0, .5);
      overflow: hidden;
    }
    .bar {
      height: 44px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 18px;
      border-bottom: 1px solid #223042;
      background: #111827;
    }
    .dot { width: 11px; height: 11px; border-radius: 50%; }
    .red { background: #ef4444; }
    .yellow { background: #f59e0b; }
    .green { background: #10b981; }
    .title {
      margin-left: 8px;
      color: #a7c3d8;
      font-size: 14px;
    }
    pre {
      margin: 0;
      padding: 24px;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: Consolas, "Cascadia Mono", "Courier New", monospace;
      font-size: 16px;
      line-height: 1.48;
      color: #e7eef7;
    }
  </style>
</head>
<body>
  <main class="stage">
    <header>
      <h1>HT Local LLM Marketplace Terminal Proof</h1>
      <div class="meta">CLI, agent setup, local daemon status, search, files, downloads</div>
    </header>
    <section class="terminal">
      <div class="bar">
        <span class="dot red"></span>
        <span class="dot yellow"></span>
        <span class="dot green"></span>
        <span class="title">PowerShell proof transcript</span>
      </div>
      <pre>${escapeHtml(transcript)}</pre>
    </section>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function json(response, payload) {
  response.setHeader("connection", "close");
  response.end(JSON.stringify(payload));
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

function close(server) {
  server.closeAllConnections?.();
  return new Promise((resolve) => server.close(resolve));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const temp = http.createServer();
    temp.once("error", reject);
    temp.listen(0, "127.0.0.1", () => {
      const address = temp.address();
      temp.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Unable to allocate free port"));
      });
    });
  });
}

function cleanup(target) {
  const resolved = path.resolve(target);
  const allowedParents = [path.resolve(tmpParent), path.resolve(os.tmpdir())];
  if (!allowedParents.some((parent) => resolved === parent || resolved.startsWith(parent + path.sep))) {
    throw new Error(`Refusing to remove outside temp proof roots: ${target}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
