# Universal Integration

HT Local LLM Marketplace is designed to enter a project through the smallest useful surface: CLI, local HTTP API, SDK, React component, Web Component, or full Studio.

## Any Project Quickstart

From this source checkout:

```powershell
node packages/cli/src/index.js init --target auto
node packages/cli/src/index.js start
node packages/cli/src/index.js status
```

In a consuming project, install the local release bundle first. After the CLI package is installed, the same commands are available as `npx htlm ...`.

`init --target auto` inspects the current folder and prints a matching integration snippet. Use an explicit target when the host type is known:

```powershell
node packages/cli/src/index.js init --target react
node packages/cli/src/index.js init --target html
node packages/cli/src/index.js init --target python
node packages/cli/src/index.js init --target django
node packages/cli/src/index.js init --target rails
node packages/cli/src/index.js init --target laravel
node packages/cli/src/index.js init --target aspnet
node packages/cli/src/index.js init --target electron
node packages/cli/src/index.js init --target tauri
node packages/cli/src/index.js init --target vscode
node packages/cli/src/index.js init --target terminal
```

## Framework Matrix

| Host project | Best surface | Why |
| --- | --- | --- |
| React, Vite, Next.js | `@ht-llm-marketplace/react` | Native React component and typed config. |
| Plain HTML, Astro, Vue, Svelte, CMS templates | Web Component | Custom element works without adopting React. |
| Django, Flask, FastAPI | Web Component plus `/v1` API | Template embed for marketplace, Python calls for model use. |
| Rails, Laravel, ASP.NET | Web Component plus `/v1` API | Server templates can load the daemon-hosted widget. |
| Electron, Tauri | React or Web Component plus daemon | Desktop shell renders the UI and calls local loopback. |
| VS Code or IDE extensions | `/v1` API plus `htlm` CLI | Extension code calls model APIs; terminal handles lifecycle. |
| Hermes-style agents, coding agents, CI | CLI, SDK, OpenAI-compatible API | No UI required. |
| Full local model app | Studio full profile | Runtime controls, hot pool, delegated llama-server, benchmark routing. |

## Terminal Contract

Every project can use the local daemon as an OpenAI-compatible backend:

```text
OPENAI_BASE_URL=http://127.0.0.1:3001/v1
OPENAI_API_KEY=local-not-needed
```

Lifecycle commands:

```powershell
htlm status
htlm search "qwen coder"
htlm files Qwen/Qwen2.5-0.5B-Instruct-GGUF
htlm pull qwen2.5:0.5b
htlm downloads
htlm inventory
htlm verify <artifact-id>
htlm load <artifact-id>
htlm run <model> "hi"
```

## Examples

Universal samples live under `examples/universal`:

- `README.md`
- `node-terminal/chat.mjs`
- `node-terminal/package.json`
- `python/openai_chat.py`
- `python/pyproject.toml`
- `plain-html/index.html`
- `django/templates/local_models.html`
- `rails/app/views/local_models/index.html.erb`
- `laravel/resources/views/local-models.blade.php`
- `aspnet/Pages/LocalModels.cshtml`
- `electron/renderer.tsx`
- `tauri/LocalModels.tsx`
- `vscode/extension.ts`
- `agents/openai-compatible.env`

## Release Bundle

Before npm publication, create local tarballs for any consuming project:

```powershell
npm run bundle:local
```

The bundle is written outside the repo by default under the OS temp directory. It includes package tarballs, a `manifest.json`, `install-local.ps1`, `install-local.sh`, and a short README. This gives testers a clean install path without leaving repo artifacts behind.

## Proof Gates

Universal integration is covered by:

```powershell
npm run smoke:universal
npm run smoke:cli-marketplace
npm run smoke:marketplace
npm run release:check
```

`smoke:universal` validates project detection, explicit target snippets, sample files, and a runnable Node terminal starter against an OpenAI-compatible fake endpoint. `release:check` includes the universal smoke so project-surface drift blocks release.
