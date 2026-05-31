import fs from "node:fs";
import { spawnSync } from "node:child_process";

const requiredFiles = [
  "apps/desktop/package.json",
  "apps/desktop/src-tauri/tauri.conf.json",
  "apps/desktop/src/daemon.ts",
  "docs/windows-installer.md"
];

const missing = requiredFiles.filter((file) => !fs.existsSync(file));
if (missing.length) {
  console.error(`Installer smoke missing files: ${missing.join(", ")}`);
  process.exit(1);
}

const docs = fs.readFileSync("docs/windows-installer.md", "utf8").toLowerCase();
for (const phrase of ["storage", "uninstall", "model", "migration"]) {
  if (!docs.includes(phrase)) {
    console.error(`Installer docs must mention ${phrase}.`);
    process.exit(1);
  }
}

const npm = npmInvocation();
const result = spawnSync(npm.command, [...npm.args, "--prefix", "apps/desktop", "run", "check"], { stdio: "inherit", shell: npm.shell });
if (result.status !== 0) process.exit(result.status || 1);

console.log("installer smoke ok");

function npmInvocation() {
  if (process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)) {
    return { command: process.execPath, args: [process.env.npm_execpath], shell: false };
  }
  // Node ≥18.20.2 (CVE-2024-27980) requires shell:true to spawn .cmd/.bat on Windows.
  return { command: process.platform === "win32" ? "npm.cmd" : "npm", args: [], shell: process.platform === "win32" };
}
