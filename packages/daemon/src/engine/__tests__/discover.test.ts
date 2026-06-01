import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { discoverGgufModels } from "../discover.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "ht-discover-"));

function write(relative: string, bytes = 16) {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const buffer = Buffer.alloc(bytes);
  buffer.write("GGUF", 0, "ascii");
  fs.writeFileSync(full, buffer);
  return full;
}

write("alpha/model-a.gguf", 100);
write("beta/model-b-00001-of-00002.gguf", 50);
write("beta/model-b-00002-of-00002.gguf", 50);
write("gamma/mmproj-model-a.gguf", 10);
write("gamma/readme.txt", 5);
write("nested/deep/model-c.gguf", 200);

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("discoverGgufModels", () => {
  const models = discoverGgufModels([{ dir: root, source: "test" }], { skipOllama: true });

  it("finds standalone gguf files with absolute paths and sizes", () => {
    const a = models.find((m) => m.name === "model-a");
    expect(a).toBeDefined();
    expect(path.isAbsolute(a!.path)).toBe(true);
    expect(a!.sizeBytes).toBe(100);
    expect(a!.source).toBe("test");
  });

  it("collapses a split model to its first shard and strips the shard suffix", () => {
    const shards = models.filter((m) => m.name === "model-b");
    expect(shards).toHaveLength(1);
    expect(shards[0].path).toMatch(/-00001-of-00002\.gguf$/i);
  });

  it("skips mmproj projector files and non-gguf files", () => {
    expect(models.some((m) => m.name.includes("mmproj"))).toBe(false);
    expect(models.some((m) => m.path.endsWith(".txt"))).toBe(false);
  });

  it("skips .gguf files whose header is not GGUF", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ht-discover-invalid-"));
    try {
      fs.writeFileSync(path.join(dir, "fake.gguf"), "HT LLM placeholder");
      const discovered = discoverGgufModels([{ dir, source: "test" }], { skipOllama: true });
      expect(discovered.some((m) => m.name === "fake")).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("recurses into nested directories", () => {
    expect(models.some((m) => m.name === "model-c")).toBe(true);
  });

  it("returns exactly the three usable models, sorted by name", () => {
    expect(models.map((m) => m.name)).toEqual(["model-a", "model-b", "model-c"]);
  });

  it("respects maxDepth", () => {
    const shallow = discoverGgufModels([{ dir: root, source: "test" }], { maxDepth: 0, skipOllama: true });
    expect(shallow.some((m) => m.name === "model-c")).toBe(false); // nested/deep is below depth 0
  });

  it("discovers Ollama models from custom OLLAMA_MODELS environment directory", () => {
    const customOllamaDir = path.join(root, "custom-ollama");
    const manifestsDir = path.join(customOllamaDir, "manifests", "registry.ollama.ai", "library", "test-model");
    const blobsDir = path.join(customOllamaDir, "blobs");

    fs.mkdirSync(manifestsDir, { recursive: true });
    fs.mkdirSync(blobsDir, { recursive: true });

    // Write a dummy manifest
    const digest = "sha256:11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff";
    const blobName = "sha256-11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff";
    const manifestContent = JSON.stringify({
      layers: [
        {
          mediaType: "application/vnd.ollama.image.model",
          digest: digest,
          size: 1024
        }
      ]
    });
    fs.writeFileSync(path.join(manifestsDir, "latest"), manifestContent);

    // Write a dummy blob
    const blobPath = path.join(blobsDir, blobName);
    fs.writeFileSync(blobPath, Buffer.from("GGUF dummy weights content"));

    // Set OLLAMA_MODELS and run discovery
    const originalEnv = process.env.OLLAMA_MODELS;
    process.env.OLLAMA_MODELS = customOllamaDir;

    try {
      const discovered = discoverGgufModels([], { skipOllama: false });
      const foundOllama = discovered.find((m) => m.name === "test-model:latest");
      expect(foundOllama).toBeDefined();
      expect(foundOllama!.path).toBe(path.resolve(blobPath));
      expect(foundOllama!.source).toBe("Ollama");
      expect(foundOllama!.sizeBytes).toBe(fs.statSync(blobPath).size);
    } finally {
      process.env.OLLAMA_MODELS = originalEnv;
    }
  });
});
