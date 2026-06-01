import { describe, expect, it } from "vitest";
import { defaultRuntimeConfig, sanitizeRuntimeConfig } from "../config.js";

describe("runtime config", () => {
  it("keeps safe defaults", () => {
    expect(defaultRuntimeConfig().keepWarm).toBe(true);
    expect(defaultRuntimeConfig().backend).toBe("in-process");
    expect(defaultRuntimeConfig().residencyMode).toBe("balanced");
  });

  it("clamps unsafe numeric values", () => {
    const config = sanitizeRuntimeConfig({ contextSize: 999999, threads: 999999, residencyMode: "invalid", delegatedServer: { parallel: 99 } });
    expect(config.contextSize).toBe(32768);
    expect(config.threads).toBe(64);
    expect(config.delegatedServer.parallel).toBe(16);
    expect(config.residencyMode).toBe("balanced");
  });

  it("accepts explicit residency modes", () => {
    expect(sanitizeRuntimeConfig({ residencyMode: "fast-parallel" }).residencyMode).toBe("fast-parallel");
    expect(sanitizeRuntimeConfig({ residencyMode: "quality-single" }).residencyMode).toBe("quality-single");
  });

  it("rejects draft model when target model is missing", () => {
    expect(() => sanitizeRuntimeConfig({ draftModel: "missing.gguf" }, { knownModelPaths: ["target.gguf"] })).toThrow(
      "Draft model is not in the local model index"
    );
  });
});
