import { describe, expect, it } from "vitest";
import { defaultRuntimeConfig, sanitizeRuntimeConfig } from "../config.js";

describe("runtime config", () => {
  it("keeps safe defaults", () => {
    expect(defaultRuntimeConfig().keepWarm).toBe(true);
    expect(defaultRuntimeConfig().backend).toBe("in-process");
  });

  it("clamps unsafe numeric values", () => {
    const config = sanitizeRuntimeConfig({ contextSize: 999999, threads: 999999, delegatedServer: { parallel: 99 } });
    expect(config.contextSize).toBe(32768);
    expect(config.threads).toBe(64);
    expect(config.delegatedServer.parallel).toBe(16);
  });

  it("rejects draft model when target model is missing", () => {
    expect(() => sanitizeRuntimeConfig({ draftModel: "missing.gguf" }, { knownModelPaths: ["target.gguf"] })).toThrow(
      "Draft model is not in the local model index"
    );
  });
});
