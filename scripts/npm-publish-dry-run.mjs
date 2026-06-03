import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const npm = npmInvocation();
const packages = [
  { workspace: "@ht-llm-marketplace/sdk", requiredFiles: ["dist/index.js", "dist/index.d.ts"] },
  { workspace: "@ht-llm-marketplace/react", requiredFiles: ["dist/index.js", "dist/model-marketplace.js", "dist/styles.css"] },
  { workspace: "@ht-llm-marketplace/web-component", requiredFiles: ["dist/ht-model-marketplace.js"] },
  { workspace: "@ht-llm-marketplace/daemon", requiredFiles: ["dist/index.js", "dist/server.js"] },
  { workspace: "@ht-llm-marketplace/cli", requiredFiles: ["dist/index.js"] }
];

for (const { workspace, requiredFiles } of packages) {
  verifyPackContents(workspace, requiredFiles);
  console.log(`\n== npm publish dry-run ${workspace} ==`);
  runNpm(["publish", "--dry-run", "--access", "public", "-w", workspace]);
}

console.log("\nnpm publish dry-run ok");

function verifyPackContents(workspace, requiredFiles) {
  const result = spawnSync(npm.command, [...npm.args, "pack", "--dry-run", "--json", "-w", workspace], {
    cwd: root,
    encoding: "utf8",
    shell: npm.shell,
    env: cleanNpmPassthroughEnv()
  });
  if (result.status !== 0) {
    throw new Error(`npm pack --dry-run --json -w ${workspace} failed with ${result.status}\n${result.stdout}\n${result.stderr}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Unable to parse npm pack JSON for ${workspace}: ${error.message}\n${result.stdout}\n${result.stderr}`);
  }
  const files = new Set(parsed?.[0]?.files?.map((file) => file.path) || []);
  for (const file of requiredFiles) {
    if (!files.has(file)) {
      throw new Error(`${workspace} pack dry-run is missing required file: ${file}`);
    }
  }
}

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
  if (process.platform === "win32") {
    const pathEntries = (process.env.Path || process.env.PATH || "").split(path.delimiter).filter(Boolean);
    for (const entry of pathEntries) {
      const shim = path.join(entry, "npm.CMD");
      if (fs.existsSync(shim)) return { command: "cmd.exe", args: ["/d", "/s", "/c", "npm"], shell: false };
    }
  }
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
