# Make HT LLM Marketplace My Local Backend

## OpenAI-Compatible Clients

Use this base URL:

```text
http://127.0.0.1:3001/v1
```

Supported routes:

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/responses`
- `GET /v1/responses/{id}`
- `POST /v1/embeddings`

`/v1/embeddings` proxies a running delegated `llama-server` first. If that server does not support embeddings, the daemon falls back to deterministic zero-dependency local hash embeddings by default. Use this as an API-compatibility fallback, not as a claim of semantic embedding-model quality.

```powershell
$env:HT_LLM_EMBEDDING_BACKEND="hash" # default
# $env:HT_LLM_ENABLE_EMBEDDINGS="0" # explicit opt-out
npm run start:daemon
```

For semantic local embeddings, install a compatible Transformers.js backend and set `HT_LLM_EMBEDDING_BACKEND=transformers`.

## Ollama-Compatible Clients

Use this base URL:

```text
http://127.0.0.1:3001
```

Supported routes:

- `GET /api/version`
- `GET /api/tags`
- `POST /api/chat`

For fastest standard routing, run at least one benchmark after loading a local model:

```powershell
htlm bench <model> hi
```

## Delegated llama.cpp Server

Delegated server mode is guarded. Set these before startup:

```powershell
$env:LLAMA_SERVER_BIN="C:\path\to\llama-server.exe"
$env:LLAMA_SERVER_MODEL="C:\path\to\model.gguf"
$env:LLAMA_SERVER_PORT="8080"
```

Then enable the delegated backend in Studio or through `PUT /api/engine/config`. If the binary or process is missing, chat returns a deterministic service error instead of silently falling back.
