import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const smokeParent = path.join(os.tmpdir(), "htlm-cli-marketplace-smoke");
fs.mkdirSync(smokeParent, { recursive: true });
const smokeRoot = fs.mkdtempSync(path.join(smokeParent, "run-"));
assertInside(smokeRoot, smokeParent);

const port = await freePort();
const apiUrl = `http://127.0.0.1:${port}`;
const calls = [];
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", apiUrl);
  calls.push({ method: request.method, pathname: url.pathname, headers: request.headers });
  response.setHeader("content-type", "application/json");

  if (request.method === "GET" && url.pathname === "/health") {
    return json(response, { ok: true, version: "0.1.0", storage: { database: true } });
  }
  if (request.method === "GET" && url.pathname === "/api/system/scan") {
    return json(response, {
      os: { platform: "test", arch: "x64", cpuCount: 8, totalMemoryBytes: 32_000_000_000, freeMemoryBytes: 16_000_000_000 },
      disk: { modelsBytes: 0, freeBytes: 100_000_000_000 },
      gpus: [{ name: "Test GPU", memoryTotalBytes: 8_000_000_000 }],
      runtimes: [{ id: "llamacpp", label: "llama.cpp", installed: true, online: true, notes: [] }],
      notes: [],
      scannedAt: new Date(0).toISOString()
    });
  }
  if (request.method === "GET" && url.pathname === "/api/catalog/search") {
    return json(response, {
      items: [{
        id: "hf:test/model",
        source: "huggingface",
        repoId: "test/model",
        name: "Test Model",
        author: "test",
        tags: ["gguf"],
        license: "Apache-2.0",
        format: "gguf",
        fit: { level: "good", label: "GPU fit", reasons: [] }
      }]
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
  if (request.method === "GET" && url.pathname === "/api/inventory") {
    return json(response, {
      artifacts: [{
        id: "artifact-1",
        source: "huggingface",
        runtime: "llamacpp",
        name: "test-model",
        displayName: "Test Model",
        repoId: "test/model",
        path: path.join(smokeRoot, "models", "test-model.gguf"),
        sizeBytes: 1_234_567,
        owned: true,
        runnable: true,
        verificationStatus: "unverified",
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        deleteEligible: true,
        notes: []
      }]
    });
  }
  if (request.method === "GET" && url.pathname === "/api/downloads") {
    return json(response, {
      jobs: [{
        id: "job-1",
        type: "hf-file",
        status: "completed",
        progress: 100,
        source: "test/model",
        target: "test-model.Q4_K_M.gguf",
        message: "done",
        artifactId: "artifact-1",
        startedAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }]
    });
  }
  if (request.method === "POST" && url.pathname === "/api/runtimes/llamacpp/load") {
    assertPrivileged(request);
    return json(response, { ok: true, loaded: "Test Model", gpu: "test-gpu" });
  }
  if (request.method === "POST" && url.pathname === "/api/artifacts/artifact-1/verify") {
    assertPrivileged(request);
    return json(response, {
      verification: {
        artifactId: "artifact-1",
        status: "verified",
        sha256: "abc",
        actualBytes: 1_234_567,
        verifiedAt: new Date(0).toISOString(),
        message: "Artifact bytes and hash were verified locally."
      }
    });
  }
  if (request.method === "POST" && url.pathname === "/api/artifacts/artifact-1/reveal") {
    assertPrivileged(request);
    return json(response, { ok: true, message: "Opened artifact location." });
  }

  response.statusCode = 404;
  return json(response, { error: `Unhandled ${request.method} ${url.pathname}` });
});

try {
  await listen(server, port);
  const cli = path.join(root, "packages", "cli", "src", "index.js");
  await runCli(cli, ["init", "--target", "terminal"], { cwd: smokeRoot, expect: ["Terminal/backend commands", "htlm search"] });
  if (!fs.existsSync(path.join(smokeRoot, "ht-llm-marketplace.config.json"))) {
    throw new Error("init did not create ht-llm-marketplace.config.json");
  }
  await runCli(cli, ["init", "--target", "react"], { cwd: smokeRoot, expect: ["React/Vite/Next snippet", "ModelMarketplace"] });
  await runCli(cli, ["init", "--target", "django"], { cwd: smokeRoot, expect: ["Project target: python-web", "Web Component snippet"] });
  await runCli(cli, ["init", "--target", "electron"], { cwd: smokeRoot, expect: ["Project target: desktop-web", "Desktop shell pattern"] });
  await runCli(cli, ["targets"], { expect: ["HT Local LLM Marketplace integration targets", "Django / Flask / FastAPI", "Agents / CI / terminals"] });
  await runCli(cli, ["profile"], { expect: ["runtime-only", "terminal-agent", "studio-full"] });
  await runCli(cli, ["profile", "runtime-only"], { expect: ["Runtime-only profile", "OpenAI base URL"] });
  await runCli(cli, ["profile", "terminal-agent"], { expect: ["Terminal and agent profile", "OPENAI_BASE_URL"] });
  await runCli(cli, ["status"], { expect: ["Daemon: online", "Runtimes online: llama.cpp"] });
  await runCli(cli, ["search", "test"], { expect: ["Test Model", "Apache-2.0", "GPU fit"] });
  await runCli(cli, ["files", "test/model"], { expect: ["test-model.Q4_K_M.gguf", "GPU fit"] });
  await runCli(cli, ["downloads"], { expect: ["job-1", "completed", "artifact-1"] });
  await runCli(cli, ["verify", "artifact-1"], { expect: ["verified", "Artifact bytes"] });
  await runCli(cli, ["load", "artifact-1"], { expect: ["Test Model", "test-gpu"] });
  await runCli(cli, ["reveal", "artifact-1"], { expect: ["Opened artifact location"] });
  await runCli(cli, ["lifecycle", "test/model"], { expect: ["Terminal lifecycle", "Project embed lifecycle"] });

  const privilegedCalls = calls.filter((call) => call.method === "POST");
  if (privilegedCalls.some((call) => call.headers["x-ht-marketplace-confirm"] !== "privileged-action")) {
    throw new Error("CLI did not send privileged confirmation header for every POST.");
  }
  console.log("cli marketplace smoke ok");
} finally {
  await close(server);
  cleanup();
}

function runCli(cli, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: options.cwd || root,
      env: { ...process.env, HT_MARKETPLACE_API_URL: apiUrl },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`CLI ${args.join(" ")} timed out\nstdout=${stdout}\nstderr=${stderr}\ncalls=${JSON.stringify(calls)}`));
    }, 15_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`CLI ${args.join(" ")} failed to execute: ${error.message}\nstdout=${stdout}\nstderr=${stderr}\ncalls=${JSON.stringify(calls)}`));
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`CLI ${args.join(" ")} failed with ${code}\nstdout=${stdout}\nstderr=${stderr}`));
        return;
      }
      for (const expected of options.expect || []) {
        if (!stdout.includes(expected)) {
          reject(new Error(`CLI ${args.join(" ")} output missing ${expected}\nstdout=${stdout}`));
          return;
        }
      }
      resolve();
    });
  });
}

function json(response, payload) {
  response.setHeader("connection", "close");
  response.end(JSON.stringify(payload));
}

function assertPrivileged(request) {
  if (request.headers["x-ht-marketplace-confirm"] !== "privileged-action") {
    throw new Error("missing privileged confirmation header");
  }
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

function assertInside(target, parent) {
  const relative = path.relative(parent, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to operate outside smoke root: ${target}`);
  }
}

function cleanup() {
  assertInside(smokeRoot, smokeParent);
  fs.rmSync(smokeRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  if (fs.existsSync(smokeParent) && fs.readdirSync(smokeParent).length === 0) fs.rmdirSync(smokeParent);
}
