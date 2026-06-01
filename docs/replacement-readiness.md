# Replacement Readiness

HT Local LLM Marketplace and HT Studio focus on a narrow product goal: a fast local model marketplace plus replacement LLM runner.

## Current Status

The project has a local daemon, embeddable marketplace, direct GGUF engine path, Hugging Face and Ollama-library download paths, Ollama/OpenAI-compatible APIs, CLI commands, cached model index, benchmark endpoint, generation queue, artifact verification, runtime controls, and a lightweight Windows desktop scaffold.

## Required Gates

- Release gate: `npm run release:check`
- Artifact cleanliness: `npm run check:artifacts`
- API compatibility smoke: `/api/chat`, `/api/generate`, `/api/show`, `/api/ps`, `/api/tags`, `/v1/models`, `/v1/completions`, `/v1/chat/completions`, `/v1/responses`, `/v1/embeddings`
- Server quality smoke: `npm run smoke:server-quality` starts the compiled daemon, checks `/api/server/readiness`, verifies OpenAI/Ollama server surfaces, and runs warm plus concurrent generation when a local model is indexed.
- CLI smoke: `htlm serve`, `pull`, `run`, `list`, `rm`, `bench`, `doctor`
- Distribution smoke: Docker daemon boots and answers `/health`
- Runtime benchmarks: first-token latency, total time, tokens/sec, and failure rate

## Remaining Runner Work

- Wire Studio's default standard run path directly to daemon benchmark routing.
- Finish delegated `llama-server` chat proxying for continuous batching and better concurrency.
- Expand compatibility smoke into real client fixtures for Ollama, LM Studio, OpenAI-compatible clients, Jan, and LocalAI.
- Finish Windows packaging with clean install, tray, uninstall, and model-storage migration behavior.
- Keep optional embeddings for API parity; keep the core Studio shell focused on marketplace and model running.

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
