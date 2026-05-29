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
npm run release:check
```

`release:check` runs typecheck, tests, build, dry-pack, and external package smoke.

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

## 6. Tag And Notes

```powershell
git tag v0.1.0
git push origin v0.1.0
```

Attach screenshots and the verification output summary to the GitHub release.
