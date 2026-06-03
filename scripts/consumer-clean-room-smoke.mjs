import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = process.cwd();
const keep = process.argv.includes("--keep");
const skipBuild = process.argv.includes("--skip-build") || process.env.npm_config_skip_build === "true";
const bundleArg = process.argv.find((arg) => arg.startsWith("--bundle=") || arg.startsWith("--from-bundle="));
const smokeParent = path.join(os.tmpdir(), "htlm-consumer-clean-room");
fs.mkdirSync(smokeParent, { recursive: true });
const smokeRoot = fs.mkdtempSync(path.join(smokeParent, "run-"));
assertInside(smokeRoot, smokeParent);

const bundleRoot = bundleArg
  ? path.resolve(bundleArg.slice(bundleArg.indexOf("=") + 1))
  : path.join(smokeRoot, "bundle");
const consumerRoot = path.join(smokeRoot, "consumer");
const npm = npmInvocation();

try {
  if (!bundleArg) {
    run(process.execPath, [
      path.join(root, "scripts", "local-release-bundle.mjs"),
      `--out=${bundleRoot}`,
      ...(skipBuild ? ["--skip-build"] : [])
    ], root, { env: cleanNpmPassthroughEnv() });
  }

  const packageDir = path.join(bundleRoot, "packages");
  const tarballs = fs.readdirSync(packageDir)
    .filter((file) => file.endsWith(".tgz"))
    .sort()
    .map((file) => path.join(packageDir, file));
  if (tarballs.length !== 5) throw new Error(`Expected 5 package tarballs, found ${tarballs.length}`);

  fs.mkdirSync(consumerRoot, { recursive: true });
  fs.writeFileSync(
    path.join(consumerRoot, "package.json"),
    JSON.stringify({ private: true, type: "module", name: "htlm-clean-room-consumer" }, null, 2)
  );
  runNpm(["install", "--ignore-scripts", "--omit=optional", "--no-audit", "--no-fund", ...tarballs], consumerRoot);

  const cli = path.join(consumerRoot, "node_modules", "@ht-llm-marketplace", "cli", "dist", "index.js");
  const daemonEntry = path.join(consumerRoot, "node_modules", "@ht-llm-marketplace", "daemon", "dist", "index.js");
  assertFile(cli);
  assertFile(daemonEntry);
  runNpmAndAssert(["exec", "--", "htlm", "targets"], consumerRoot, ["Agents / CI / terminals", "Plain HTML / Astro / CMS"]);
  runNpmAndAssert(["exec", "--", "htlm", "profile", "terminal-agent"], consumerRoot, ["Terminal and agent profile", "OPENAI_BASE_URL"]);
  const importSmoke = writePackageImportSmoke(consumerRoot);
  runAndAssert(process.execPath, [importSmoke], consumerRoot, ["consumer package import smoke ok"]);

  const port = await freePort();
  const daemon = spawn(process.execPath, [daemonEntry], {
    cwd: consumerRoot,
    env: {
      ...cleanNpmPassthroughEnv(),
      HT_MARKETPLACE_PORT: String(port),
      HT_MARKETPLACE_HOST: "127.0.0.1",
      HT_MARKETPLACE_HOME: path.join(consumerRoot, "daemon-home")
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let daemonOutput = "";
  daemon.stdout.on("data", (chunk) => {
    daemonOutput = (daemonOutput + chunk.toString()).slice(-4000);
  });
  daemon.stderr.on("data", (chunk) => {
    daemonOutput = (daemonOutput + chunk.toString()).slice(-4000);
  });

  try {
    const apiUrl = `http://127.0.0.1:${port}`;
    await waitForHealth(apiUrl, daemon, () => daemonOutput);
    await assertOpenAiModels(apiUrl);
    runAndAssert(process.execPath, [cli, "targets"], consumerRoot, ["Agents / CI / terminals", "Plain HTML / Astro / CMS"]);
    runAndAssert(process.execPath, [cli, "init", "--target", "auto"], consumerRoot, ["Project target: html", "ht-model-marketplace"], {
      HT_MARKETPLACE_API_URL: apiUrl
    });
    assertFile(path.join(consumerRoot, "ht-llm-marketplace.config.json"));
    runAndAssert(process.execPath, [cli, "status"], consumerRoot, ["Daemon: online", "Installed artifacts:"], {
      HT_MARKETPLACE_API_URL: apiUrl
    });
    runAndAssert(process.execPath, [cli, "profile", "terminal-agent"], consumerRoot, ["Terminal and agent profile", "OPENAI_BASE_URL"], {
      HT_MARKETPLACE_API_URL: apiUrl
    });
    await assertWidget(apiUrl);
  } finally {
    await stopChild(daemon);
  }

  console.log(`clean-room consumer smoke ok: ${consumerRoot}`);
} finally {
  if (!keep) cleanup();
  else console.log(`kept clean-room smoke root: ${smokeRoot}`);
}

function runNpm(args, cwd) {
  run(npm.command, [...npm.args, ...args], cwd, { shell: npm.shell, env: cleanNpmPassthroughEnv() });
}

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: options.shell ?? false,
    env: options.env || process.env
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}: ${result.error?.message || "no error detail"}`);
  }
}

function runNpmAndAssert(args, cwd, markers, env = {}) {
  runAndAssert(npm.command, [...npm.args, ...args], cwd, markers, env, { shell: npm.shell });
}

function runAndAssert(command, args, cwd, markers, env = {}, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...cleanNpmPassthroughEnv(), ...env },
    encoding: "utf8",
    windowsHide: true,
    shell: options.shell ?? false
  });
  if (result.status !== 0) {
    throw new Error(`${args.join(" ")} failed\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  }
  for (const marker of markers) {
    if (!result.stdout.includes(marker)) {
      throw new Error(`${args.join(" ")} output missing ${marker}\nstdout=${result.stdout}`);
    }
  }
}

