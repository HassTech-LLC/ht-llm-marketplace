import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findLlamaServerBinary, LlamaServerManager } from "../llama-server.js";

describe("LlamaServerManager", () => {
  it("returns a deterministic unavailable status when no binary is found", async () => {
    const manager = new LlamaServerManager({ searchRoots: [], pathEnv: "" });
    expect(manager.status()).toMatchObject({ available: false, running: false });
    await expect(manager.start()).resolves.toMatchObject({ available: false, running: false });
    await expect(manager.stop()).resolves.toMatchObject({ available: false, running: false });
  });

  it("discovers a llama-server binary in configured roots", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "htlm-llama-server-"));
    const binary = path.join(root, process.platform === "win32" ? "llama-server.exe" : "llama-server");
    fs.writeFileSync(binary, "");
    expect(findLlamaServerBinary([root], "")).toBe(binary);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
