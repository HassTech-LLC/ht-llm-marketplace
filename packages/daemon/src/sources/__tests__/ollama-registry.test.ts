import { describe, expect, it } from "vitest";
import {
  displayRef,
  ollamaBlobUrl,
  ollamaManifestUrl,
  parseOllamaRef,
  selectModelLayer,
  type OllamaManifest
} from "../ollama-registry.js";

describe("parseOllamaRef", () => {
  it("defaults namespace to library and tag to latest", () => {
    expect(parseOllamaRef("qwen2.5")).toEqual({ namespace: "library", model: "qwen2.5", tag: "latest" });
  });

  it("parses an explicit tag", () => {
    expect(parseOllamaRef("qwen2.5:0.5b")).toEqual({ namespace: "library", model: "qwen2.5", tag: "0.5b" });
  });

  it("parses a custom namespace", () => {
    expect(parseOllamaRef("library/llama3.2:1b")).toEqual({ namespace: "library", model: "llama3.2", tag: "1b" });
    expect(parseOllamaRef("someuser/mymodel:q4")).toEqual({ namespace: "someuser", model: "mymodel", tag: "q4" });
  });

  it("strips an ollama:// scheme", () => {
    expect(parseOllamaRef("ollama://gemma3:1b")).toEqual({ namespace: "library", model: "gemma3", tag: "1b" });
  });

  it("throws on empty input", () => {
    expect(() => parseOllamaRef("  ")).toThrow(/required/);
  });
});

describe("selectModelLayer", () => {
  const manifest: OllamaManifest = {
    schemaVersion: 2,
    layers: [
      { mediaType: "application/vnd.ollama.image.system", digest: "sha256:sys", size: 68 },
      { mediaType: "application/vnd.ollama.image.model", digest: "sha256:modelblob", size: 397807936 },
      { mediaType: "application/vnd.ollama.image.template", digest: "sha256:tmpl", size: 1482 }
    ]
  };

  it("picks the model layer regardless of order", () => {
    const layer = selectModelLayer(manifest);
    expect(layer.digest).toBe("sha256:modelblob");
    expect(layer.size).toBe(397807936);
  });

  it("throws when there is no model layer", () => {
    expect(() => selectModelLayer({ layers: [{ mediaType: "application/vnd.ollama.image.license", digest: "x" }] })).toThrow(
      /model layer/
    );
  });
});

describe("url + display helpers", () => {
  it("builds manifest and blob URLs", () => {
    const ref = parseOllamaRef("qwen2.5:0.5b");
    expect(ollamaManifestUrl(ref)).toBe("https://registry.ollama.ai/v2/library/qwen2.5/manifests/0.5b");
    expect(ollamaBlobUrl(ref, "sha256:abc")).toBe("https://registry.ollama.ai/v2/library/qwen2.5/blobs/sha256:abc");
  });

  it("hides the library namespace in the display ref", () => {
    expect(displayRef(parseOllamaRef("qwen2.5:0.5b"))).toBe("qwen2.5:0.5b");
    expect(displayRef(parseOllamaRef("acme/foo:1b"))).toBe("acme/foo:1b");
  });
});
