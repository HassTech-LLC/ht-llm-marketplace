# Runtime Residency Modes

HT Studio exposes model residency as a runtime policy instead of treating every switch the same.

## Modes

- `balanced`: keeps the standard route conservative. It warms up to two healthy local chat models and avoids over-committing memory by default.
- `fast-parallel`: keeps multiple smaller/faster models resident when the configured memory cap allows it. This is the right mode for agent workflows where several roles can use compact specialists.
- `quality-single`: keeps only the largest allowed hot model resident. This is the right mode when answer quality matters more than role-parallel switching and the user wants peak efficiency around one big model at a time.

## Big Model Caveat

Switching a fully evicted large model back into VRAM cannot be physically instant. The fastest path is to avoid cold reloads on the critical path:

- keep the active quality model resident when hardware allows
- raise `Max hot model GB` high enough for the intended big model
- use `quality-single` when memory pressure makes parallel hot slots counterproductive
- use `fast-parallel` only when several models can remain resident without forcing evictions

For the Research Team project, the intended setup is to point the app at the HT daemon and choose the residency mode per workflow. Fast role cascades should use `fast-parallel`; deep single-model research passes should use `quality-single`.

## Daemon Surface

- `GET /api/engine/residency` returns the current memory-aware residency plan and hot-pool status.
- `POST /api/engine/hot-pool/warm` now uses that plan. In `quality-single`, ready hot models outside the selected plan are unloaded before the selected larger model is loaded.
- `GET /api/engine/server/pool` reports managed per-model `llama-server` processes.
- `POST /api/engine/server/pool/warm` starts one managed `llama-server` per selected residency candidate when the delegated server binary is available. Entries remain `starting` until their own `/health` endpoint answers; routing only uses entries that reached `running`.
- `POST /api/engine/server/pool/stop` stops every managed pool process.

The planner estimates model residency from GGUF size, context size, RAM, and NVIDIA VRAM when `nvidia-smi` is available. These estimates are conservative guardrails, not a replacement for measured benchmarks.

## Proof Commands

- `npm run smoke:server-pool` starts a local daemon, configures `fast-parallel`, warms the managed server pool, requires every selected pool entry to reach `running` when a `llama-server` binary is available, probes direct health, routes one chat through the pool, stops the pool, then switches to `quality-single` and validates a non-destructive pressure plan.
- Set `HT_SERVER_POOL_REQUIRE_LIVE=1` to fail if a live `llama-server` pool cannot be started.
- Set `HT_SERVER_POOL_AUTO_INSTALL=0` to prevent the smoke from installing a managed `llama-server` binary when one is missing.
