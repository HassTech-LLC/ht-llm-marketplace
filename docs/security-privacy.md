# Security And Privacy Notes

HT Local LLM Marketplace is local-first infrastructure. It still touches model hubs, local runtime processes, package managers, and the filesystem, so the security boundary must stay explicit.

## Network Boundary

The daemon binds to loopback by default:

```text
HT_MARKETPLACE_HOST=127.0.0.1
HT_MARKETPLACE_PORT=3001
```

API CORS allows configured local browser origins. Use `HT_MARKETPLACE_ALLOWED_ORIGINS` for additional trusted origins:

```text
HT_MARKETPLACE_ALLOWED_ORIGINS=http://127.0.0.1:3000,http://localhost:5173
```

Avoid `HT_MARKETPLACE_ALLOWED_ORIGINS=*` outside disposable local development.

Widget assets under `/widget/` intentionally send permissive CORS headers because module scripts must be loadable from host applications. That does not make daemon API routes publicly callable unless the API CORS policy allows the caller origin.

## Filesystem Boundary

Marketplace-owned files live under:

```text
HT_MARKETPLACE_HOME
HT_MARKETPLACE_MODELS_DIR
HT_MARKETPLACE_DOWNLOADS_DIR
HT_MARKETPLACE_DB
```

Delete plans should only execute against marketplace-owned artifacts inside configured model/download roots. Runtime-managed external models are inventoried as provider-managed and are not directly delete-eligible.

## Runtime Install Boundary

One-click installs invoke local package managers. In v1, automated install is Windows-first through `winget`; macOS and Linux return manual install commands.

Treat runtime install actions as explicit user actions. Do not trigger them during passive scans, embed load, or catalog search.

## Source And Model Boundary

Hugging Face search is a remote catalog lookup. The UI should not hardcode one model family or silently treat non-GGUF artifacts as installable. File installation remains limited to runnable artifacts such as GGUF until a runtime adapter supports more formats.

Hosts that need stricter controls should add backend source allow lists, repository filters, or proxy-level review before exposing search to a wider user base.

## Local Data

The daemon stores inventory, download jobs, audit events, and delete-plan state locally. Embedding apps should document any additional telemetry, proxying, or account-level logging they add around the marketplace.

## Pre-Release Security Checklist

- Run `npm run release:check`.
- Confirm the daemon still binds to loopback by default.
- Smoke API CORS from allowed and disallowed origins.
- Confirm widget script loading still works from a different local origin.
- Confirm delete plans reject paths outside configured roots.
- Review new installer or runtime routes for explicit user action.
