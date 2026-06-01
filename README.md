# HT Local LLM Marketplace

[![CI](https://github.com/ht-llm-marketplace/ht-llm-marketplace/actions/workflows/ci.yml/badge.svg)](https://github.com/ht-llm-marketplace/ht-llm-marketplace/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-339933.svg)](package.json)

HT Local LLM Marketplace is a local-first model marketplace and runtime control plane. It ships as a standalone studio, a local daemon, a typed SDK, a React package, a framework-neutral Web Component, and a CLI.

The product goal is narrower than a generic chat app: discover runnable open models, score them against local hardware, install them through Ollama, LM Studio, direct GGUF, or an OpenAI-compatible endpoint, track local downloads privately, and delete only marketplace-owned artifacts with dry-run evidence.

This repo is prepared for public GitHub and npm distribution under MIT. The workspace root stays private, while publishable packages are marked public.

## Current Commands

```powershell
npm install
npm run dev
npm run check
npm test
npm run build
npm run pack:dry-run
npm run smoke:packages
npm run smoke:universal
```

Run the full release gate with:

```powershell
npm run release:check
```

## Quick Start

From the repo:

```powershell
npm install
npm run studio
```

From a consuming app after packages are published:

```powershell
npm install @ht-llm-marketplace/cli @ht-llm-marketplace/react
npx htlm init --target auto
npx htlm start
```

The daemon defaults to `http://127.0.0.1:3001`.

## Packages

- `@ht-llm-marketplace/sdk`: typed API client and shared public types.
- `@ht-llm-marketplace/react`: reusable Marketplace UI with the public `MarketplaceConfig` API.
- `@ht-llm-marketplace/web-component`: drop-in `<ht-model-marketplace>` wrapper.
- `@ht-llm-marketplace/daemon`: local HTTP daemon, runtime scanner, and installer service.
- `@ht-llm-marketplace/cli`: project initializer and local doctor commands.

## Embedding In Any Project

React:

```tsx
import { ModelMarketplace, type MarketplaceConfig } from "@ht-llm-marketplace/react";
import "@ht-llm-marketplace/react/styles.css";

const config: MarketplaceConfig = {
  apiUrl: "http://127.0.0.1:3001",
  theme: "system",
  branding: {
    name: "Acme Model Hub",
    tagline: "Approved local models",
    mark: "AM"
  },
  tokens: {
    "--ht-cyan": "#0ea5e9",
    "--ht-green": "#16a34a"
  },
  defaultQuery: "qwen coder",
  storageKey: "acme_model_hub"
};

export function App() {
  return <ModelMarketplace config={config} />;
}
```

Web Component:

```html
<script type="module" src="http://127.0.0.1:3001/widget/ht-model-marketplace.js"></script>
<ht-model-marketplace
  api-url="http://127.0.0.1:3001"
  theme="system"
  brand-name="Acme Model Hub"
  brand-tagline="Approved local models"
  brand-mark="AM"
  accent-color="#0ea5e9"
  default-query="qwen coder"
></ht-model-marketplace>
```

For project setup:

```powershell
npx @ht-llm-marketplace/cli init --target auto
```

Target options include `react`, `vite`, `next`, `html`, `python`, `django`, `rails`, `laravel`, `aspnet`, `electron`, `tauri`, `vscode`, `terminal`, and `auto`. `auto` inspects the current folder and prints a matching React/Web Component/API/terminal integration snippet while still writing `ht-llm-marketplace.config.json`.

To see the supported project matrix:

```powershell
npx htlm targets
```

Terminal-first marketplace:

```powershell
npx htlm status
npx htlm search "qwen coder"
npx htlm files Qwen/Qwen2.5-0.5B-Instruct-GGUF
npx htlm pull qwen2.5:0.5b
npx htlm downloads
npx htlm inventory
npx htlm verify <artifact-id>
npx htlm load <artifact-id>
npx htlm run <model> "hi"
npx htlm rm <artifact-id>
```

Project fit:

| Project type | Recommended surface |
| --- | --- |
| React, Vite, Next.js | `@ht-llm-marketplace/react` plus `htlm init --target react` |
| Plain HTML, Astro, Rails, Django, Laravel, static sites | `<ht-model-marketplace>` plus `htlm init --target html` |
| Node services, scripts, CLIs, agents, CI jobs | `@ht-llm-marketplace/sdk` or `htlm` terminal commands |
| Desktop shells such as Tauri/Electron | Local daemon plus React or Web Component surface |
| Python, .NET, Ruby, PHP backends | OpenAI-compatible `http://127.0.0.1:3001/v1` plus optional Web Component |
| VS Code and IDE extensions | OpenAI-compatible API plus `htlm` lifecycle commands |

Universal integration details and sample project snippets live in [`docs/universal-integration.md`](docs/universal-integration.md).
Customization details live in [`docs/customization.md`](docs/customization.md). Open-source setup, privacy notes, contribution workflow, and package-release checks live in [`docs/open-source.md`](docs/open-source.md).
Install profiles live in [`docs/integration-profiles.md`](docs/integration-profiles.md). Agent and local-LLM app integration lives in [`docs/agent-integration.md`](docs/agent-integration.md).
Security and privacy boundaries live in [`docs/security-privacy.md`](docs/security-privacy.md). Release steps live in [`RELEASE.md`](RELEASE.md).

Before npm publication, build local install tarballs for a target project with:

```powershell
npm run bundle:local
```

## Architecture

- `packages/daemon`: local HTTP daemon, SQLite inventory, runtime adapters, download jobs, safe delete plans.
- `packages/sdk`: typed API client and shared public types.
- `packages/react`: reusable Marketplace UI.
- `packages/web-component`: drop-in `<ht-model-marketplace>` wrapper.
- `packages/cli`: project initializer and local doctor commands.
- `apps/studio`: standalone local studio UI.
- `examples/react-embed`: minimal React embed config.
- `examples/plain-html`: plain HTML Web Component embed.
- `examples/minimal-widget`: smallest possible Web Component embed.
- `examples/enterprise-white-label`: enterprise-style JSON customization preset.
- `examples/universal`: Python, Django, Rails, Laravel, ASP.NET, Electron, Tauri, VS Code extension, and agent integration snippets.
