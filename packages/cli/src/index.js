#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const command = process.argv[2] || "help";
const apiUrl = process.env.HT_MARKETPLACE_API_URL || "http://127.0.0.1:3001";

if (command === "init") {
  const configPath = path.resolve(process.cwd(), "ht-llm-marketplace.config.json");
  const config = {
    apiUrl,
    theme: "system",
    component: "ht-model-marketplace",
    branding: {
      name: "Local LLM Marketplace",
      tagline: "Private model supply chain",
      mark: "HT"
    },
    display: {
      showLogos: true,
      showDescriptions: true,
      showBadges: true,
      showSpecs: true
    },
    features: {
      discover: true,
      downloads: true,
      library: true,
      runtimes: true,
      doctor: true,
      settings: true
    },
    tokens: {
      "--ht-cyan": "#06b6d4",
      "--ht-green": "#06b6d4"
    },
    defaultQuery: "qwen coder",
    storageKey: "ht_marketplace"
  };
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`Created ${configPath}`);
  } else {
    console.log(`Config already exists at ${configPath}`);
  }
  console.log("");
  console.log("Embed snippet:");
  console.log(`<script type="module" src="${apiUrl}/widget/ht-model-marketplace.js"></script>`);
  console.log(`<ht-model-marketplace api-url="${apiUrl}" theme="system" brand-name="${config.branding.name}" brand-tagline="${config.branding.tagline}" brand-mark="${config.branding.mark}" accent-color="${config.tokens["--ht-cyan"]}" default-query="${config.defaultQuery}"></ht-model-marketplace>`);
} else if (command === "doctor") {
  const response = await fetch(`${apiUrl}/api/system/scan`);
  console.log(JSON.stringify(await response.json(), null, 2));
} else if (command === "inventory") {
  const response = await fetch(`${apiUrl}/api/inventory`);
  console.log(JSON.stringify(await response.json(), null, 2));
} else if (command === "start") {
  if (!process.env.HT_MARKETPLACE_PORT) {
    try {
      process.env.HT_MARKETPLACE_PORT = new URL(apiUrl).port || "3001";
    } catch {
      process.env.HT_MARKETPLACE_PORT = "3001";
    }
  }
  console.log(`Starting HT Local LLM Marketplace daemon at ${apiUrl}`);
  await import("@ht-llm-marketplace/daemon");
} else {
  console.log("HT Local LLM Marketplace CLI");
  console.log("");
  console.log("Commands:");
  console.log("  htlm init       Write config and print the Web Component snippet");
  console.log("  htlm start      Start the local daemon");
  console.log("  htlm doctor     Print live local scanner output");
  console.log("  htlm inventory  Print local inventory");
}
