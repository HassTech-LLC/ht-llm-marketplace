# Project Memory - HT Local LLM Marketplace

This file serves as the single source of truth for the project's technical architecture, security guards, current state, and operational rules. It is automatically synchronized to ensure seamless agent-pair operations.

---

## 🚀 1. Project Overview & Architecture

**HT Local LLM Marketplace** (and its companion **HT Studio**) is a premium, enterprise-grade, local-first LLM marketplace, orchestrator, and runtime manager. It enables any application—terminal agents, web frontends, desktop containers, or OpenAI-compatible clients—to interact with local models seamlessly, with maximum privacy, security, and low-latency performance.

### Monorepo Structure

```
c:\Users\Owner\Desktop\HT llm Markteplace
├── apps/
│   ├── studio/              # Standalone Vite/React power-user control panel
│   └── desktop/             # Desktop application wrapper
├── packages/
│   ├── sdk/                 # TypeScript ESM API client layer
│   ├── daemon/              # Background controller (Node.js engine, sqlite state)
│   ├── react/               # High-fidelity React components (Outfit/Inter fonts, HSL theme)
│   └── web-component/       # HTML Web Component packaging for universal vanilla imports
└── scripts/                 # Automated validation gates, smokes, and packaging checks
```

---

## 🔒 2. Security & Trust Architecture (The 5 Defensive Rings)

Since local daemons run system processes, scan hardware, and perform deletions, they are sensitive attack targets. The daemon implements a rigorous, multi-dimensional defense model:

### Ring 1: DNS Rebinding Protection (`isLoopbackHost`)
The daemon inspects the HTTP `Host` header of every incoming request. If it does not match local loopback networks (`127.0.0.1`, `localhost`, `::1`), the request is immediately rejected with `403 Forbidden`. This stops external web pages from hijacking the local connection.

### Ring 2: Origin CSRF Restrictions
All state-changing endpoints (`POST`, `PUT`, `DELETE`) inspect browser-provided `Origin` headers. Requests are only processed if they match origins specified in `allowedOrigins` (e.g., trusted local app ports, specific domains).

### Ring 3: Privileged Action Confirmation (Dual Headers)
Sensitive, high-risk actions (e.g. system `winget` installs, self-updates, deleting files, VRAM evictions, revealing local directories) require a custom header:
`x-ht-marketplace-confirm: privileged-action` or `x-ht-studio-confirm: privileged-action`.
Because custom headers force a **CORS Preflight (OPTIONS request)** in web browsers, cross-origin web pages are blocked by browser sandboxes from exploiting the daemon's local access.

### Ring 4: Path Traversal Defenses in Delete Safety Plans
File deletions must be strictly contained inside the configured marketplace directories. Path resolutions use `path.relative` and `isPathInside` assertions to verify that all targets are inside registered workspace boundaries. Deletions targeted at parent or system drives (`../../`) are blocked.

### Ring 5: Binary Execution & Download Integrity Verification
* **Trusted Sources Only**: The daemon verifies downloaded binaries and installer files against trusted patterns (e.g., specific trusted llama.cpp releases).
* **Byte Limit Stream Transformer**: Restricts downloaded archives to a strict `byteLimitTransform` threshold to avoid decompression bomb exploits.
* **Hugging Face LFS SHA256 Verification**: Calculates the SHA256 hash of completed downloads against Hugging Face's LFS pointers and purges corrupt files immediately.

---

## ⚡ 3. Performance & Concurrency Tuning

### Node-Native SQLite (`node:sqlite`) & WAL Mode
* **Journal Mode**: Set to `PRAGMA journal_mode = WAL` (Write-Ahead Logging). This allows parallel read operations to execute concurrently without blocking write transactions, keeping multi-surface queries fast.
* **Thread Safety**: Built on Node's native synchronous SQLite module to prevent transaction deadlocks and eliminate connection-pool overhead.
* **Persisted Integrity**: Fixed a 25-vs-24 column mismatch in `upsertArtifact` prepared statement to ensure robust SQL integrity.

### Server-Sent Events (SSE) Progress Coalescing
* Raw progress logs for model downloads can emit thousands of times per second. 
* To prevent rendering bottlenecks on web clients, the daemon throttles SSE progress events to a smooth **250ms interval** (`MIN_INTERVAL_MS = 250`).

### Dynamic Port-Sliding & Zero-Config Auto-Discovery
* When port `3001` is occupied, the daemon slides upward to find the next free port (up to `3010`), writing the active host information to `active-daemon.json` inside the storage directory.
* The TypeScript SDK, CLI, and Vite bundler dynamically scan both `HT LLM Marketplace` and `HT Studio` storage folders to auto-resolve active daemon ports.

