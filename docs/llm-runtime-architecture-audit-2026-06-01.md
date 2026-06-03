# LLM runtime architecture audit - 2026-06-01

## Scope

This audit looked at HT Studio's current `node-llama-cpp` / `llama-server` integration and the current upstream source trees for the major open-source runtime families:

| Runtime | Local source snapshot | Where it wins |
| --- | --- | --- |
| `llama.cpp` / `llama-server` | `ggml-org/llama.cpp` `6f165c1c64f7` / 2026-05-31 | Small portable GGUF runtime, broad CPU/GPU support, easiest local desktop bundling |
| `node-llama-cpp` | `withcatai/node-llama-cpp` `f655fd9f5ab9` / 2026-05-24 | Best JS/TS in-process binding to llama.cpp, stable chat/session APIs, good embedded UX |
| `vLLM` | `vllm-project/vllm` `8b8546da1c3b` / 2026-05-31 | Server-class PyTorch/HF serving with PagedAttention, prefix caching, chunked prefill, async scheduling |
| `SGLang` | `sgl-project/sglang` `373cadc92ea4` / 2026-05-31 | Cutting-edge structured/programmatic serving, RadixAttention, overlap scheduling, disaggregated prefill/decode |
| `MLC LLM` | `mlc-ai/mlc-llm` `2008fe8343e1` / 2026-05-11 | Compiled cross-platform deployment, TVM/WebGPU/mobile/browser strategy |
| `WebLLM` | `mlc-ai/web-llm` `9e572d6ed95e` / 2026-05-27 | Browser/WebGPU, WebWorker/ServiceWorker isolation, persistent artifact cache |
| `TensorRT-LLM` | `NVIDIA/TensorRT-LLM` `54259ed5d232` / 2026-05-31 | NVIDIA-only maximum-throughput deployment with explicit engine build and C++ executor APIs |
| `MLX` | `ml-explore/mlx` `7df341c09052` / 2026-06-01 | Apple Silicon unified memory, Metal backend, lazy evaluation |
| `mlx-lm` | `ml-explore/mlx-lm` `df1d3f3c9a7a` / 2026-05-04 | Apple local LLM serving/generation, prompt cache files, KV quantization, draft-model speculative decoding |

The full audit sources were checked out into a local temporary/reference workspace during the audit and are intentionally not vendored into this repository.

On Windows, the TensorRT-LLM checkout required `git config --global core.longpaths true`; the repo contains paths that exceed the default Windows filename limit.

## Bottom line

`llama.cpp` / `llama-server` is still the right default engine family for HT Studio because HT Studio's product promise is local-first, model-file-friendly, Windows-friendly, and embeddable. It is not the absolute fastest runtime for every environment, but it is the strongest base for a local desktop marketplace that must run GGUF models without making users operate a Python/CUDA serving stack.

The best product is not a literal merge of Node, `llama-server`, vLLM, SGLang, MLC, TensorRT-LLM, and MLX into one binary. That would make the product larger, harder to update, and worse on machines that do not match the chosen backend. The better design is one HT Runtime Control Plane:

1. Use managed `llama-server` as the default high-throughput local GGUF service backend.
2. Keep `node-llama-cpp` as the in-process embedded fallback and single-user fast path.
3. Add OpenAI-compatible adapters for vLLM and SGLang when the user has a server-class GPU or external service.
4. Add MLC/WebLLM for browser, widget, mobile, and WebGPU deployment.
5. Add MLX on Apple Silicon.
6. Treat TensorRT-LLM as an advanced NVIDIA export/serving target, not the default desktop path.

## HT Studio current integration gaps

### 1. Delegated `llama-server` is scaffolded, not turnkey

HT Studio has `packages/daemon/src/runtime/llama-server.ts`, but the installed `node-llama-cpp` prebuilts do not include `llama-server.exe`, and no PATH binary was found during the audit. That means the higher-throughput server mode exists conceptually but cannot yet be trusted as a zero-config product path.

Required improvement:

- Add a managed `llama-server` install/build/download step into an HT-owned tools directory.
- Store the resolved binary path, build number, backend, and health status in daemon state.
- Add a real smoke sequence: start server, wait for `/health`, call `/v1/models`, perform one streaming `/v1/chat/completions` request, then stop cleanly.

### 2. Persisted runtime config is not fully applied to delegated startup

Studio exposes delegated port, parallel slots, and continuous batching, but daemon startup currently constructs `LlamaServerManager` mainly from env and then calls `start()` without fully rebuilding options from the persisted runtime config.

Required improvement:

