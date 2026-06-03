import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const skipReleaseCheck = args.has("--skip-release-check");
const dockerRequired = args.has("--docker-required") || process.env.HT_DOCKER_SMOKE_REQUIRED === "1";
const allowNoModel = args.has("--allow-no-model") || process.env.HT_FDE_ALLOW_NO_MODEL === "1";
const npm = npmInvocation();

const strictRuntimeEnv = allowNoModel
  ? {}
  : {
      HT_SERVER_QUALITY_REQUIRE_MODEL: "1",
      HT_GAUNTLET_REQUIRE_MODEL: "1",
      HT_SERVER_POOL_REQUIRE_LIVE: "1"
    };

const steps = [
  ...(skipReleaseCheck ? [] : [["release gate", ["run", "release:check"]]]),
  ["server quality smoke", ["run", "smoke:server-quality"], strictRuntimeEnv],
  ["replacement gauntlet", ["run", "smoke:server-gauntlet"], strictRuntimeEnv],
  ["delegated llama-server smoke", ["run", "smoke:delegated-server"]],
  ["managed server pool smoke", ["run", "smoke:server-pool"], strictRuntimeEnv],
  ["clean-room consumer smoke", ["run", "smoke:consumer"]],
  ["publish dry-run", ["run", "publish:dry-run"]],
  ["GPU proof", ["run", "engine:gpu-proof"]],
  [dockerRequired ? "required docker smoke" : "optional docker smoke", ["run", dockerRequired ? "smoke:docker:required" : "smoke:docker"]]
];

for (const [label, stepArgs, extraEnv = {}] of steps) {
  console.log(`\n== ${label} ==`);
  runNpm(stepArgs, extraEnv);
}

console.log("\nFDE readiness check ok");

function runNpm(stepArgs, extraEnv) {
  const result = spawnSync(npm.command, [...npm.args, ...stepArgs], {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    shell: npm.shell
  });
  if (result.status !== 0) throw new Error(`npm ${stepArgs.join(" ")} failed with ${result.status}`);
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