### Unified VRAM Residency Coordinator
* **Multi-Engine Saturation Checks**: Inspects Ollama, LM Studio, and in-process llama-server processes to raise saturation warning flags if multiple runtimes hold VRAM concurrently.
* **One-Click Eviction (`POST /api/runtimes/evict-all`)**: Safely unloads models across all running engines in a single click to free up GPU memory.
* **Trust Level Filter**: Standard routing automatically excludes virtual and untrusted `ambient` discoveries (e.g. general desktop GGUF folders) from automatic routing selections.

### Bilingual Safety Prompt Routing & Active Discovery
* **Bilingual Language Drift Prevention**: Automatically prepends `{ "role": "system", "content": "You are a helpful assistant. Always respond strictly in English." }` to chat completions when no system prompt is present, blocking multilingual models (Qwen2.5) from drifting into other languages on short queries like "hi".
* **Bypass and Custom Prompts**: Allows users to override or completely disable the default guard by supplying a custom system prompt or an empty string `""` from the HT Studio console textarea.
* **Active Runtime Discovery**: Instantly fetches online models from running Ollama (`/api/tags`) and LM Studio (`lms ls`) services and dynamically merges them into the Discovery index, in addition to scanning Windows service (LocalSystem) and ProgramData registry directories offline.

### Auto-Switching Fallback to Ollama for Unsupported GGUF Architectures
* **Zero-Copy dynamic fallback**: When loading a GGUF model with a model architecture unsupported by the built-in llama.cpp engine (e.g. `gemma4` on `b8390`), and Ollama is online, the daemon dynamically registers the model in Ollama on-the-fly via a dynamic `Modelfile` with `FROM "/path/to/gguf"`.
* **Virtual loaded state**: It then marks the model as virtually loaded in `context.engine` with `virtual:ollama:${fallbackName}`.
* **Seamless endpoint proxying**: Subsequent chat (`/api/chat`), OpenAI completions (`/v1/chat/completions`), legacy completions (`/v1/completions`), generation (`/api/generate`), and benchmark requests automatically detect the virtual state and proxy/delegate execution to Ollama, bypassing native loading failures and guaranteeing successful execution transparently.

### Built-In Engine Upgrades & AVX-512 Compiler Bypass
* **Target Stable Release (`b8637`)**: Rebuilt the built-in llama.cpp engine to `b8637` to natively support `gemma4` and all newer model architectures.
* **LLVM Clang AVX-512 Bypass**: Bypassed a severe upstream AVX-512 Clang compiler bug on Windows by editing the compilation toolchain to target `-march=x86-64-v3`. This retains maximum GPU (Vulkan) and CPU hardware acceleration (AVX2, FMA, BMI1/2) while eliminating compilation failures.
* **Auto-Discovery integration**: Enhanced doctor and checkArchSupport utilities to dynamically scan `localBuilds` for successful compilation files (`buildDone.status`), ensuring compiled updates are correctly identified and given priority in compatibility scoring.

---

## 🛠️ 4. Standard Operational Commands

The repository features a fully integrated check and gate suite:

| Command | Action |
| --- | --- |
| `npm run release:check` | Runs complete monorepo verification (types, unit tests, building, compatibility checks, package packaging checks, size budgets) |
| `npm test` | Runs the 166-unit and integration test suites using Vitest |
| `npm run check:compatibility` | Validates API compliance with Ollama, OpenAI, and LM Studio endpoints |
| `npm run smoke:marketplace` | Runs end-to-end browser tests using Playwright against UI components |
| `npm run pack:dry-run` | Builds and checks standard npm tarballs for publish validation |
| `npm run check:artifacts` | Asserts that React/Web-Component bundles do not violate strict size budgets |

---

## 🌟 5. Quality Standards & Rules of Engagement

1. **Aesthetic Principles**: Frontend React components use premium Outfit/Inter typography, dynamic glassmorphism panels, customized HSL palettes, and fluid CSS micro-animations. Plain browser styles or raw, standard Bootstrap elements are strictly prohibited.
2. **Clean-Room Quality**: Keep the codebase completely free of placeholder or loose `TODO` or `FIXME` comments in source files. All development tasks must be resolved.
3. **Loopback Safeguards**: Always default daemon APIs to loopback bounds unless explicitly configured otherwise by users.
4. **Wiki Compounding Logs**: File all durable engineering architecture findings, Cloudflare configurations, and strategic decisions in the cross-project wiki vault (`C:\Users\Owner\Documents\claude-obsidian`).
