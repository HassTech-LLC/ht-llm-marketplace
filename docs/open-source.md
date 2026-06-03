# Open Source Readiness

HT Local LLM Marketplace is prepared for public GitHub and npm distribution under MIT. The repo root stays private in `package.json` because it is a workspace, while the publishable packages are marked public.

For the public repository positioning, footprint language, topics, and proof-boundary rules, see [`github-repo-design.md`](github-repo-design.md).

## Repository Footprint

The source repo should stay light and reviewable. The latest local measurement used for public docs is:

| Area | Size |
| --- | ---: |
| Tracked source | 229 files, about 1.42 MiB |
| SDK package tarball | about 10.5 KB |
| CLI package tarball | about 8.9 KB |
| React package tarball | about 44 KB |
| Web Component tarball | about 83.5 KB |
| Daemon package tarball | about 128.6 KB |

Do not describe downloaded models, local runtime caches, `node_modules`, `.git`, or Tauri `target` output as the package footprint. Those are local development or user-machine payloads, not the embeddable marketplace source.

## Install Vs Fork

Install packages when you want to embed the marketplace in an existing app:

```powershell
npm run bundle:local
# In the consuming project, run the generated install-local script from that bundle.
```

After npm publication, the install path becomes `npm install @ht-llm-marketplace/cli @ht-llm-marketplace/react @ht-llm-marketplace/web-component`.

Fork the repo when you need to modify daemon runtime adapters, catalog source behavior, installer flows, or release packaging.

## Local Daemon

The UI expects a local daemon endpoint. During development:

```powershell
npm install
npm run dev
```

The default daemon URL is `http://127.0.0.1:3001`. You can override it through:

- React `config.apiUrl`
- Web Component `api-url`
- `HT_MARKETPLACE_API_URL` for CLI commands

The daemon serves the Web Component bundle from:

```text
http://127.0.0.1:3001/widget/ht-model-marketplace.js
```

Build that widget before relying on the daemon-hosted script:

```powershell
npm run build -w @ht-llm-marketplace/web-component
```

After installing the local release bundle or the published CLI package, consumers can start the daemon with:

```powershell
npx htlm start
```

or:

```powershell
npx htlm-daemon
```

## Terminal And Project Integration Contract

The marketplace must work without the Studio UI. The supported terminal lifecycle is:

These commands require the HT CLI package to be installed in the consuming project.

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

`npx htlm init --target auto` writes the shared config file and prints the right integration shape for the current folder. Explicit targets are:

| Target | Use when |
| --- | --- |
| `react` | React component host |
| `vite` | Vite React app |
| `next` | Next.js client component |
| `html` | Plain HTML or any server-rendered framework that can load a custom element |
| `terminal` | CLI-only, backend, agent, CI, or script-first project |

This keeps the daemon, CLI, SDK, React component, and Web Component as equal product surfaces. A marketplace feature is not complete until it has a terminal/API path and an embeddable project path where practical.

`htlm targets` prints the supported host matrix. `docs/universal-integration.md` and `examples/universal` cover Python, Django, Rails, Laravel, ASP.NET, Electron, Tauri, VS Code extensions, agents, and CI-style terminal use.

For the full profile matrix, see [`integration-profiles.md`](integration-profiles.md). For Hermes-style agents, coding agents, local chat UIs, workflow runners, and other OpenAI-compatible clients, see [`agent-integration.md`](agent-integration.md).

## Hugging Face And Ollama Expectations

Hugging Face catalog behavior should stay configurable through source defaults and backend environment settings. The UI should not hardcode one model family, one author, or one quantization choice as the only path.

Ollama and LM Studio are treated as local runtimes. The marketplace can detect installed runtimes, start supported local services, and pull or install selected artifacts through the daemon.

## Privacy

The marketplace is designed for local-first use:

- Runtime scans happen through the local daemon.
- Downloads are tracked in local daemon state.
- Inventory and delete plans are local.
- The UI can query open model sources such as Hugging Face when a user searches.

Hosts embedding this project should document their own telemetry, proxying, and source allow-list behavior if they modify the daemon.

## Publish Checks

Before publishing packages:

```powershell
npm run release:preflight
npm run publish:dry-run
```

The release preflight verifies typecheck, tests, builds, dry-pack contents, browser smoke, installer smoke, clean-room consumer install, and an external tarball install smoke for:

- `@ht-llm-marketplace/sdk`
- `@ht-llm-marketplace/react`
- `@ht-llm-marketplace/web-component`
- `@ht-llm-marketplace/daemon`
- `@ht-llm-marketplace/cli`

The external smoke installs packed tarballs into `artifacts/package-smoke`, imports SDK/React package APIs, runs the CLI help command, and starts the daemon bin on a free loopback port.
`npm run smoke:cli-marketplace` additionally verifies terminal catalog search, file listing, download listing, artifact verification, artifact reveal, artifact load, and project-target initialization against a fake daemon.
`npm run smoke:universal` verifies the universal target matrix, auto-detection for representative host projects, and the sample snippets under `examples/universal`.
`npm run smoke:consumer` creates a temporary consumer project outside the repo, installs the local release tarballs, starts the packaged daemon, verifies CLI initialization/status/profile commands, and checks the packaged Web Component widget route.

The remaining launch-distribution work is tracked in [`launch-gap-completion-plan-2026-06-01.md`](launch-gap-completion-plan-2026-06-01.md). Use that plan to close Docker proof, remote CI observation, release publishing, and clean-room consumer validation before calling the marketplace public-ready.

## Local Release Bundle

Until the packages are published to npm, build a local install bundle for external projects:

```powershell
npm run bundle:local
```

The bundle is written outside the repo by default and contains packed tarballs, `manifest.json`, PowerShell and POSIX install scripts, and a README. This is the cleanest way to hand the marketplace to another local project without committing generated artifacts.

For a clean-room validation of that bundle path:

```powershell
npm run smoke:consumer
```

## Contribution Workflow

1. Open an issue or discussion for behavior changes that affect runtime safety, delete plans, installer behavior, or package exports.
2. Keep changes scoped to one package or one user flow when possible.
3. Add tests for config merge behavior, source parsing, runtime safety, or UI fallbacks touched by the change.
4. Run the publish checks before opening a pull request.
5. Include screenshots for visual changes in dark, light, and mobile widths.

## Future Extension Points

The v1 boundary is config and tokens, not plugins. Future extension points should grow out of repeated needs around:

- Daemon runtime adapters
- Catalog source adapters
- Enterprise source defaults and allow lists
- Theming presets
- Host app auth/proxy integration
