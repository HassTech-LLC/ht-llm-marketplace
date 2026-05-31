import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = process.cwd();
const smokeRoot = path.resolve(root, "artifacts", "package-smoke");
const tarballDir = path.join(smokeRoot, "tarballs");

assertInsideWorkspace(smokeRoot);
fs.rmSync(smokeRoot, { recursive: true, force: true });
fs.mkdirSync(tarballDir, { recursive: true });

const npm = npmInvocation();
const packages = [
  "@ht-llm-marketplace/sdk",
  "@ht-llm-marketplace/react",
  "@ht-llm-marketplace/web-component",
  "@ht-llm-marketplace/daemon",
  "@ht-llm-marketplace/cli"
];

for (const workspace of packages) {
  runNpm(["pack", "--pack-destination", path.relative(root, tarballDir), "-w", workspace], root);
}

const tarballs = fs.readdirSync(tarballDir)
  .filter((file) => file.endsWith(".tgz"))
  .map((file) => `./tarballs/${file}`);

fs.writeFileSync(
  path.join(smokeRoot, "package.json"),
  JSON.stringify({ private: true, type: "module", dependencies: {} }, null, 2)
);

runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund", ...tarballs], smokeRoot);

fs.writeFileSync(
  path.join(smokeRoot, "import-smoke.mjs"),
  [
    'import { MarketplaceClient } from "@ht-llm-marketplace/sdk";',
    'import { resolveMarketplaceConfig, tokensToStyle } from "@ht-llm-marketplace/react";',
    'const client = new MarketplaceClient({ apiUrl: "http://127.0.0.1:3999" });',
    'const config = resolveMarketplaceConfig({ branding: { name: "Smoke" }, tokens: { cyan: "#00aabb" } });',
    'if (!client || config.branding.name !== "Smoke") throw new Error("config smoke failed");',
    'if (tokensToStyle(config.tokens)["--ht-cyan"] !== "#00aabb") throw new Error("token smoke failed");',
    'console.log("import smoke ok");'
  ].join("\n")
);

run(process.execPath, ["import-smoke.mjs"], smokeRoot);
run(process.execPath, [path.join(smokeRoot, "node_modules", "@ht-llm-marketplace", "cli", "dist", "index.js"), "--help"], smokeRoot);

const port = await freePort();
const daemonEntry = path.join(smokeRoot, "node_modules", "@ht-llm-marketplace", "daemon", "dist", "index.js");
const daemon = spawn(process.execPath, [daemonEntry], {
  cwd: smokeRoot,
  env: {
    ...process.env,
    HT_MARKETPLACE_PORT: String(port),
    HT_MARKETPLACE_HOME: path.join(smokeRoot, "daemon-home")
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let daemonOutput = "";
daemon.stdout.on("data", (chunk) => {
  daemonOutput += chunk.toString();
});
daemon.stderr.on("data", (chunk) => {
  daemonOutput += chunk.toString();
});

try {
  await waitForHealth(`http://127.0.0.1:${port}/health`);
} finally {
  await stopDaemon(daemon);
}

console.log(`package smoke ok: installed ${tarballs.length} tarballs and started daemon on ${port}`);
cleanupSmokeRoot();

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: options.shell ?? false
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}: ${result.error?.message || "no error detail"}`);
  }
}

function runNpm(args, cwd) {
  run(npm.command, [...npm.args, ...args], cwd, { shell: npm.shell });
}

function npmInvocation() {
  if (process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)) {
    return { command: process.execPath, args: [process.env.npm_execpath], shell: false };
  }
  if (process.platform !== "win32") {
    return { command: "npm", args: [], shell: false };
  }

  const pathEntries = (process.env.Path || process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const shim = path.join(entry, "npm.CMD");
    if (!fs.existsSync(shim)) continue;
    const contents = fs.readFileSync(shim, "utf8");
    const match = contents.match(/"%~dp0\\([^"]*npm-cli\.js)"/i);
    if (!match) continue;
    const cli = path.resolve(entry, match[1]);
    if (fs.existsSync(cli)) {
      // Found the underlying npm-cli.js — invoke node directly, no shell needed.
      return { command: process.execPath, args: [cli], shell: false };
    }
  }

  // Fallback to npm.cmd; Node ≥18.20.2 (CVE-2024-27980) requires shell:true for .cmd on Windows.
  return { command: "npm", args: [], shell: true };
}

function assertInsideWorkspace(target) {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clear path outside workspace: ${target}`);
  }
}

function cleanupSmokeRoot() {
  assertInsideWorkspace(smokeRoot);
  fs.rmSync(smokeRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  const artifactsDir = path.dirname(smokeRoot);
  if (path.basename(artifactsDir) === "artifacts" && fs.existsSync(artifactsDir) && fs.readdirSync(artifactsDir).length === 0) {
    fs.rmdirSync(artifactsDir);
  }
}

async function stopDaemon(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, delay(3000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([exited, delay(3000)]);
  }
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

async function waitForHealth(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (daemon.exitCode !== null) {
      throw new Error(`daemon exited early with ${daemon.exitCode}\n${daemonOutput}`);
    }
    try {
      const response = await fetch(url);
      const payload = await response.json();
      if (response.ok && payload.ok) return;
    } catch {
      await delay(250);
      continue;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}\n${daemonOutput}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