- Rehydrate persisted runtime config before `llama-server` start.
- Use the selected route/model as `--model` when `LLAMA_SERVER_MODEL` is unset.
- Pass persisted `parallel`, `continuousBatching`, port, cache settings, embeddings/rerank profile, and model directory into the actual start args.

### 3. Upstream `llama-server` has performance knobs HT Studio does not expose

Current upstream `llama-server` already includes useful controls:

- `--parallel`
- `--threads-http`
- `--cont-batching`
- `--cache-ram`
- `--cache-idle-slots`
- `--cache-reuse`
- `--slot-prompt-similarity`
- `--slots`
- `--slot-save-path`
- `--kv-unified`
- `--embedding`
- `--rerank`
- `--models-dir`

Required improvement:

- Add an advanced but safe config profile for `llama-server`.
- Start with conservative defaults: continuous batching on, cache reuse around 256 tokens for repeated prompts, slots endpoint enabled for telemetry, and idle-slot caching when memory allows.
- Keep chat, embedding, and rerank as separate server profiles so HT Studio does not accidentally route embedding calls to a chat-only server.

### 4. The in-process engine intentionally serializes generation

The current `node-llama-cpp` path uses a single chat session plus a busy guard. That is stable and simple, but it cannot match server-style continuous batching under concurrent load.

Required improvement:

- Keep in-process generation for single-user embedded use, offline fallback, direct grammar/session control, and simple installs.
- Prefer delegated `llama-server` for multi-request throughput.
- Only add a small in-process session pool after GPU proof and memory telemetry are reliable.

### 5. Engine currency must track llama.cpp build number, not only npm package version

The installed `node-llama-cpp@3.18.1` is npm-current, but its bundled llama.cpp release is older than upstream. That can make a package appear current while the core runtime is stale for newly added architectures.

Required improvement:

- Track npm package version and bundled llama.cpp build separately.
- Show "npm latest but llama.cpp core stale" as a distinct diagnostic.
- Maintain an architecture capability table tied to upstream llama.cpp support.

## What to borrow from each runtime

### Borrow from vLLM

vLLM's strongest ideas are not its Python dependency stack; they are the serving policies:

- Token-budget scheduler instead of request-count-only scheduling.
- Paged KV cache ownership with explicit allocation/preemption.
- Chunked prefill enabled by default for long prompts.
- Prefix-cache hit accounting and telemetry.
- Async scheduling to reduce GPU idle gaps.
- External KV connector and disaggregated prefill/decode concepts for future advanced deployments.

HT Studio can borrow these as product concepts: runtime benchmarks, queue admission, prefix-cache telemetry, and adapter capability labels. It should not reimplement vLLM's scheduler in TypeScript for GGUF today.

### Borrow from SGLang

SGLang's most relevant source ideas:

- Radix prefix cache with page-size tradeoffs.
- Overlap scheduling where CPU scheduling work is overlapped with GPU execution.
- Prefill delayer and dynamic new-token-ratio logic.
- Retraction/preemption when KV memory becomes tight.
- Strong structured-output backends and constrained decoding integration.
- Multi-LoRA and cache namespace separation.

HT Studio should borrow the session/prefix-cache model for repeated project/system prompts and should tag cache entries by model, LoRA/adapters, grammar/schema, and conversation id.

### Borrow from MLC LLM and WebLLM

MLC/WebLLM wins when the runtime has to leave the desktop daemon:

- Compiled model manifests.
- Browser/WebGPU execution.
- WebWorker and ServiceWorker isolation.
- Persistent artifact caches such as Cache API, IndexedDB, OPFS, and cross-origin cache backends.
- OpenAI-like browser APIs.

HT Studio should treat MLC/WebLLM as the future "embed this model into a web widget" lane, not as the main Windows desktop replacement for `llama.cpp`.

### Borrow from TensorRT-LLM

TensorRT-LLM is valuable as an engineering reference for high-end NVIDIA serving:

- Explicit capacity scheduler plus micro-batch scheduler split.
- Dynamic batch sizing.
- Context chunking policies.
- KV cache reuse accounting where reused prefix tokens are not charged as full compute.
- LoRA-aware request sorting.
- Detailed executor and performance metrics.

HT Studio should expose TensorRT-LLM as an advanced export/server adapter for NVIDIA-heavy users. Making it the default would harm portability and product size.

### Borrow from MLX and mlx-lm

MLX is the right Apple Silicon lane:

- Unified memory and Metal-native execution.
- Lazy evaluation and stream control.
- Prompt cache files.
- KV cache quantization with configurable start threshold.
- Draft-model speculative decoding.

HT Studio should add an optional MLX adapter on macOS, especially for users with large unified memory machines. It should not influence the Windows default path except through shared UX concepts like prompt-cache files and KV telemetry.

