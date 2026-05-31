import { spawnSync } from "node:child_process";

const required = process.env.HT_DOCKER_SMOKE_REQUIRED === "1";
const image = process.env.HT_DOCKER_SMOKE_IMAGE || "ht-llm-marketplace:smoke";

if (!hasDocker()) {
  if (required) {
    console.error("Docker is required for this smoke but the docker CLI is unavailable.");
    process.exit(1);
  }
  console.log("Docker CLI unavailable; skipping optional docker smoke.");
  process.exit(0);
}

run("docker", ["build", "-t", image, "."]);
const container = `htlm-smoke-${Date.now()}`;
try {
  run("docker", ["run", "-d", "--name", container, "-e", "HT_MARKETPLACE_HOST=127.0.0.1", image]);
  waitForContainerHealth(container);
  console.log(`docker smoke ok: ${image}`);
} finally {
  spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
}

function hasDocker() {
  const result = spawnSync("docker", ["version"], { stdio: "ignore" });
  return result.status === 0;
}

function waitForContainerHealth(container) {
  const script = [
    "const res = await fetch('http://127.0.0.1:3001/health');",
    "const body = await res.json();",
    "if (!res.ok || !body.ok) process.exit(2);"
  ].join("");
  for (let i = 0; i < 40; i += 1) {
    const result = spawnSync("docker", ["exec", container, "node", "--input-type=module", "-e", script], { stdio: "ignore" });
    if (result.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  throw new Error("Docker daemon did not become healthy inside the container.");
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
}
