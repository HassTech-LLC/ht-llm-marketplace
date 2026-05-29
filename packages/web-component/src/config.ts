import type { MarketplaceConfig, MarketplaceTheme, MarketplaceTokens } from "@ht-llm-marketplace/react";

export const WEB_COMPONENT_ATTRIBUTES = [
  "api-url",
  "theme",
  "brand-name",
  "brand-tagline",
  "brand-mark",
  "accent-color",
  "default-query",
  "config",
  "compact"
] as const;

export type WebComponentAttribute = (typeof WEB_COMPONENT_ATTRIBUTES)[number];
export type AttributeValues = Partial<Record<WebComponentAttribute, string>>;

export const HOST_TOKEN_NAMES = [
  "--ht-bg",
  "--ht-panel",
  "--ht-panel-2",
  "--ht-line",
  "--ht-text",
  "--ht-muted",
  "--ht-cyan",
  "--ht-green",
  "--ht-gold",
  "--ht-red",
  "--ht-sidebar-bg",
  "--ht-input-bg",
  "--ht-filter-bg",
  "--ht-control-bg",
  "--ht-btn-primary-bg",
  "--ht-btn-primary-text",
  "--ht-primary-outline-hover-bg"
] as const;

export function parseConfigAttribute(raw: string | null | undefined, warn: (message: string) => void = console.warn): MarketplaceConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as MarketplaceConfig;
    }
    warn("[ht-model-marketplace] Ignoring config attribute because it is not a JSON object.");
  } catch (error) {
    warn(`[ht-model-marketplace] Ignoring invalid config JSON: ${(error as Error).message}`);
  }
  return {};
}

export function configFromAttributeValues(
  attributes: AttributeValues,
  hostTokens: MarketplaceTokens = {},
  warn: (message: string) => void = console.warn
): MarketplaceConfig {
  const parsedConfig = parseConfigAttribute(attributes.config, warn);
  const config: MarketplaceConfig = {
    compact: true,
    ...parsedConfig,
    branding: { ...parsedConfig.branding },
    tokens: { ...parsedConfig.tokens }
  };

  if (attributes["api-url"]) config.apiUrl = attributes["api-url"];

  const theme = normalizeTheme(attributes.theme);
  if (theme) config.theme = theme;

  if (attributes["brand-name"] || attributes["brand-tagline"] || attributes["brand-mark"]) {
    config.branding = {
      ...config.branding,
      ...(attributes["brand-name"] ? { name: attributes["brand-name"] } : {}),
      ...(attributes["brand-tagline"] ? { tagline: attributes["brand-tagline"] } : {}),
      ...(attributes["brand-mark"] ? { mark: attributes["brand-mark"] } : {})
    };
  }

  if (attributes["default-query"]) config.defaultQuery = attributes["default-query"];

  if (attributes.compact !== undefined) config.compact = true;

  if (attributes["accent-color"]) {
    config.tokens = {
      ...config.tokens,
      "--ht-cyan": attributes["accent-color"],
      "--ht-green": attributes["accent-color"],
      "--ht-primary-outline-hover-bg": `${attributes["accent-color"]}1f`
    };
  }

  config.tokens = {
    ...config.tokens,
    ...hostTokens
  };

  return config;
}

export function configFromAttributes(element: HTMLElement, warn: (message: string) => void = console.warn): MarketplaceConfig {
  const attributes: AttributeValues = {};
  for (const name of WEB_COMPONENT_ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (value !== null) attributes[name] = value;
  }
  return configFromAttributeValues(attributes, collectHostTokens(element), warn);
}

function collectHostTokens(element: HTMLElement): MarketplaceTokens {
  if (typeof getComputedStyle !== "function") return {};
  const style = getComputedStyle(element);
  return Object.fromEntries(
    HOST_TOKEN_NAMES.map((name) => [name, style.getPropertyValue(name).trim()])
      .filter(([, value]) => value)
  );
}

function normalizeTheme(theme?: string): MarketplaceTheme | undefined {
  if (theme === "dark" || theme === "light" || theme === "system") return theme;
  return undefined;
}
