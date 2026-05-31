# Replacement Readiness

HT Local LLM Marketplace is not allowed to claim "best open-source replacement" until the evidence below is green.

## Current Claim

Current status: foundation.

The project has a local daemon, embeddable marketplace, direct GGUF engine path, Hugging Face and Ollama-library download paths, basic Ollama/OpenAI-compatible APIs, CLI expansion, cached model index, benchmark endpoint, queue status, artifact verification, and local document-search scaffolding.

## Required Gates

- Release gate: `npm run release:check`
- Artifact cleanliness: `npm run check:artifacts`
- API parity smoke: `/api/chat`, `/api/tags`, `/v1/models`, `/v1/chat/completions`, `/v1/responses`, `/v1/embeddings`
- CLI smoke: `htlm serve`, `pull`, `run`, `list`, `rm`, `bench`, `doctor`
- Distribution smoke: Docker daemon boots and answers `/health`
- Runtime proof: benchmark table records first-token, total time, tokens/sec, failures
- LM Studio-class proof: document chat with local citations
- Blocker design: `docs/superpowers/plans/2026-05-30-replacement-blockers.md`

## Remaining Blockers

The active implementation design is in `docs/superpowers/plans/2026-05-30-replacement-blockers.md`.

- Real local embeddings: optional Transformers.js backend, OpenAI-compatible `/v1/embeddings`, vector storage, and document citation search.
- Fuller Responses API parity: response object shape, local response storage, event-named streaming, tool/JSON compatibility boundaries.
- Runtime controls: persistent config for keep-warm, unload timeout, context size, GPU layers, threads, draft model validation, and delegated `llama-server` mode.
- Windows distribution: lightweight Tauri shell, tray controls, NSIS/MSI build, clean uninstall, and model-storage migration docs.
- Public proof: generated compatibility smoke, scorecard gate, benchmark evidence, and claim guardrails.

## Competitor Scorecard

The live daemon exposes `GET /api/compatibility/scorecard`. Its `claim` field must not move beyond `foundation` until benchmark and compatibility proof exists.

## Distribution

Headless Docker:

```bash
docker build -t ht-llm-marketplace .
docker run --rm -p 3001:3001 ht-llm-marketplace
```

CLI:

```bash
htlm serve
htlm list
htlm pull qwen2.5:0.5b
htlm run qwen2.5:0.5b "hi"
htlm bench qwen2.5:0.5b
```

Windows installer/tray packaging is still a readiness gate, not a completed claim.
