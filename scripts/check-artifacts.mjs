import fs from "node:fs";
import { spawnSync } from "node:child_process";

const forbiddenPaths = [
  "apps/desktop/src-tauri/target",
  "apps/desktop/src-tauri/gen",
  "artifacts/package-smoke",
  ".playwright-mcp",
  "output/playwright",
  "design-audit",
  "docs/proofs/screenshots",
  "docs/proofs/videos",
  ".remember",
  "studio-marketplace.jpg",
  "studio-proof.jpg",
  "net.txt",
  "console-errors.txt"
];

const forbiddenRootFilePatterns = [
  /^daemon-.*\.log$/i,
  /^daemon-.*\.err\.log$/i,
  /^studio-.*\.log$/i,
  /^studio-.*\.err\.log$/i
];

const forbiddenLockEntries = [
  "@huggingface/transformers",
  "onnxruntime-node",
  "sharp"
];

const packageBudgets = [
  { workspace: "@ht-llm-marketplace/sdk", maxPackageBytes: 30_000 },
  { workspace: "@ht-llm-marketplace/react", maxPackageBytes: 90_000 },
  { workspace: "@ht-llm-marketplace/web-component", maxPackageBytes: 140_000 },
  { workspace: "@ht-llm-marketplace/daemon", maxPackageBytes: 190_000 },
  { workspace: "@ht-llm-marketplace/cli", maxPackageBytes: 30_000 }
];

const failures = [];

for (const path of forbiddenPaths) {
  if (fs.existsSync(path)) failures.push(`Forbidden generated artifact remains: ${path}`);
}

for (const entry of fs.readdirSync(".")) {
  if (forbiddenRootFilePatterns.some((pattern) => pattern.test(entry))) {
    failures.push(`Forbidden root runtime log remains: ${entry}`);
  }
}

if (fs.existsSync("package-lock.json")) {
  const lock = fs.readFileSync("package-lock.json", "utf8");
  for (const entry of forbiddenLockEntries) {
    if (lock.includes(entry)) failures.push(`Forbidden heavy package is present in package-lock.json: ${entry}`);
  }
}

for (const budget of packageBudgets) {
  const packed = packWorkspace(budget.workspace);
  if (!packed) continue;
  if (packed.packageSize > budget.maxPackageBytes) {
    failures.push(
      `${budget.workspace} package size ${packed.packageSize} exceeds budget ${budget.maxPackageBytes}`
    );
  }
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log("artifact cleanliness and package-size budgets ok");

function packWorkspace(workspace) {
  const npm = npmInvocation();
  const result = spawnSync(npm.command, [...npm.args, "--silent", "pack", "--dry-run", "--json", "-w", workspace], {
    encoding: "utf8",
    shell: npm.shell,
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.status !== 0) {
    failures.push(`npm pack budget probe failed for ${workspace}: ${(result.stderr || result.stdout || result.error?.message || "").trim()}`);
    return undefined;
  }
  try {
    const parsed = JSON.parse(result.stdout);
    const item = Array.isArray(parsed) ? parsed[0] : parsed;
    return { packageSize: Number(item.size || 0) };
  } catch (error) {
    failures.push(`Could not parse npm pack budget output for ${workspace}: ${error.message}`);
    return undefined;
  }
}

function npmInvocation() {
  if (process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)) {
    return { command: process.execPath, args: [process.env.npm_execpath], shell: false };
  }
  // Node ≥18.20.2 (CVE-2024-27980) requires shell:true to spawn .cmd/.bat on Windows.
  return { command: process.platform === "win32" ? "npm.cmd" : "npm", args: [], shell: process.platform === "win32" };
}