### Borrow from llama.cpp / llama-server itself

The best short-term gains are already in upstream `llama-server`:

- Slots.
- Continuous batching.
- Prompt cache RAM.
- Idle slot cache.
- Cache reuse.
- Slot prompt similarity.
- Unified KV options.
- Embeddings and rerank modes.
- Router mode and model directory.

HT Studio should expose these before attempting a custom scheduler.

## Proposed runtime architecture

```text
Studio UI / SDK / CLI
        |
        v
HT Runtime Control Plane
        |
        +-- Local GGUF default: managed llama-server
        |       - health checked
        |       - OpenAI-compatible
        |       - slots + cache telemetry
        |
        +-- Embedded fallback: node-llama-cpp
        |       - direct JS/TS binding
        |       - single-user sessions
        |       - grammar/schema/session tooling
        |
        +-- Server GPU adapters: vLLM / SGLang
        |       - OpenAI-compatible endpoints
        |       - benchmark-driven promotion
        |       - remote/local Python stack allowed
        |
        +-- Browser/mobile adapter: MLC/WebLLM
        |       - WebGPU and artifact caches
        |       - embeddable widget path
        |
        +-- Apple adapter: MLX
        |       - Apple Silicon optimized
        |
        +-- NVIDIA export adapter: TensorRT-LLM
                - advanced deployment lane
```

The control plane should record capability data for each runtime:

- Model format: GGUF, HF/safetensors, MLC artifact, MLX, TensorRT engine.
- Hardware: CPU, Vulkan, CUDA, ROCm, Metal, WebGPU.
- APIs: OpenAI chat, Responses, embeddings, rerank, grammar/schema, tools.
- Performance: time to first token, prefill tokens/sec, decode tokens/sec, concurrent throughput, memory/VRAM.
- Product traits: portable, managed install, browser-safe, server-only, advanced setup.

## Roadmap

### Phase 1: Make managed `llama-server` real

- Install or build a vetted `llama-server.exe`.
- Add version/backend detection.
- Add health-checked lifecycle management.
- Add smoke tests for `/health`, `/v1/models`, streaming chat, and clean shutdown.

### Phase 2: Wire runtime config end to end

- Rehydrate persisted delegated config at startup.
- Pass advanced `llama-server` cache/slot flags.
- Apply sanitized runtime config to standard-route in-process loads.
- Record selected backend, GPU API, context size, batch size, cache settings, and model path in diagnostics.

### Phase 3: Add real benchmarks and routing

- Benchmark `node-llama-cpp` vs managed `llama-server` on the same GGUF.
- Measure first token, prefill, decode, concurrent requests, memory, and error rate.
- Promote `llama-server` automatically for concurrent throughput only after proof.

### Phase 4: Add server-class adapters

- Add vLLM and SGLang as OpenAI-compatible runtime targets.
- Do not vendor their internals.
- Require explicit capability proof and benchmark data before marking either as preferred.

### Phase 5: Add deployment-specialized adapters

- Add MLC/WebLLM for browser/widget mode.
- Add MLX for macOS/Apple Silicon.
- Add TensorRT-LLM as an advanced NVIDIA export/deploy lane.

### Phase 6: Add HT session-cache strategy

- Conversation/system prompt warming.
- Project prompt prefix reuse.
- Slot save/restore where supported.
- Prefix-cache stats in Studio.
- Cache namespaces keyed by model, adapter, LoRA, grammar/schema, and conversation id.

## What not to do

- Do not replace `llama.cpp` as the default local runtime just because vLLM/SGLang/TensorRT can be faster in server-class conditions.
- Do not remove `node-llama-cpp`; it remains valuable for in-process embedding, fallback, and low-friction JS integration.
- Do not build a custom TypeScript scheduler before using upstream `llama-server`'s existing slots/cache/batching features.
- Do not make TensorRT-LLM the default; it is too NVIDIA/CUDA/TensorRT-specific for the portable desktop product.
- Do not claim "fastest" from static inspection. Promotion must be benchmark-driven on the user's hardware.

## Best possible product direction

The best HT Studio runtime strategy is:

1. `llama.cpp` remains the trusted portable core.
2. `llama-server` becomes the managed default service mode.
3. `node-llama-cpp` remains the embedded fallback and single-session engine.
4. vLLM/SGLang become optional high-throughput server adapters.
5. MLC/WebLLM becomes the browser/mobile/embed lane.
6. MLX becomes the Apple Silicon lane.
7. TensorRT-LLM becomes the advanced NVIDIA deployment lane.

That gives HT Studio the best properties of each project without inheriting all of their operational cost in the default install.
