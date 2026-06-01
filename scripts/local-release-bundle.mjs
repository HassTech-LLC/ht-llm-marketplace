import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const outFlag = process.argv.find((arg) => arg.startsWith("--out="));
const outputRoot = outFlag
  ? path.resolve(outFlag.slice("--out=".length))
  : path.join(os.tmpdir(), "htlm-release-bundles", `ht-llm-marketplace-${rootPackage.version}-${Date.now()}`);
const packageDir = path.join(outputRoot, "packages");

fs.mkdirSync(packageDir, { recursive: true });

const npm = npmInvocation();
if (!process.argv.includes("--skip-build")) {
  run(npm.command, [...npm.args, "run", "build"], root, { shell: npm.shell });
}

const workspaces = [
  "@ht-llm-marketplace/sdk",
  "@ht-llm-marketplace/react",
  "@ht-llm-marketplace/web-component",
  "@ht-llm-marketplace/daemon",
  "@ht-llm-marketplace/cli"
];

for (const workspace of workspaces) {
  run(npm.command, [...npm.args, "pack", "--pack-destination", packageDir, "-w", workspace], root, { shell: npm.shell });
}

const tarballs = fs.readdirSync(packageDir).filter((file) => file.endsWith(".tgz")).sort();
const manifest = {
  name: "ht-llm-marketplace-local-release",
  version: rootPackage.version,
  createdAt: new Date().toISOString(),
  packages: tarballs,
  install: {
    powershell: ".\\install-local.ps1",
    shell: "./install-local.sh"
  },
  endpoints: {
    daemon: "http://127.0.0.1:3001",
    openai: "http://127.0.0.1:3001/v1"
  }
};

fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(outputRoot, "install-local.ps1"), powershellInstaller(tarballs));
fs.writeFileSync(path.join(outputRoot, "install-local.sh"), shellInstaller(tarballs));
fs.writeFileSync(path.join(outputRoot, "README.md"), readme(tarballs));

console.log(`Local release bundle written to ${outputRoot}`);
console.log("Packages:");
for (const tarball of tarballs) console.log(`  packages/${tarball}`);

function powershellInstaller(tarballs) {
  const installArgs = tarballs.map((file) => `.\\packages\\${file}`).join(" ");
  return [
    "$ErrorActionPreference = 'Stop'",
    "Write-Host 'Installing HT Local LLM Marketplace local tarballs...'",
    `npm install ${installArgs}`,
    "Write-Host 'Start the daemon with: npx htlm start'",
    "Write-Host 'Terminal profile: npx htlm profile terminal-agent'",
    ""
  ].join("\n");
}

function shellInstaller(tarballs) {
  const installArgs = tarballs.map((file) => `./packages/${file}`).join(" ");
  return [
    "#!/usr/bin/env sh",
    "set -eu",
    "echo 'Installing HT Local LLM Marketplace local tarballs...'",
    `npm install ${installArgs}`,
    "echo 'Start the daemon with: npx htlm start'",
    "echo 'Terminal profile: npx htlm profile terminal-agent'",
    ""
  ].join("\n");
}

function readme(tarballs) {
  return [
    "# HT Local LLM Marketplace Local Release Bundle",
    "",
    "This bundle lets a project install the CLI, daemon, SDK, React package, and Web Component from local tarballs before the npm packages are published.",
    "",
    "Install in a consuming project:",
    "",
    "```powershell",
    ".\\install-local.ps1",
    "npx htlm init --target auto",
    "npx htlm start",
    "```",
    "",
    "OpenAI-compatible endpoint:",
    "",
    "```text",
    "OPENAI_BASE_URL=http://127.0.0.1:3001/v1",
    "OPENAI_API_KEY=local-not-needed",
    "```",
    "",
    "Included packages:",
    "",
    ...tarballs.map((file) => `- \`packages/${file}\``),
    ""
  ].join("\n");
}

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
