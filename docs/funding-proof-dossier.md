# HT Local LLM Marketplace Funding Proof Dossier

Date: 2026-06-02
Applicant: HASS TECH LLC
Focus: Local-first AI infrastructure, private model supply chains, and edge inference tooling

## Executive Snapshot

HT Local LLM Marketplace is a lightweight local-first model marketplace and runtime control plane. It helps developers discover, install, verify, run, embed, and safely remove local model artifacts without sending private prompts or documents to a remote AI provider.

The product boundary is intentionally small: this repo contains the control plane, CLI, SDK, React UI, Web Component, daemon, and Studio shell. Large model weights, runtime caches, desktop build output, and downloaded GGUF files remain user-machine payloads outside the publishable source footprint.

## Proof Asset Map

| Use | Asset |
| --- | --- |
| GitHub README and product overview | [`assets/marketplace-desktop.png`](assets/marketplace-desktop.png) |
| Mobile/responsive proof | [`assets/marketplace-mobile.png`](assets/marketplace-mobile.png) |
| Advanced quantization proof | [`assets/marketplace-advanced-matrix.png`](assets/marketplace-advanced-matrix.png) |
| Demo video for resume/funding submissions | [`assets/marketplace-demo.webm`](assets/marketplace-demo.webm) |
| Terminal surface proof | [`assets/terminal-marketplace.svg`](assets/terminal-marketplace.svg) |
| Terminal screenshot proof | [`assets/terminal-usability.png`](assets/terminal-usability.png) |
| Terminal video proof | [`assets/terminal-demo.webm`](assets/terminal-demo.webm) |
| Real CLI transcript | [`proofs/terminal-logs/cli-usability-transcript.txt`](proofs/terminal-logs/cli-usability-transcript.txt) |
| System doctor evidence | [`proofs/terminal-logs/terminal-doctor-scan.json`](proofs/terminal-logs/terminal-doctor-scan.json) |
| Verification summary example | [`proofs/terminal-logs/peak-preflight-log.txt`](proofs/terminal-logs/peak-preflight-log.txt) |
| React integration snippet | [`proofs/code-snippets/embed-snippet-react.tsx`](proofs/code-snippets/embed-snippet-react.tsx) |
| Vanilla Web Component snippet | [`proofs/code-snippets/embed-snippet-vanilla.html`](proofs/code-snippets/embed-snippet-vanilla.html) |
| Local audit schema | [`proofs/code-snippets/sqlite-audit-schema.sql`](proofs/code-snippets/sqlite-audit-schema.sql) |

## Technical Merit

- Local-first control plane: daemon, CLI, SDK, UI, and OpenAI-compatible `/v1` routes all target local loopback workflows.
- Embeddable product surface: host apps can use the React package, Web Component, SDK, CLI, or OpenAI-compatible endpoint.
- Safe lifecycle management: installed artifacts are tracked through local inventory, verification metadata, explicit privileged-action headers, and delete-plan evidence.
- Hardware-aware UX: marketplace views surface model size, local fit, GPU memory implications, and advanced quantization choices before users download or run large files.
- Small publishable footprint: package-size budgets and artifact-cleanliness gates keep generated build output, model payloads, and proof duplication out of the repo.

## Demo Script For Resume Or Funding Video

1. Open the marketplace and show the desktop model discovery screen.
2. Select a model and show size, license, source facts, and local-fit context.
3. Open Advanced mode to show the quantization matrix and hardware fit warnings.
4. Resize to the mobile viewport to show responsive behavior.
5. Switch to terminal proof and show `htlm init --target terminal`, `htlm status`, and OpenAI-compatible endpoint setup.
6. Close by explaining that the control plane stays small while model files remain local and user-owned.

## Funding Application Language

### Small Business Digital Readiness

HT Local LLM Marketplace reduces dependency on remote AI subscriptions by letting small teams run compatible local models on hardware they already own. The system provides a clean developer path through CLI commands, embeddable UI components, and OpenAI-compatible endpoints, making private local AI adoption practical for small businesses without forcing a full platform rewrite.

### Defense And Tactical Edge

The project is designed for local-first operation in constrained or disconnected environments. Its loopback daemon, explicit privileged-action controls, local inventory, and offline model execution path reduce exposure to remote network services while preserving a familiar OpenAI-compatible integration model for existing tools.

### Technical Innovation And Research Merit

The main technical value is not a single model. It is the control layer around local model supply chains: model discovery, hardware-fit evaluation, artifact verification, runtime routing, portable embedding, terminal lifecycle commands, and safety-gated deletion. That layer helps developers compose local inference systems without hand-building every runtime and lifecycle control from scratch.

### Commercial Growth

The marketplace can be packaged as a developer tool, embedded into client products, or used as the local AI control plane behind custom consulting work. The strongest commercial wedge is privacy-preserving AI enablement for regulated or cost-sensitive teams that want local execution while keeping a polished app surface.

## Verification Commands

Use fresh command output before making public release claims:

```powershell
npm run docs:assets
npm run docs:terminal
npm run smoke:docs
npm run check:artifacts
npm run release:check
```

Do not claim benchmark numbers, cost reduction percentages, or production readiness unless the matching evidence has been regenerated for the current machine and current commit.
