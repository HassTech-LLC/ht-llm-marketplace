# Integration Profiles

HT Local LLM Marketplace stays in one monorepo, but it is designed as several installable product profiles. Use the smallest profile that gives the host project what it needs.

## Profile Matrix

| Profile | Install | Best for | Includes | Excludes |
| --- | --- | --- | --- | --- |
| `runtime-only` | `@ht-llm-marketplace/cli` + `@ht-llm-marketplace/sdk` | Terminals, agents, backend services, CI, scripts | Daemon, CLI, SDK, OpenAI/Ollama-compatible APIs, model index, runtime controls | Studio UI, React UI, Web Component |
| `embed-ui` | `@ht-llm-marketplace/react` or `@ht-llm-marketplace/web-component` plus CLI daemon | Existing apps that want a marketplace panel | Marketplace UI, trust/evidence panels, downloads, library, local daemon | Full Studio runner shell unless host adds it |
| `studio-full` | repo workspace or future desktop bundle | Users who want peak local control | Marketplace, Run console, hot pool, delegated llama-server, benchmark routing, runtime tuning | Nothing; this is the full option |
| `terminal-agent` | CLI + SDK + OpenAI-compatible URL | Hermes-style agents, coding agents, IDE assistants, workflow runners | Terminal marketplace lifecycle and `/v1` API | Embedded UI unless host wants it |
| `dev` | full repo | Contributors | Tests, Playwright, package smoke, compatibility smoke, artifact gates | Production-only footprint assumptions |

CLI profile help:

```powershell
npx htlm profile
npx htlm profile runtime-only
npx htlm profile embed-ui
npx htlm profile studio-full
npx htlm profile terminal-agent
```

Repo scripts for local development:

```powershell
npm run profile:runtime
npm run profile:embed
npm run profile:studio
npm run profile:agent
```

## Runtime-Only

This is the lightest fully functional model engine path.

```powershell
npm install @ht-llm-marketplace/cli @ht-llm-marketplace/sdk
npx htlm start
npx htlm status
npx htlm search "qwen coder"
npx htlm pull qwen2.5:0.5b
npx htlm run <model> "hi"
```

API targets:

```text
OpenAI-compatible: http://127.0.0.1:3001/v1
Ollama-compatible: http://127.0.0.1:3001
```

Use this for headless servers, local agents, test fixtures, and apps that only need execution plus marketplace lifecycle commands.

## Embed UI

React/Vite/Next:

```powershell
npm install @ht-llm-marketplace/cli @ht-llm-marketplace/react
npx htlm init --target react
```

Plain HTML and server-rendered apps:

```powershell
npm install @ht-llm-marketplace/cli @ht-llm-marketplace/web-component
npx htlm init --target html
```

This is the right profile for dashboards, internal tools, CRM/admin panels, local AI products, coding environments, desktop shells, and apps that want users to discover/install/verify/delete models without adopting the full Studio shell.

## Studio Full / Peak

This keeps the current peak path fully functional.

```powershell
npm install
npm run studio
```

Relevant gates:

```powershell
npm run smoke:studio
npm run smoke:marketplace
npm run smoke:server-quality
npm run release:check
```

This profile keeps runtime controls, managed llama-server, residency modes, hot pools, benchmark routing, and visual QA together.

## Terminal-Agent

Use the daemon as an OpenAI-compatible local backend:

```powershell
set OPENAI_BASE_URL=http://127.0.0.1:3001/v1
set OPENAI_API_KEY=local-not-needed
```

Lifecycle:

```powershell
npx htlm lifecycle
npx htlm status
npx htlm search "coding model"
npx htlm files <hf-repo>
npx htlm pull <ollama-ref-or-hf-repo>
npx htlm downloads
npx htlm inventory
npx htlm verify <artifact-id>
npx htlm load <artifact-id>
npx htlm run <model> "hi"
```

Use this for Hermes-style agents, local coding agents, IDE assistants, autonomous workflow runners, and CI jobs. If an agent supports a custom OpenAI-compatible base URL, it should not need special code.

## Completion Rule

A marketplace capability is complete only when the practical surfaces exist:

- UI path for humans.
- CLI/API path for terminals and agents.
- SDK path for project code.
- Embed path for host apps when the feature is visual.
- Smoke coverage for the surface that changed.
