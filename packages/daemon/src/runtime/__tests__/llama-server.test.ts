import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findLlamaServerBinary, LlamaServerManager, selectLlamaServerAsset } from "../llama-server.js";

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

  it("discovers a managed llama-server binary from the install manifest", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "htlm-managed-llama-server-"));
    const nested = path.join(root, "b9444", "llama-b9444-bin-win-vulkan-x64");
    fs.mkdirSync(nested, { recursive: true });
    const binary = path.join(nested, process.platform === "win32" ? "llama-server.exe" : "llama-server");
    fs.writeFileSync(binary, "");
    fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify({ binaryPath: binary }));
    expect(findLlamaServerBinary([root], "")).toBe(binary);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("prefers the Windows Vulkan release asset for managed installs", () => {
    const assets = [
      { name: "llama-b9444-bin-win-cpu-x64.zip", browser_download_url: "cpu" },
      { name: "llama-b9444-bin-win-vulkan-x64.zip", browser_download_url: "vulkan" }
    ];

    expect(selectLlamaServerAsset(assets, { platform: "win32", arch: "x64", flavor: "auto" })?.browser_download_url).toBe(
      "vulkan"
    );
    expect(selectLlamaServerAsset(assets, { platform: "win32", arch: "x64", flavor: "cpu" })?.browser_download_url).toBe(
      "cpu"
    );
  });
});
