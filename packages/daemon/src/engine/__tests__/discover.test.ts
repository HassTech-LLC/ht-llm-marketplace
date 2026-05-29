import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { discoverGgufModels } from "../discover.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "ht-discover-"));

function write(relative: string, bytes = 16) {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.alloc(bytes));
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
  const models = discoverGgufModels([{ dir: root, source: "test" }]);

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

  it("recurses into nested directories", () => {
    expect(models.some((m) => m.name === "model-c")).toBe(true);
  });

  it("returns exactly the three usable models, sorted by name", () => {
    expect(models.map((m) => m.name)).toEqual(["model-a", "model-b", "model-c"]);
  });

  it("respects maxDepth", () => {
    const shallow = discoverGgufModels([{ dir: root, source: "test" }], { maxDepth: 0 });
    expect(shallow.some((m) => m.name === "model-c")).toBe(false); // nested/deep is below depth 0
  });
});
