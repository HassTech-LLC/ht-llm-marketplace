# Release Checklist

Use this before tagging or publishing npm packages.

## 1. Confirm Public Metadata

- Confirm the GitHub repository URL in all `package.json` files.
- Confirm npm scope remains `@ht-llm-marketplace`.
- Confirm package descriptions, keywords, license, and files lists.
- Confirm `CHANGELOG.md` has the release date.

## 2. Clean Verification

```powershell
npm install
npm run release:preflight
npm run publish:dry-run
```

`release:preflight` runs the release gate, desktop dependency install, Studio smoke, installer smoke, clean-room consumer smoke, and optional Docker smoke. On a Docker-capable CI runner, use:

```powershell
npm run release:preflight:ci
```

Track any remaining launch blockers in [`docs/launch-gap-completion-plan-2026-06-01.md`](docs/launch-gap-completion-plan-2026-06-01.md), especially Docker proof, remote CI observation, and clean-room consumer validation.

## 3. Manual UI Smoke

- Studio dark theme at desktop width.
- Studio light theme at desktop width.
- Studio at 390px mobile with the settings drawer open.
- Web Component embed with custom brand, accent color, default query, and JSON config.
- No horizontal overflow in any viewport.

## 4. Publish

```powershell
npm publish -w @ht-llm-marketplace/sdk
npm publish -w @ht-llm-marketplace/react
npm publish -w @ht-llm-marketplace/web-component
npm publish -w @ht-llm-marketplace/daemon
npm publish -w @ht-llm-marketplace/cli
```

Publish order matters because package dependencies are versioned.

## 5. Post-Publish Smoke

In a clean folder:

```powershell
npm init -y
npm install @ht-llm-marketplace/cli @ht-llm-marketplace/react @ht-llm-marketplace/web-component
npx htlm init
npx htlm start
```

Then open an embedding app against the daemon URL printed by `htlm start`.

Before publish, the equivalent local clean-room tarball path is:

```powershell
npm run smoke:consumer
```

## 6. Tag And Notes

```powershell
git tag v0.1.0
git push origin v0.1.0
```

Attach screenshots and the verification output summary to the GitHub release.
