import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPathInsideAnyRoot } from "../delete/safety.js";

describe("delete safety", () => {
  it("allows paths inside registered roots", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ht-marketplace-root-"));
    const file = path.join(root, "models", "model.gguf");
    expect(isPathInsideAnyRoot(file, [root])).toEqual({ ok: true });
  });

  it("rejects paths outside registered roots", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ht-marketplace-root-"));
    const other = path.join(os.tmpdir(), "outside.gguf");
    const result = isPathInsideAnyRoot(other, [root]);
    expect(result.ok).toBe(false);
  });
});
