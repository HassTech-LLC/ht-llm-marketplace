import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ModelIndex } from "../model-index.js";

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("ModelIndex", () => {
  it("caches discovered GGUF models and includes the virtual specialist", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "htlm-index-"));
    tmpDirs.push(dir);
    fs.writeFileSync(path.join(dir, "tiny.gguf"), Buffer.from("GGUF model"));
    const index = new ModelIndex(() => [{ dir, source: "test" }], { ttlMs: 60_000 });

    const snapshot = await index.refresh("test");

    expect(snapshot.status.state).toBe("ready");
    expect(snapshot.models.map((model) => model.name)).toContain("tiny");
    expect(snapshot.models.map((model) => model.name)).toContain("Ternary-SSM-Specialist");
    expect(index.resolveByName("tiny")?.path).toContain("tiny.gguf");
  });
});
