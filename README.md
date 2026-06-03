# 💎 HT Local LLM Marketplace

A high-fidelity, embeddable local LLM supply chain and runtime control plane. Fully optimized for zero-config integration in React, vanilla HTML, terminal agents, and enterprise desktop platforms.

[![CI](https://github.com/HassTech-LLC/ht-llm-marketplace/actions/workflows/ci.yml/badge.svg)](https://github.com/HassTech-LLC/ht-llm-marketplace/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-339933.svg)](package.json)
[![Local-first](https://img.shields.io/badge/runtime-local--first-0f766e.svg)](docs/security-privacy.md)
[![Embeddable](https://img.shields.io/badge/ui-React%20%2B%20Web%20Component-0ea5e9.svg)](docs/universal-integration.md)
[![OpenAI compatible](https://img.shields.io/badge/API-OpenAI--compatible-111827.svg)](docs/agent-integration.md)

---

## ⚡ Why This Exists

Most local-LLM tools are heavy desktop apps or system runtimes. **HT Local LLM Marketplace** is designed as a lightweight model supply chain that can be embedded into other products without bringing a heavy AI studio wrapper.

It lets the user's machine own the resource-intensive tasks: model files, runtime state, download queues, hash verification, and deletion safety plans stay strictly local.

---

## 🎨 Visual Proof & Demonstration

### Frosted-Glassmorphic Studio Interface
The Studio features Outfit typography, animated mesh background glows, frosted-glass product cards, VRAM telemetry dashboards, and glow-hover interactions.

![HassTech Local LLM Marketplace Studio Cockpit](docs/assets/marketplace-desktop.png)

### Embeddable Microservice Architecture
The local daemon maps Microservice boundaries dynamically, sliding ports from `3001` upward and maintaining loopback sandbox restrictions.

![Microservice Architecture Map](docs/assets/embed-surfaces.svg)

### Responsive Mobile Interface
Sleek, fluid, and optimized for mobile/tablet command controls.

![HassTech Local LLM Marketplace Mobile view](docs/assets/marketplace-mobile.png)

### Video Demonstrations
* 🎥 **[Studio Walkthrough Video (docs/assets/marketplace-demo.webm)](docs/assets/marketplace-demo.webm)**: Frosted-glass tabs, rescan mechanics, and telemetry dashboard in action.
* 🎥 **[CLI Usability Video (docs/assets/terminal-demo.webm)](docs/assets/terminal-demo.webm)**: Direct terminal GGUF downloads and interactive run executions.

---

## 🌟 Key Developer Benefits

> [!NOTE]
> **Embed Everywhere**: Add a local model marketplace to your existing React panel in 5 lines, or embed the Web Component in plain HTML, Django, Rails, Laravel, or Astro hosts.

### 🔒 1. Five Rings of Loopback Security
* **DNS Rebinding Guard**: `isLoopbackHost` asserts host header checks to reject external DNS hijacking attempts.
* **CORS Preflight Protection**: High-risk state operations require custom confirmation headers (`x-ht-marketplace-confirm: privileged-action`) which force browser CORS preflight checks.
* **Origin Filtering**: Explicit browser-origin validation for incoming calls.
* **Path Traversal Shield**: Resolves absolute file paths relative to configured directories, blocking `../../` system deletions.
* **Byte Limit Stream Transformer**: Restricts downloaded package streams to prevent decompression bombs.

### ⚡ 2. Performance & Concurrency Tuning
* **Native SQLite WAL Mode**: Utilizes Node's native synchronous SQLite module with Write-Ahead Logging for parallel non-blocking reads.
* **SSE Progress Coalescing**: Throttles Server-Sent Events progress logs to a smooth `250ms` rendering interval.
* **Dynamic Port-Sliding**: Automatically detects port collisions and slides (from `3001` up to `3010`), writing status to `active-daemon.json` for client auto-discovery.
* **Bilingual Language Drift Prevention**: Pre-injects English language safety prompts to block Qwen2.5/multilingual models from drifting into non-English responses.

### 🔄 3. Ollama Architectural Fallback
If loading a GGUF model with a model architecture unsupported by the built-in llama.cpp engine (e.g. `gemma4`), and Ollama is online, the daemon dynamically fallback-registers the model inside Ollama on-the-fly via a dynamic `Modelfile` and proxies execution transparently.

### 🛠️ 4. Native AVX-512 Compiler Bypass
Native llama.cpp compiling on Windows targets `-march=x86-64-v3`. This bypasses upstream LLVM Clang AVX-512 compiler bugs, preserving full Vulkan GPU and CPU acceleration (AVX2, FMA, BMI1/2) without crash regressions.

---

## 💻 Reusable Code Snippets

### React Embedding (`@ht-llm-marketplace/react`)
```tsx
import { ModelMarketplace, type MarketplaceConfig } from "@ht-llm-marketplace/react";
import "@ht-llm-marketplace/react/styles.css";

const config: MarketplaceConfig = {
  apiUrl: "http://127.0.0.1:3001",
  theme: "system",
  branding: {
    name: "Acme Model Hub",
    tagline: "Secure, local-first LLM marketplace",
    mark: "AM"
  },
  defaultQuery: "qwen coder"
};

export function LocalModels() {
  return <ModelMarketplace config={config} />;
}
```

### HTML Web Component (Framework-Neutral Element)
```html
<script type="module" src="http://127.0.0.1:3001/widget/ht-model-marketplace.js"></script>

<ht-model-marketplace
  api-url="http://127.0.0.1:3001"
  theme="system"
  brand-name="Acme Model Hub"
  brand-tagline="Approved local models"
  accent-color="#0ea5e9"
></ht-model-marketplace>
```

### Python API Integration
```python
import json
import urllib.request

payload = {"model": "local", "messages": [{"role": "user", "content": "hi"}]}
request = urllib.request.Request(
    "http://127.0.0.1:3001/v1/chat/completions",
    data=json.dumps(payload).encode("utf-8"),
    headers={"content-type": "application/json", "authorization": "Bearer local-not-needed"},
)
print(urllib.request.urlopen(request).read().decode("utf-8"))
```

---

## 🛠️ Package Distribution Matrix

| Workspace | Size | Purpose |
| --- | ---: | --- |
| [`@ht-llm-marketplace/cli`](packages/cli) | ~8.9 KB | Terminal marketplace command runner. |
| [`@ht-llm-marketplace/sdk`](packages/sdk) | ~10.5 KB | Typed client wrappers and environment interfaces. |
| [`@ht-llm-marketplace/react`](packages/react) | ~44 KB | High-fidelity React components. |
| [`@ht-llm-marketplace/web-component`](packages/web-component) | ~83.5 KB | Framework-neutral custom elements. |
| [`@ht-llm-marketplace/daemon`](packages/daemon) | ~128.6 KB | Local control plane database, adapters, and routing. |
| [`apps/studio`](apps/studio) | Source | Standalone control panel application. |

---

## 🚀 Quick Start & Development

1. **Start Development Servers**:
   ```powershell
   npm install
   npm run studio
   ```
   * Vite dev server: `http://127.0.0.1:3000`
   * Local daemon server: `http://127.0.0.1:3001`

2. **Verify Release Gate**:
   ```powershell
   # Runs compilation, unit tests, compatibility, E2E browser smoke, and size checks
   npm run release:check
   ```

3. **Build Local Tarball Bundles**:
   ```powershell
   npm run bundle:local
   ```
   This generates ready-to-test tarballs and an `install-local.ps1` script inside your OS temp directory.

---

## 📚 Document Index

Read the main guides inside the [`docs/`](docs/) directory:
* [`docs/universal-integration.md`](docs/universal-integration.md): Target detection and embedding targets.
* [`docs/integration-profiles.md`](docs/integration-profiles.md): Footprint profiles (runtime, CLI, React, full studio).
* [`docs/agent-integration.md`](docs/agent-integration.md): Wiring local LLMs to coding/terminal agents.
* [`docs/customization.md`](docs/customization.md): Changing brands, colors, styling tokens, and toggling features.
* [`docs/runtime-residency-modes.md`](docs/runtime-residency-modes.md): Parallelism and performance resource allocations.
* [`docs/security-privacy.md`](docs/security-privacy.md): Local sandbox security and verification guides.
* [`docs/open-source.md`](docs/open-source.md): Publishing checklists and developer guidelines.
* [`RELEASE.md`](RELEASE.md): Version release instructions.
