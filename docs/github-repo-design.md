# GitHub Repo Design

This repo should present HT Local LLM Marketplace as a lightweight local model control plane that can be embedded into other products, not only as a standalone Studio.

## Primary Positioning

Use this sentence when describing the project:

> A lightweight local-first LLM marketplace and runtime control plane for terminals, agents, React apps, plain HTML apps, desktop shells, and OpenAI-compatible clients.

The most important distinction is size versus payload:

- The repo and npm packages are small control-plane code.
- Local models, runtime caches, desktop build output, and downloaded GGUF files are user-machine payloads.
- The marketplace should help users manage those payloads safely without bundling them into the source repo.

## What To Highlight First

| First-screen claim | Evidence in repo |
| --- | --- |
| Local-first model supply chain | Daemon, inventory, downloads, runtime scan, delete plans. |
| Embeddable anywhere | React component, Web Component, SDK, CLI `init --target`, universal examples. |
| Terminal and agent ready | `htlm` CLI, `/v1` OpenAI-compatible endpoint, agent integration guide. |
| Small control plane | Keep the tracked repo in the low single-digit MiB range including proof media; enforce npm tarball budgets with `npm run check:artifacts`. |
| Safe lifecycle management | Manifest-owned delete plans, explicit privileged-action headers, local inventory and audit state. |
| Runtime-flexible | Managed HT Studio engine plus optional Ollama, LM Studio, llama.cpp, and OpenAI-compatible endpoints. |

## Tech Stack

| Layer | Technology |
| --- | --- |
| Core language | TypeScript / ESM |
| Daemon | Node HTTP server on loopback |
| UI | React, Vite |
| Framework-neutral embed | Web Component custom element |
| Desktop path | Tauri scaffold |
| Runtime family | llama.cpp / `node-llama-cpp`, managed `llama-server`, Ollama, LM Studio, OpenAI-compatible endpoints |
| Testing | TypeScript checks, Vitest, Playwright, package smoke, clean-room consumer smoke |
| Release | GitHub Actions, dry-run npm publish, local bundle, Docker smoke, installer smoke |

## Footprint Language

Use:

- "Small TypeScript control plane."
- "Tiny package tarballs for host apps."
- "Heavy model files stay outside the repo and under local runtime/storage control."
- "Full Studio remains available when users want peak controls."

Avoid:

- "Tiny local LLM." Model size depends on the selected model.
- "No runtime install ever." Ollama and LM Studio remain optional connectors.
- "Best Ollama replacement." Use evidence-bound language: "local standalone inference foundation" or "runtime control plane."
- "One-click everything." Downloads and runtime actions should stay explicit and safety-gated.

## GitHub Surface Checklist

| Surface | Current direction |
| --- | --- |
| README | Lead with marketplace/control-plane purpose, integration paths, size table, architecture, visual proof, verification. |
| Docs index | Route readers by job: universal integration, profiles, agents, customization, safety, open-source release. |
| Screenshots | Keep desktop/mobile marketplace screenshots and terminal/embed diagrams current through `npm run docs:assets`. |
| Badges | CI, MIT, Node, local-first, embeddable UI, OpenAI-compatible API. |
| Topics | `local-ai`, `llm`, `gguf`, `ollama`, `llama-cpp`, `openai-compatible`, `model-marketplace`, `web-component`, `react`, `typescript`, `local-first`, `ai-agents`, `desktop-ai`. |
| Examples | Keep `examples/universal` runnable for terminal, plain HTML, Python, server templates, desktop shells, IDE extensions, and agents. |
| Release proof | Keep `release:check`, `release:preflight`, `publish:dry-run`, `smoke:consumer`, and CI release workflow visible. |

## Implementation Paths To Keep Obvious

| User type | Path |
| --- | --- |
| Agent developer | Set `OPENAI_BASE_URL=http://127.0.0.1:3001/v1`, use `htlm` lifecycle commands. |
| React app developer | Install React package, import CSS, render `ModelMarketplace`. |
| Plain HTML or server-rendered app | Load `/widget/ht-model-marketplace.js`, render `<ht-model-marketplace>`. |
| Backend app | Use `/v1` routes and SDK/CLI lifecycle. |
| Desktop app | Embed React/Web Component and run the daemon locally. |
| Power user | Run full Studio. |

## Proof Gates

Before public release claims, run:

```powershell
npm run release:preflight
npm run publish:dry-run
```

For a faster docs-only repo polish pass, run:

```powershell
npm run smoke:docs
npm run build
npm run smoke:marketplace
```

Docker proof can remain optional locally, but CI release preflight should require it when Docker is available.
