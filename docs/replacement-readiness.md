# Replacement Readiness

HT Local LLM Marketplace and HT Studio focus on a narrow product goal: a fast local model marketplace plus replacement LLM runner.

## Current Status

The project has a local daemon, embeddable marketplace, direct GGUF engine path, Hugging Face and Ollama-library download paths, Ollama/OpenAI-compatible APIs, CLI commands, cached model index, benchmark endpoint, generation queue, artifact verification, runtime controls, and a lightweight Windows desktop scaffold.

## Required Gates

- Release gate: `npm run release:check`
- FDE/customer proof gate: `npm run release:fde-check`
- Artifact cleanliness: `npm run check:artifacts`
- API compatibility smoke: `/api/chat`, `/api/generate`, `/api/show`, `/api/ps`, `/api/tags`, `/v1/models`, `/v1/completions`, `/v1/chat/completions`, `/v1/responses`, `/v1/embeddings`
- Server quality smoke: `npm run smoke:server-quality` starts the compiled daemon, checks `/api/server/readiness`, verifies OpenAI/Ollama server surfaces, and runs warm plus concurrent generation when a local model is indexed.
- Replacement gauntlet: `npm run smoke:server-gauntlet` covers real wire-shape compatibility, streaming, abort cleanup, mixed concurrency soak, delegated-server status, bad-model handling, `htlm serve` boot behavior, and advanced endpoint payload edge cases. Set `HT_GAUNTLET_SOAK_LOOPS`, `HT_GAUNTLET_REQUIRE_MODEL=1`, or `HT_GAUNTLET_REQUIRE_DELEGATED=1` to make the gate stricter.
- Delegated llama-server proof: `npm run smoke:delegated-server` requires a physical chat GGUF, installs or discovers `llama-server`, switches the daemon to delegated mode, verifies direct delegated health/models, exercises OpenAI/Ollama non-stream and streaming routes through the daemon, confirms embeddings succeed through delegated proxy or deterministic local fallback, checks concurrency, then stops the delegated process. Set `HT_DELEGATED_AUTO_INSTALL=0`, `HT_DELEGATED_REQUIRE_INSTALL=1`, `LLAMA_SERVER_BIN`, `LLAMA_SERVER_MODEL`, or `HT_DELEGATED_LLAMA_RELEASE` for stricter/reproducible runs.
- CLI smoke: `htlm serve`, `pull`, `run`, `list`, `rm`, `bench`, `doctor`
- Distribution smoke: Docker daemon boots and answers `/health`; strict Docker smoke now runs when Docker Desktop is available.
- Runtime benchmarks: first-token latency, total time, tokens/sec, and failure rate

## Remaining Runner Work

- Wire Studio's default standard run path directly to daemon benchmark routing.
- Expand compatibility smoke into real client fixtures for Ollama, LM Studio, OpenAI-compatible clients, Jan, and LocalAI.
- Finish Windows clean install, tray runtime behavior, uninstall, and model-storage migration proof. The Tauri app now builds NSIS and MSI bundles.
- Keep default hash embeddings framed as API compatibility fallback; use Transformers.js or delegated embedding models for semantic embedding quality.

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

Windows NSIS/MSI bundle generation is proven. Clean install, tray runtime behavior, uninstall, and model-storage migration remain readiness gates before a polished desktop release claim.
