# HT Studio Beyond Ollama And LM Studio

Date: 2026-05-31

## Bottom Line

HT Studio can beat Ollama and LM Studio, but not by pretending a wrapper around the same engine is magically faster. Ollama and LM Studio both lean on strong local inference stacks, especially llama.cpp. The winning path is to make HT Studio a smarter local runtime layer:

- Keep the simplest chat path fast by default.
- Use benchmark-driven routing instead of a fixed model list.
- Use delegated llama-server for batching, slots, embeddings, and OpenAI-compatible endpoints.
- Add optional high-throughput engines for machines that can use them.
- Make model discovery, download, verification, deletion, API compatibility, routing, and embeddings into first-class runner features.
- Keep all heavy engines optional so the default install stays light.

The current repo already has the right foundation: daemon, Studio, SDK, Web Component, CLI, Ollama/LM Studio/llama.cpp/OpenAI-compatible adapters, model index, benchmarks, queue, Responses route, embeddings route, Tauri scaffold, and smoke gates. The remaining work is to make the standard chat path use benchmark routing decisions and finish delegated server execution.

## Current Repo Truth

Current readiness should stay grounded in `docs/replacement-readiness.md`.

Observed implementation strengths:

- MIT-licensed repo with local-first daemon and embeddable UI.
- Direct GGUF runtime through `node-llama-cpp`.
- Adapters for Ollama, LM Studio, llama.cpp, and generic OpenAI-compatible endpoints.
- Benchmark storage and `/api/routing/standard` decision logic.
- Optional local embeddings for API parity.
- OpenAI-compatible `/v1/chat/completions`, `/v1/responses`, and `/v1/embeddings` surfaces.
- Delegated `llama-server` manager scaffold with binary discovery, start, stop, and status.
- Windows desktop/Tauri scaffold and package smoke scripts.

Current blockers:

- `apps/studio/src/RunConsole.tsx` still chooses its default standard path from a hard-coded Ollama preference list instead of the daemon's benchmark route.
- Delegated `llama-server` is status/start capable, but chat proxying through that server is still blocked in `packages/daemon/src/server.ts`.
- Release gates are useful, but readiness still needs complete benchmark, Docker, installer, API, and Studio smoke coverage.
- The default in-process engine can only serve one generation at a time; real multi-request throughput needs delegated `llama-server`, vLLM, or SGLang.

## Best Engine Strategy

### 1. Default Path: Permissive llama.cpp / llama-server

Use llama.cpp as the default core because it is MIT licensed, runs GGUF well, supports broad local hardware, and has a server mode with OpenAI-compatible endpoints, embeddings, parallel slots, continuous batching, and speculative decoding.

What HT Studio should add on top:

- Download and verify the correct binary per platform.
- Auto-select CUDA, Vulkan, Metal, or CPU builds.
- Start delegated `llama-server` per selected model.
- Proxy `/v1/chat/completions`, `/v1/embeddings`, and health/metrics through the daemon.
- Expose slots, queue depth, loaded model, context budget, and batch settings in Studio.
- Persist known-good flags per model and hardware.

This can beat Ollama on transparency and raw control, and beat LM Studio by being open, scriptable, embeddable, and evidence-gated.

### 2. High-Throughput Optional Path: vLLM

Add vLLM as an optional engine for Linux/WSL/server-class NVIDIA machines. vLLM is Apache-2.0 and built for throughput, PagedAttention, batching, quantization, and OpenAI-compatible serving.

Use it when:

- User has enough VRAM.
- Model is HF/safetensors/AWQ/GPTQ friendly.
- Multiple concurrent users or agent workers matter more than simple laptop install.

Do not make it default on Windows desktop. It adds Python/CUDA complexity and is worse for the lightweight local Studio promise.

### 3. High-Throughput Optional Path: SGLang

Add SGLang as another optional advanced server backend. It is Apache-2.0 and strong for structured generation, agents, tool use, and high-throughput serving.

Use it for:

- Agentic workflows.
- Structured output and constrained decoding.
- Multi-request server mode.

Keep it behind an advanced install path, like vLLM.

### 4. Cross-Platform Compiled Path: MLC LLM / WebLLM

MLC LLM is Apache-2.0 and valuable for browser, mobile, and edge deployment. It is not the first path for this Windows Studio, but it is strategically important for the embeddable story.

Use it for:

- Browser/WebGPU experiments.
- Mobile or desktop runtimes that should not depend on Ollama/LM Studio.
- Future "drop this into any project" SDK targets.

### 5. Single-File Distribution Path: llamafile

llamafile is Apache-2.0 with upstreamable MIT llama.cpp changes. It is useful for zero-install demos and portable model bundles.

Use it for:

- "Download one file and run" onboarding.
- Portable smoke tests.
- Bundled examples.

Do not make it the main engine if the goal is advanced runtime management, because daemon-level lifecycle, routing, and batching are harder when everything is packed into one file.

### 6. Multi-Modal / OpenAI-Compatible Aggregator: LocalAI

LocalAI is MIT licensed and broad: text, images, audio, and OpenAI-compatible APIs. It is valuable as an optional external backend adapter, not as the core engine.

