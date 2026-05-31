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

`/v1/embeddings` returns `501` until local embeddings are enabled:

```powershell
$env:HT_LLM_ENABLE_EMBEDDINGS="1"
$env:HT_LLM_EMBEDDING_BACKEND="hash"
npm run start:daemon
```

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
