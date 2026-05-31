import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkArchSupport, readBundledLlamaReleaseFrom, readReleaseRecord, releaseNumber } from "../doctor.js";

describe("releaseNumber", () => {
  it("parses release tags", () => {
    expect(releaseNumber("b8390")).toBe(8390);
    expect(releaseNumber("8637")).toBe(8637);
    expect(releaseNumber(undefined)).toBeUndefined();
    expect(releaseNumber("latest")).toBeUndefined();
  });
});

describe("checkArchSupport", () => {
  it("blocks a known-newer arch on an older bundle", () => {
    const result = checkArchSupport("gemma4", "b8390");
    expect(result.supported).toBe(false);
    expect(result.minRelease).toBe("b8637");
    expect(result.reason).toMatch(/b8637/);
  });

  it("allows the same arch once the bundle is new enough", () => {
    expect(checkArchSupport("gemma4", "b8637").supported).toBe(true);
    expect(checkArchSupport("gemma4", "b9413").supported).toBe(true);
  });

  it("allows unknown architectures (no false positives)", () => {
    expect(checkArchSupport("qwen2", "b8390").supported).toBe(true);
    expect(checkArchSupport("llama", "b8390").supported).toBe(true);
  });

  it("allows when arch or release is undeterminable", () => {
    expect(checkArchSupport(undefined, "b8390").supported).toBe(true);
    expect(checkArchSupport("gemma4", undefined).supported).toBe(true);
  });
});

describe("readBundledLlamaReleaseFrom", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ht-doctor-"));
  const variant = path.join(dir, "@node-llama-cpp", "win-x64-vulkan");
  fs.mkdirSync(variant, { recursive: true });
  fs.writeFileSync(
    path.join(variant, "_nlcBuildMetadata.json"),
    JSON.stringify({ buildOptions: { gpu: "vulkan", llamaCpp: { repo: "ggml-org/llama.cpp", release: "b8390" } } })
  );
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("reads the bundled llama.cpp release from build metadata", () => {
    expect(readBundledLlamaReleaseFrom(dir)).toBe("b8390");
  });

  it("returns undefined when no metadata is present", () => {
    expect(readBundledLlamaReleaseFrom(path.join(dir, "nope"))).toBeUndefined();
  });
});

describe("readReleaseRecord", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ht-release-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("prefers node-llama-cpp's canonical binariesGithubRelease.json", () => {
    const llamaDir = path.join(dir, "node-llama-cpp", "llama");
    fs.mkdirSync(llamaDir, { recursive: true });
    fs.writeFileSync(path.join(llamaDir, "binariesGithubRelease.json"), JSON.stringify({ release: "b9000" }));
    // also drop a prebuilt metadata with a different release to prove primacy
    const variant = path.join(dir, "@node-llama-cpp", "win-x64-vulkan");
    fs.mkdirSync(variant, { recursive: true });
    fs.writeFileSync(
      path.join(variant, "_nlcBuildMetadata.json"),
      JSON.stringify({ buildOptions: { llamaCpp: { release: "b8390" } } })
    );
    expect(readReleaseRecord(dir)).toBe("b9000");
  });

  it("falls back to prebuilt metadata when the canonical record is absent", () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "ht-release2-"));
    const variant = path.join(dir2, "@node-llama-cpp", "win-x64-vulkan");
    fs.mkdirSync(variant, { recursive: true });
    fs.writeFileSync(
      path.join(variant, "_nlcBuildMetadata.json"),
      JSON.stringify({ buildOptions: { llamaCpp: { release: "b8390" } } })
    );
    expect(readReleaseRecord(dir2)).toBe("b8390");
    fs.rmSync(dir2, { recursive: true, force: true });
  });
});
