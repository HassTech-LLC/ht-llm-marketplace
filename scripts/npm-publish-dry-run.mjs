import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const npm = npmInvocation();
const packages = [
  "@ht-llm-marketplace/sdk",
  "@ht-llm-marketplace/react",
  "@ht-llm-marketplace/web-component",
  "@ht-llm-marketplace/daemon",
  "@ht-llm-marketplace/cli"
];

for (const workspace of packages) {
  console.log(`\n== npm publish dry-run ${workspace} ==`);
  runNpm(["publish", "--dry-run", "--access", "public", "-w", workspace]);
}

console.log("\nnpm publish dry-run ok");

function runNpm(args) {
  const result = spawnSync(npm.command, [...npm.args, ...args], {
    cwd: root,
    stdio: "inherit",
    shell: npm.shell,
    env: cleanNpmPassthroughEnv()
  });
  if (result.status !== 0) throw new Error(`npm ${args.join(" ")} failed with ${result.status}`);
}

function cleanNpmPassthroughEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("npm_config_") || key.startsWith("npm_package_")) delete env[key];
  }
  return env;
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
