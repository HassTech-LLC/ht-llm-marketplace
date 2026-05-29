import { describe, expect, it } from "vitest";
import {
  chooseView,
  getEnabledViews,
  resolveMarketplaceConfig,
  storageName,
  tokensToStyle
} from "./config.js";

describe("marketplace config", () => {
  it("merges defaults with public config", () => {
    const config = resolveMarketplaceConfig({
      apiUrl: "http://127.0.0.1:3999",
      theme: "light",
      branding: { name: "Acme Models" },
      labels: { buttons: { search: "Find" } },
      tokens: { cyan: "#00abc0", "--brand-ring": "0 0 0 1px red" },
      defaultQuery: "llama",
      storageKey: "acme"
    });

    expect(config.apiUrl).toBe("http://127.0.0.1:3999");
    expect(config.theme).toBe("light");
    expect(config.branding.name).toBe("Acme Models");
    expect(config.branding.mark).toBe("HT");
    expect(config.labels.buttons.search).toBe("Find");
    expect(config.labels.buttons.refresh).toBe("Refresh");
    expect(config.display.downloadMode).toBe("simple");
    expect(config.defaultQuery).toBe("llama");
    expect(storageName(config.storageKey, "showSpecs")).toBe("acme:showSpecs");
    expect(storageName(config.storageKey, "downloadMode")).toBe("acme:downloadMode");
    expect(tokensToStyle(config.tokens)).toMatchObject({
      "--ht-cyan": "#00abc0",
      "--brand-ring": "0 0 0 1px red"
    });
  });

  it("preserves legacy apiUrl and compact props as shorthands", () => {
    const config = resolveMarketplaceConfig(
      {
        apiUrl: "http://config.example",
        compact: false
      },
      {
        apiUrl: "http://legacy.example",
        compact: true
      }
    );

    expect(config.apiUrl).toBe("http://legacy.example");
    expect(config.compact).toBe(true);
  });

  it("allows advanced download mode through display config", () => {
    const config = resolveMarketplaceConfig({
      display: {
        downloadMode: "advanced"
      },
      labels: {
        settings: {
          downloadMode: "Install detail"
        }
      }
    });

    expect(config.display.downloadMode).toBe("advanced");
    expect(config.labels.settings.downloadMode).toBe("Install detail");
  });

  it("falls back safely for invalid download mode config", () => {
    const config = resolveMarketplaceConfig({
      display: {
        downloadMode: "expert" as never
      }
    });

    expect(config.display.downloadMode).toBe("simple");
  });

  it("returns only enabled views and falls back to the first enabled view", () => {
    const config = resolveMarketplaceConfig({
      features: {
        discover: false,
        downloads: true,
        library: false,
        runtimes: false,
        doctor: false,
        settings: false
      }
    });
    const enabled = getEnabledViews(config.features);

    expect(enabled).toEqual(["downloads"]);
    expect(chooseView("discover", enabled)).toBe("downloads");
    expect(chooseView("downloads", enabled)).toBe("downloads");
  });

  it("keeps Doctor as a compatibility rail instead of a navigation view", () => {
    const config = resolveMarketplaceConfig({
      features: {
        doctor: true,
        settings: false
      }
    });

    expect(getEnabledViews(config.features)).toEqual(["discover", "downloads", "library", "runtimes"]);
    expect(chooseView("doctor", getEnabledViews(config.features))).toBe("discover");
  });

  it("keeps the UI recoverable if every view is disabled", () => {
    const config = resolveMarketplaceConfig({
      features: {
        discover: false,
        downloads: false,
        library: false,
        runtimes: false,
        doctor: false,
        settings: false
      }
    });

    expect(getEnabledViews(config.features)).toEqual(["discover"]);
  });
});
