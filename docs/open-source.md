# Open Source Readiness

HT Local LLM Marketplace is prepared for public GitHub and npm distribution under MIT. The repo root stays private in `package.json` because it is a workspace, while the publishable packages are marked public.

## Install Vs Fork

Install packages when you want to embed the marketplace in an existing app:

```powershell
npm install @ht-llm-marketplace/cli
npm install @ht-llm-marketplace/react
npm install @ht-llm-marketplace/web-component
```

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

After npm publish, consumers can start the daemon with:

```powershell
npx htlm start
```

or:

```powershell
npx htlm-daemon
```

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
npm run release:check
```

The release check verifies typecheck, tests, builds, dry-pack contents, and an external tarball install smoke for:

- `@ht-llm-marketplace/sdk`
- `@ht-llm-marketplace/react`
- `@ht-llm-marketplace/web-component`
- `@ht-llm-marketplace/daemon`
- `@ht-llm-marketplace/cli`

The external smoke installs packed tarballs into `artifacts/package-smoke`, imports SDK/React package APIs, runs the CLI help command, and starts the daemon bin on a free loopback port.

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
