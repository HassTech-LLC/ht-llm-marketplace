# HT Local LLM Marketplace Proof Suite Audit

Date: 2026-06-02

This audit describes the proof assets that support repository presentation, resume material, demos, and funding applications.

## Current Proof Layout

Visual proof assets are canonical under [`../assets`](../assets):

- [`../assets/marketplace-desktop.png`](../assets/marketplace-desktop.png)
- [`../assets/marketplace-mobile.png`](../assets/marketplace-mobile.png)
- [`../assets/marketplace-advanced-matrix.png`](../assets/marketplace-advanced-matrix.png)
- [`../assets/marketplace-demo.webm`](../assets/marketplace-demo.webm)
- [`../assets/terminal-marketplace.svg`](../assets/terminal-marketplace.svg)
- [`../assets/terminal-usability.png`](../assets/terminal-usability.png)
- [`../assets/terminal-demo.webm`](../assets/terminal-demo.webm)
- [`../assets/embed-surfaces.svg`](../assets/embed-surfaces.svg)
- [`../assets/github-social-preview.png`](../assets/github-social-preview.png)

Supplemental proof material stays under this folder:

- [`terminal-logs/cli-usability-transcript.txt`](terminal-logs/cli-usability-transcript.txt)
- [`terminal-logs/terminal-doctor-scan.json`](terminal-logs/terminal-doctor-scan.json)
- [`terminal-logs/peak-preflight-log.txt`](terminal-logs/peak-preflight-log.txt)
- [`code-snippets/embed-snippet-react.tsx`](code-snippets/embed-snippet-react.tsx)
- [`code-snippets/embed-snippet-vanilla.html`](code-snippets/embed-snippet-vanilla.html)
- [`code-snippets/sqlite-audit-schema.sql`](code-snippets/sqlite-audit-schema.sql)
- [`text-narratives/security-and-privacy.md`](text-narratives/security-and-privacy.md)
- [`text-narratives/technical-innovation-and-merit.md`](text-narratives/technical-innovation-and-merit.md)
- [`text-narratives/business-value-and-democratization.md`](text-narratives/business-value-and-democratization.md)

## Bloat Decision

Do not duplicate screenshots or videos under `docs/proofs`. Binary media lives once in `docs/assets` so the README, docs index, funding dossier, and proof audit all reference the same current captures.

The release artifact gate rejects regenerated `docs/proofs/screenshots`, `docs/proofs/videos`, root runtime logs, Tauri `target`, Tauri `gen`, and root `PROJECT_MEMORY.md` files.

## Usability Coverage

The current visual and terminal set demonstrates:

- Desktop marketplace discovery and detail review.
- Mobile responsive behavior at a 390px viewport.
- Advanced quantization matrix review.
- A recorded browser walkthrough in WebM format.
- Terminal integration targets, agent profile setup, and CLI initialization flow.
- React, vanilla HTML, and SQLite audit snippets for reuse in proposals.

## Remaining Rule

Before using these assets publicly, regenerate the visual set with:

```powershell
npm run docs:assets
npm run smoke:docs
```

For a full release-quality claim, run:

```powershell
npm run release:check
```
