import { spawnSync } from "node:child_process";
import os from "node:os";

console.log("----------------------------------------------------------------------");
console.log("⚡ Starting node-llama-cpp compilation with native CUDA bindings...");
console.log("💻 Platform:", os.platform(), os.arch());
console.log("----------------------------------------------------------------------");

// Set the force-build compilation environment variable for CUDA
process.env.NODE_LLAMA_CPP_FORCE_BUILD = "cuda";

// On Windows, npm commands must run via shell or npm.cmd
const isWin = os.platform() === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";

const result = spawnSync(npmCmd, ["rebuild", "node-llama-cpp"], {
  stdio: "inherit",
  shell: isWin,
  env: { ...process.env }
});

if (result.status !== 0) {
  console.error("❌ Compilation failed with status code:", result.status);
  process.exit(result.status ?? 1);
}

console.log("----------------------------------------------------------------------");
console.log("✅ Success! node-llama-cpp compiled with native CUDA bindings!");
console.log("----------------------------------------------------------------------");
