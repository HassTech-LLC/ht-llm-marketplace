# llama.cpp / llama-server audit - 2026-05-31

## Setup truth

HT Studio does not currently have two durable standalone upstream source repos checked into the project. The local runtime stack is:

- `node-llama-cpp@3.18.1` installed under the daemon dependency tree.
- Bundled llama.cpp metadata from `ggml-org/llama.cpp` release `b8390`.
- `llama-server` integration code in `packages/daemon/src/runtime/llama-server.ts`, but no `llama-server.exe` binary was found on PATH or inside the installed `@node-llama-cpp/*` prebuilts.
- Fresh read-only upstream audit clones were placed under `%TEMP%/codex-llama-audit`:
  - `ggml-org/llama.cpp` at `6f165c1` / described tag `b9444`
  - `withcatai/node-llama-cpp` at `f655fd9`

`llama-server` is a subsystem/binary from the llama.cpp repo, not a separate normal upstream repo.

## Live runtime evidence

`npm view node-llama-cpp version` reports `3.18.1`, so the installed package is current on npm, but its bundled llama.cpp release is still `b8390` while upstream llama.cpp is around `b9444`.

`node-llama-cpp` reports Vulkan as available, and a normal Node runtime path selects Vulkan. The earlier CPU-fallback signal was a bad proof command: running `node --input-type=module -e ...` caused `node-llama-cpp`'s forked `testBindingBinary.js` child to inherit `--input-type=module`, which Node rejects when executing a file. The proper proof command is `npm run engine:gpu-proof`, which runs from a real `.mjs` file and does not poison the child process.

## Highest-impact findings

### 1. GPU proof must be automated and use the real daemon invocation shape

The fastest path is viable on this machine because `getLlama()` selects Vulkan when run correctly. The P0 issue is making this proof repeatable in CI/dev checks so bad test invocations do not create false CPU-fallback conclusions.

Recommended fixes:

- Keep `npm run engine:gpu-proof` as the canonical local proof command.
- Add a daemon startup GPU self-test that records `getLlamaGpuTypes()` and actual `getLlama().gpu`; warn when available GPU types exist but the selected runtime is CPU.
- Avoid `node --input-type=module -e` for native binding proof because it breaks forked file execution.
- Add a controlled source-build lane that disables fragile native AVX512/BF16 assumptions on Windows Clang or uses the known-good MSVC/CMake generator combination for cases where prebuilts are unavailable.
- Keep Ollama fallback as a runtime safety path until the local binding test returns GPU.

### 2. We do not have a usable managed llama-server binary yet

`LlamaServerManager` can discover and start an external `llama-server`, but the installed npm prebuilts do not provide `llama-server.exe`, and no PATH binary was found. That means delegated mode is scaffolded but not turnkey.

Recommended fixes:

- Add a first-class `llama-server` installer/build step that either downloads a vetted llama.cpp release binary or builds one into an HT-owned tools directory.
- Store the resolved binary path and version in daemon state.
- Add a compatibility smoke that starts `llama-server`, waits for `/health`, calls `/v1/models`, and performs one streaming `/v1/chat/completions` request.

### 3. Runtime config is saved but not fully wired into llama-server startup

Studio exposes delegated port, parallel slots, and continuous batching, but `createContext()` constructs `LlamaServerManager` from env values only. `/api/engine/server/start` calls `context.llamaServer.start()` without rebuilding options from `store.getRuntimeConfig()`.

Recommended fixes:

- Recreate or reconfigure `LlamaServerManager` from persisted runtime config at start time.
- Use the selected model or standard-route decision as `--model` when `LLAMA_SERVER_MODEL` is not set.
- Pass persisted `parallel` and `continuousBatching` into the start args.

### 4. llama-server current upstream has performance knobs we do not expose

Current llama.cpp server supports useful options beyond our minimal `--model`, `--port`, `--parallel`, and `--cont-batching` start args:

- prompt cache RAM: `--cache-ram`
- idle slot caching: `--cache-idle-slots`
- prompt reuse threshold: `--cache-reuse`
- slot prompt matching: `--slot-prompt-similarity`
- slot monitoring: `--slots`
- slot save path: `--slot-save-path`
- embeddings mode: `--embedding`
- rerank mode: `--rerank`
- router server model directory: `--models-dir`

Recommended fixes:

- Add a "llama-server advanced" config block with safe defaults: cache RAM enabled, `cache-reuse` around 256 for repeated prompts, slots endpoint enabled, and slot similarity retained.
- Read `/slots` and expose active slot/cache telemetry in Studio.
- Keep embeddings/rerank as separate server profiles so chat models are not accidentally used for embedding endpoints.

### 5. In-process engine serializes all generation

`LlamaEngine.chat()` uses a single session and a `busy` guard. This is stable, but it means one request at a time. The upstream server path supports slots and continuous batching; node-llama-cpp also exposes lower-level context sequence primitives that could support a small pool.

Recommended fixes:

- Prefer delegated llama-server for multi-request throughput.
- For the in-process fallback, add a small `LlamaChatSession` pool keyed by conversation id only after GPU is restored.
- Keep current queue semantics for memory safety on large models.

### 6. Standard-route model loading ignores some persisted performance controls

`loadStandardRouteModel()` loads the selected model without applying persisted `contextSize`, `threads`, `gpuLayers`, or `draftModel` from runtime config. Explicit load requests can carry those options, but default standard chat does not.

Recommended fixes:

- Apply sanitized runtime config to standard-route loads.
- If a configured draft model exists and is present in the index, pass it into `engine.load()` for speculative decoding.
- Include the applied runtime config in route/debug telemetry.

### 7. Engine currency gate is too narrow

The current local package is npm-latest but still bundles llama.cpp `b8390`; upstream is around `b9444`. The existing architecture gate mainly knows about selected newer architectures such as `gemma4 >= b8637`.

Recommended fixes:

- Track upstream llama.cpp release/build number separately from npm package version.
- Maintain a small architecture capability table generated from current upstream conversion/runtime support.
- Show "npm latest but llama.cpp core stale" distinctly from "npm package update available."

## Practical next implementation order

1. Fix GPU self-test and diagnostics so the app cannot silently call the core "fast" while running CPU.
2. Add a managed llama-server install/build path and health-checked startup.
3. Wire runtime config into delegated startup and standard-route loading.
4. Expose llama-server cache/slot knobs with safe defaults.
5. Add delegated-server smoke tests that prove real continuous batching and OpenAI-compatible streaming.
6. After GPU and delegated server are real, benchmark in-process vs delegated across first-token latency, tokens/sec, and concurrent requests.

## Verification run during audit

- `npm run check` passed on the current tree.
- `getLlamaGpuTypes()` returned `["vulkan", false]`.
- `getLlama()` returned Vulkan when invoked through the proper Node runtime path.
- `node-llama-cpp inspect gpu` reported Vulkan available with NVIDIA GeForce RTX 5070 Ti visible and substantial free VRAM.
- `npm run engine:gpu-proof` is the canonical follow-up proof command.
