# Absolute Peak Readiness

HT LLM Marketplace can only claim "best open-source replacement" when the proof gate says it can.

## Required Gates

- `npm run release:check`
- `npm run scorecard:gate`
- `npm run smoke:installer`
- `npm run smoke:studio`
- `HT_DOCKER_SMOKE_REQUIRED=1 npm run smoke:docker` on a machine with Docker
- At least one successful benchmark for each default standard-route model
- Compatibility scorecard claim is `best-replacement`

## Standard Fast Path

There is no Turbo mode. The standard path is the fast path:

- The daemon keeps a cached model index.
- `/api/routing/standard` chooses the fastest healthy indexed model from benchmark history.
- `/api/chat`, `/v1/chat/completions`, `/v1/responses`, and document chat can load that standard route when no model is already loaded.
- Failing models are deprioritized automatically.

## Current Claim Policy

The public claim remains locked below `best-replacement` until every gate is pass. Partial gates are intentionally visible in Studio under `Proof`.
