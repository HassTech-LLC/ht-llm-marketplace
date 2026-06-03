# Agent Notes

This repo is a public local-first LLM marketplace and runtime control plane. Keep agent edits focused on source, documentation, release gates, and public proof assets.

Before shipping changes:

- Run `npm run release:check` for the full local release gate.
- Keep generated output out of git: `artifacts/`, `scratch/`, local model files, databases, desktop build output, Playwright captures, and runtime logs.
- Do not commit local memory files such as `PROJECT_MEMORY.md`.
- Keep public claims evidence-bound. Model weights, runtime caches, and user downloads are local payloads, not part of the source footprint.
