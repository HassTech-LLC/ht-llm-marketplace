import { ModelMarketplace, type MarketplaceConfig } from "@ht-llm-marketplace/react";
import "@ht-llm-marketplace/react/styles.css";

const config: MarketplaceConfig = {
  apiUrl: "http://127.0.0.1:3001",
  theme: "system",
  branding: {
    name: "Electron Model Hub",
    tagline: "Private local models",
    mark: "EL"
  },
  defaultQuery: "qwen coder",
  storageKey: "electron_model_hub"
};

export function LocalModelsPanel() {
  return <ModelMarketplace config={config} />;
}
