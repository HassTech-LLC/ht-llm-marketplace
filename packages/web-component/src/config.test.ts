import { describe, expect, it, vi } from "vitest";
import { configFromAttributeValues, parseConfigAttribute } from "./config.js";

describe("web component config", () => {
  it("parses JSON config and lets attributes override simple fields", () => {
    const config = configFromAttributeValues({
      config: JSON.stringify({
        apiUrl: "http://config.example",
        branding: { name: "Config Brand", tagline: "Config tag" },
        features: { doctor: false },
        tokens: { "--ht-cyan": "#111111" },
        defaultQuery: "mistral",
        compact: false
      }),
      "api-url": "http://attr.example",
      theme: "light",
      "brand-name": "Attribute Brand",
      "brand-mark": "AB",
      "accent-color": "#00aabb",
      "default-query": "qwen coder"
    });

    expect(config.apiUrl).toBe("http://attr.example");
    expect(config.theme).toBe("light");
    expect(config.branding).toMatchObject({
      name: "Attribute Brand",
      tagline: "Config tag",
      mark: "AB"
    });
    expect(config.features?.doctor).toBe(false);
    expect(config.defaultQuery).toBe("qwen coder");
    expect(config.compact).toBe(false);
    expect(config.tokens).toMatchObject({
      "--ht-cyan": "#00aabb",
      "--ht-green": "#00aabb"
    });
  });

  it("defaults Web Component embeds to compact mode", () => {
    expect(configFromAttributeValues({}).compact).toBe(true);
    expect(configFromAttributeValues({ config: JSON.stringify({ compact: false }) }).compact).toBe(false);
    expect(configFromAttributeValues({ config: JSON.stringify({ compact: false }), compact: "" }).compact).toBe(true);
  });

  it("lets host CSS custom properties override attribute tokens", () => {
    const config = configFromAttributeValues(
      { "accent-color": "#00aabb" },
      { "--ht-cyan": "#ff5500", "--ht-panel": "#101820" }
    );

    expect(config.tokens).toMatchObject({
      "--ht-cyan": "#ff5500",
      "--ht-green": "#00aabb",
      "--ht-panel": "#101820"
    });
  });

  it("warns and falls back when config JSON is invalid", () => {
    const warn = vi.fn();

    expect(parseConfigAttribute("{bad json", warn)).toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
