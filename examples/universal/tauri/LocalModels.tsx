import { ModelMarketplace, type MarketplaceConfig } from "@ht-llm-marketplace/react";
import "@ht-llm-marketplace/react/styles.css";

const config: MarketplaceConfig = {
  apiUrl: "http://127.0.0.1:3001",
  theme: "system",
  branding: {
    name: "Tauri Model Hub",
    tagline: "Private local models",
    mark: "TA"
  },
  defaultQuery: "qwen coder",
  storageKey: "tauri_model_hub"
};

export function LocalModels() {
  return <ModelMarketplace config={config} />;
}