Use it for:

- Users who want one local OpenAI-compatible server for many modalities.
- Compatibility testing against broader API expectations.

### 7. Desktop Product Reference: Jan

Jan is Apache-2.0 and worth studying for packaging, desktop architecture, and offline user experience. Do not copy its whole app into HT Studio; HT Studio's differentiator should remain local runtime control plus embeddability.

### Avoid As Core Dependencies

- Current Open WebUI releases: useful product reference, but current licensing adds branding restrictions. Pre-v0.6.5 BSD-3 code is more permissive, but building on old UI code is not the best path here.
- KoboldCpp: strong single-file GGUF app, but AGPL-3.0 makes it a poor fit for a permissive HT Studio core.
- text-generation-webui / TextGen: powerful, but AGPL-3.0 and heavier than HT Studio's intended lightweight local-first shape.
- Any model with field-of-use, revenue, branding, or platform restrictions should not be labeled non-restrictive even if it is open-weight.

## Non-Restrictive Model Defaults

Prefer models with unmodified MIT, Apache-2.0, BSD, or similarly permissive terms:

- Qwen 2.5 / Qwen 3 family where the specific model card says Apache-2.0.
- Mistral 7B / Mixtral family where the specific model card says Apache-2.0.
- Microsoft Phi family where the specific model card says MIT.
- Small embedding models with clear Apache/MIT-style licensing.

Do not treat all "open-weight" models as non-restrictive. Llama, Gemma, some Mistral newer models, and many community fine-tunes require per-model license checks.

## How HT Studio Beats Ollama

- Better UI without requiring a separate product.
- Direct GGUF browsing and load-by-path, not only registry-style model refs.
- Verified downloads and manifest-owned delete plans.
- Benchmark-driven standard routing instead of manual guesswork.
- OpenAI-compatible `/v1` plus Ollama-compatible routes in one daemon.
- Embeddable Web Component and SDK for any app.

## How HT Studio Beats LM Studio

- Fully open MIT repo instead of a closed desktop product.
- Headless daemon, CLI, SDK, and embeddable widget, not only a desktop app.
- Scriptable runtime management and compatibility smokes.
- Clear local deletion and storage ownership.
- Optional engines beyond LM Studio's bundled runtime path.
- Benchmark-backed replacement claims instead of marketing language.

## Implementation Roadmap

### Phase 1: Make Current Standard Path Honest

- Replace Studio hard-coded `FAST_STANDARD_MODELS` routing with daemon `/api/routing/standard`.
- Run benchmark matrix automatically after model index refresh.
- Persist first-token, total time, tokens/sec, failure rate, warm state, context size, GPU layers, and backend.
- Auto-warm only the selected route.
- Always fall back to loaded GGUF if standard route is missing or fails.

### Phase 2: Finish Delegated llama-server

- Add installed/bundled llama-server binary management.
- Start server with `--parallel`, `--cont-batching`, context, GPU layers, and optional speculative draft model.
- Proxy OpenAI-compatible chat and embeddings through daemon.
- Show slot/queue/health in Studio.
- Gate the feature with a live concurrency benchmark.

### Phase 3: Advanced Optional Engines

- Add an engine registry with capability metadata: `llamacpp`, `vllm`, `sglang`, `mlc`, `localai`, `ollama`, `lmstudio`.
- Each engine gets install probe, launch command, health probe, supported formats, license metadata, and smoke.
- Keep vLLM/SGLang/MLC/LocalAI opt-in.

### Phase 4: Model License And Fit Intelligence

- Add license allowlist policy: permissive, restricted, unknown.
- Read model card license from Hugging Face and cache it with artifact metadata.
- Warn before downloading restricted or unknown-license models.
- Prefer Qwen/Mistral/Phi permissive models for defaults.
- Recommend quant by actual VRAM/RAM and benchmark history, not only file size.

### Phase 5: Distribution Readiness

- Build real Windows installer and tray daemon lifecycle.
- Make Docker smoke required for release claims on machines with Docker.
- Add one-command `htlm doctor`.
- Keep replacement claims tied to passing checks on the target machine.

## Practical Ranking

Best near-term path:

1. llama.cpp delegated server as the default engine.
2. benchmark-driven routing and auto-warm as the default Studio behavior.
3. vLLM and SGLang as optional advanced server backends.
4. MLC/WebLLM for future embeddable/browser/mobile runtime.
5. LocalAI as optional multimodal compatibility backend.

The fastest way to a credible win is not more UI. It is benchmark-backed standard routing plus real delegated llama-server continuous batching across the desktop app, daemon, CLI, SDK, and embeddable widget.

## Sources Checked

- llama.cpp license and server/speculative docs.
- vLLM Apache-2.0 repository and project docs.
- SGLang Apache-2.0 project docs.
- MLC LLM Apache-2.0 repository.
- llamafile Apache-2.0 repository.
- LocalAI MIT docs/repository.
- Jan Apache-2.0 repository.
- Open WebUI license documentation.
- KoboldCpp and text-generation-webui license surfaces.
- Qwen, Mistral, and Phi model-license references.
