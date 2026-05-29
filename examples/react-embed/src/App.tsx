import { ModelMarketplace, type MarketplaceConfig } from "@ht-llm-marketplace/react";
import "@ht-llm-marketplace/react/styles.css";

const marketplaceConfig: MarketplaceConfig = {
  apiUrl: "http://127.0.0.1:3001",
  theme: "system",
  branding: {
    name: "Acme Model Hub",
    tagline: "Approved local models for internal teams",
    mark: "AM"
  },
  defaultQuery: "qwen coder",
  storageKey: "acme_model_hub",
  tokens: {
    "--ht-cyan": "#0ea5e9",
    "--ht-green": "#0ea5e9",
    "--ht-bg": "#0f172a",
    "--ht-panel": "#111827"
  },
  labels: {
    nav: {
      discover: "Models",
      downloads: "Queue"
    },
    buttons: {
      search: "Find"
    }
  },
  features: {
    doctor: false,
    doctorAction: false,
    settings: false
  }
};

export default function App() {
  return <ModelMarketplace config={marketplaceConfig} />;
}