function writePackageImportSmoke(cwd) {
  const file = path.join(cwd, "package-import-smoke.mjs");
  fs.writeFileSync(
    file,
    [
      'import { MarketplaceClient } from "@ht-llm-marketplace/sdk";',
      'import { ModelMarketplace, resolveMarketplaceConfig } from "@ht-llm-marketplace/react";',
      'if (typeof MarketplaceClient !== "function") throw new Error("SDK MarketplaceClient import failed");',
      'if (typeof ModelMarketplace !== "function") throw new Error("React ModelMarketplace import failed");',
      'if (resolveMarketplaceConfig({ branding: { name: "Smoke" } }).branding.name !== "Smoke") throw new Error("React config import failed");',
      "globalThis.HTMLElement = class {};",
      "globalThis.customElements = { registry: new Map(), get(name) { return this.registry.get(name); }, define(name, ctor) { this.registry.set(name, ctor); } };",
      'await import("@ht-llm-marketplace/web-component");',
      'if (!globalThis.customElements.get("ht-model-marketplace")) throw new Error("Web Component import failed");',
      'console.log("consumer package import smoke ok");',
      ""
    ].join("\n")
  );
  return file;
}

async function assertWidget(apiUrl) {
  const response = await fetch(`${apiUrl}/widget/ht-model-marketplace.js`);
  const body = await response.text();
  if (!response.ok || !body.includes("ht-model-marketplace")) {
    throw new Error(`Widget asset failed in clean-room consumer: ${response.status} ${body.slice(0, 200)}`);
  }
}

async function assertOpenAiModels(apiUrl) {
  const response = await fetch(`${apiUrl}/v1/models`);
  const payload = await response.json();
  if (!response.ok || payload.object !== "list" || !Array.isArray(payload.data)) {
    throw new Error(`OpenAI models endpoint failed in clean-room consumer: ${response.status} ${JSON.stringify(payload).slice(0, 200)}`);
  }
}

async function waitForHealth(apiUrl, child, output) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`daemon exited early with ${child.exitCode}\n${output()}`);
    try {
      const response = await fetch(`${apiUrl}/health`);
      const payload = await response.json();
      if (response.ok && payload.ok) return;
    } catch {
      // daemon is still starting
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for daemon health\n${output()}`);
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, delay(3000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
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

function npmInvocation() {
  if (process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)) {
    return { command: process.execPath, args: [process.env.npm_execpath], shell: false };
  }
  if (process.platform !== "win32") return { command: "npm", args: [], shell: false };

  const pathEntries = (process.env.Path || process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const shim = path.join(entry, "npm.CMD");
    if (!fs.existsSync(shim)) continue;
    const contents = fs.readFileSync(shim, "utf8");
    const match = contents.match(/"%~dp0\\([^"]*npm-cli\.js)"/i);
    if (!match) continue;
    const cli = path.resolve(entry, match[1]);
    if (fs.existsSync(cli)) return { command: process.execPath, args: [cli], shell: false };
  }
  return { command: "npm", args: [], shell: true };
}

function assertFile(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing expected file: ${file}`);
}

function assertInside(target, parent) {
  const relative = path.relative(parent, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to operate outside clean-room smoke root: ${target}`);
  }
}

function cleanNpmPassthroughEnv() {
  const env = { ...process.env };
  delete env.npm_config_skip_build;
  delete env.npm_package_config_skip_build;
  return env;
}

function cleanup() {
  assertInside(smokeRoot, smokeParent);
  fs.rmSync(smokeRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  if (fs.existsSync(smokeParent) && fs.readdirSync(smokeParent).length === 0) fs.rmdirSync(smokeParent);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
