import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  findLlamaServerBinary,
  LlamaServerManager,
  selectLlamaServerAsset,
  isTrustedLlamaReleaseUrl,
  safeManagedPathSegment,
  isPathInside
} from "../llama-server.js";

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

  it("uses managed manifest, configured roots, then PATH in discovery order", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "htlm-llama-order-root-"));
    const pathRoot = fs.mkdtempSync(path.join(os.tmpdir(), "htlm-llama-order-path-"));
    const binaryName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
    const rootBinary = path.join(root, binaryName);
    const managedDir = path.join(root, "b9444", "asset");
    const managedBinary = path.join(managedDir, binaryName);
    const pathBinary = path.join(pathRoot, binaryName);

    fs.mkdirSync(managedDir, { recursive: true });
    fs.writeFileSync(rootBinary, "");
    fs.writeFileSync(managedBinary, "");
    fs.writeFileSync(pathBinary, "");
    fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify({ binaryPath: managedBinary }));

    try {
      expect(findLlamaServerBinary([root], pathRoot)).toBe(managedBinary);
      fs.rmSync(path.join(root, "manifest.json"));
      expect(findLlamaServerBinary([root], pathRoot)).toBe(rootBinary);
      fs.rmSync(rootBinary);
      expect(findLlamaServerBinary([root], pathRoot)).toBe(pathBinary);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(pathRoot, { recursive: true, force: true });
    }
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

  it("ignores managed manifests that point outside the managed root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "htlm-managed-root-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "htlm-managed-outside-"));
    const binary = path.join(outside, process.platform === "win32" ? "llama-server.exe" : "llama-server");
    fs.writeFileSync(binary, "");
    fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify({ binaryPath: binary }));

    try {
      expect(findLlamaServerBinary([root], "")).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
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

  describe("Security Utility Functions", () => {
    it("isTrustedLlamaReleaseUrl verifies domains correctly", () => {
      expect(isTrustedLlamaReleaseUrl("https://github.com/ggml-org/llama.cpp/releases/download/b9444/bin.zip")).toBe(true);
      expect(isTrustedLlamaReleaseUrl("https://objects.githubusercontent.com/some-asset")).toBe(true);
      expect(isTrustedLlamaReleaseUrl("https://release-assets.githubusercontent.com/some-asset")).toBe(true);
      expect(isTrustedLlamaReleaseUrl("https://malicious-domain.com/bin.zip")).toBe(false);
      expect(isTrustedLlamaReleaseUrl("http://github.com/bin.zip")).toBe(false); // HTTP instead of HTTPS
      expect(isTrustedLlamaReleaseUrl("invalid-url")).toBe(false);
    });

    it("safeManagedPathSegment sanitizes path coordinates", () => {
      expect(safeManagedPathSegment("b9444")).toBe("b9444");
      expect(safeManagedPathSegment("../../traversal")).toBe("..__..__traversal");
      expect(safeManagedPathSegment("special/chars\\here")).toBe("special__chars__here");
      expect(safeManagedPathSegment("...")).toBe("item"); // Refuses raw dots
    });

    it("isPathInside prevents path traversal", () => {
      const root = path.resolve("./storage/tools");
      expect(isPathInside(root, path.join(root, "subdir", "binary.exe"))).toBe(true);
      expect(isPathInside(root, path.join(root, "binary.exe"))).toBe(true);
      expect(isPathInside(root, path.join(root, "..", "trapped.exe"))).toBe(false);
      expect(isPathInside(root, path.resolve("/absolute/outside/path"))).toBe(false);
    });

    it("selectLlamaServerAsset platform matching for Linux and macOS", () => {
      const assets = [
        { name: "llama-b9444-bin-macos-arm64.tar.gz", browser_download_url: "mac-arm" },
        { name: "llama-b9444-bin-ubuntu-x64.tar.gz", browser_download_url: "linux-x64" },
        { name: "llama-b9444-bin-ubuntu-vulkan-x64.tar.gz", browser_download_url: "linux-vulkan" }
      ];

      expect(selectLlamaServerAsset(assets, { platform: "darwin", arch: "arm64" })?.browser_download_url).toBe("mac-arm");
      expect(selectLlamaServerAsset(assets, { platform: "linux", arch: "x64", flavor: "vulkan" })?.browser_download_url).toBe("linux-vulkan");
      expect(selectLlamaServerAsset(assets, { platform: "linux", arch: "x64", flavor: "cpu" })?.browser_download_url).toBe("linux-x64");
    });
  });
});
