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

## 🔒 2. Security & Trust Architecture (The 4 Defensive Rings)

Since local daemons run system processes, scan hardware, and perform deletions, they are sensitive attack targets. The daemon implements a rigorous, three-dimensional defense model:

### Ring 1: DNS Rebinding Protection (`isLoopbackHost`)
The daemon inspects the HTTP `Host` header of every incoming request. If it does not match local loopback networks (`127.0.0.1`, `localhost`, `::1`), the request is immediately rejected with `403 Forbidden`. This stops external web pages from hijacking the local connection.

### Ring 2: Origin CSRF Restrictions
All state-changing endpoints (`POST`, `PUT`, `DELETE`) inspect browser-provided `Origin` headers. Requests are only processed if they match origins specified in `HT_MARKETPLACE_ALLOWED_ORIGINS` (e.g., trusted local app ports, specific domains).

### Ring 3: Privileged Action Confirmation
Sensitive, high-risk actions (e.g. system `winget` installs, self-updates, deleting files, revealing local directories) require a custom header:
`x-ht-marketplace-confirm: privileged-action`.
Because custom headers force a **CORS Preflight (OPTIONS request)** in web browsers, cross-origin web pages are blocked by browser sandboxes from exploiting the daemon's local access.

### Ring 4: Path Traversal Defenses in Delete Safety Plans
File deletions must be strictly contained inside the configured marketplace directories. Path resolutions use `path.relative` assertions to verify that all targets are inside registered workspace boundaries. Deletions targeted at parent or system drives (`../../`) are blocked.

---

## ⚡ 3. Performance & Concurrency Tuning

### Node-Native SQLite (`node:sqlite`) & WAL Mode
* **Journal Mode**: Set to `PRAGMA journal_mode = WAL` (Write-Ahead Logging). This allows parallel read operations to execute concurrently without blocking write transactions, keeping multi-surface queries fast.
* **Thread Safety**: Built on Node's native synchronous SQLite module to prevent transaction deadlocks and eliminate connection-pool overhead.

### Server-Sent Events (SSE) Progress Coalescing
* Raw progress logs for model downloads can emit thousands of times per second. 
* To prevent rendering bottlenecks on web clients, the daemon throttles SSE progress events to a smooth **250ms interval** (`MIN_INTERVAL_MS = 250`).

### Dynamic Port-Sliding
* When port `3001` is occupied, the daemon slides upward to find the next free port, writing the active host information to the client config files automatically to prevent system launch failures.

---

## 🛠️ 4. Standard Operational Commands

The repository features a fully integrated check and gate suite:

| Command | Action |
| --- | --- |
| `npm run release:check` | Runs complete monorepo verification (types, unit tests, building, compatibility checks, package packaging checks, size budgets) |
| `npm test` | Runs the 148-unit and integration test suites using Vitest |
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
