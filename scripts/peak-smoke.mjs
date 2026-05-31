import { spawnSync } from "node:child_process";
import fs from "node:fs";

const steps = [
  ["release:check", ["run", "release:check"]],
  ["desktop:check", ["run", "desktop:check"]],
  ["installer smoke", ["run", "smoke:installer"]],
  ["studio proof smoke", ["run", "smoke:studio"]]
];

if (process.env.HT_PEAK_INCLUDE_DOCKER === "1") {
  steps.push(["docker smoke", ["run", "smoke:docker"]]);
}

for (const [label, args] of steps) {
  console.log(`\n== ${label} ==`);
  const npm = npmInvocation();
  const result = spawnSync(npm.command, [...npm.args, ...args], { stdio: "inherit", shell: npm.shell });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("peak smoke ok");

function npmInvocation() {
  if (process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)) {
    return { command: process.execPath, args: [process.env.npm_execpath], shell: false };
  }
  // Node ≥18.20.2 (CVE-2024-27980) requires shell:true to spawn .cmd/.bat on Windows.
  return { command: process.platform === "win32" ? "npm.cmd" : "npm", args: [], shell: process.platform === "win32" };
}
