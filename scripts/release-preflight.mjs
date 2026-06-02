import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const dockerRequired = process.argv.includes("--docker-required") || process.env.HT_DOCKER_SMOKE_REQUIRED === "1";
const skipReleaseCheck = process.argv.includes("--skip-release-check");
const npm = npmInvocation();

const steps = [
  ...(skipReleaseCheck ? [] : [["release gate", ["run", "release:check"]]]),
  ["desktop dependency install", ["ci", "--prefix", "apps/desktop"]],
  ["studio smoke", ["run", "smoke:studio"]],
  ["installer smoke", ["run", "smoke:installer"]],
  ["clean-room consumer smoke", ["run", "smoke:consumer:fast"]],
  [dockerRequired ? "required docker smoke" : "optional docker smoke", ["run", dockerRequired ? "smoke:docker:required" : "smoke:docker"]]
];

for (const [label, args] of steps) {
  console.log(`\n== ${label} ==`);
  runNpm(args);
}

console.log("\nrelease preflight ok");

function runNpm(args) {
  const result = spawnSync(npm.command, [...npm.args, ...args], {
    cwd: root,
    stdio: "inherit",
    shell: npm.shell
  });
  if (result.status !== 0) throw new Error(`npm ${args.join(" ")} failed with ${result.status}`);
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
