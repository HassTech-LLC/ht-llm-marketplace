# Agent And Local-LLM App Integration

HT Local LLM Marketplace can act as a local model marketplace, a model runner, or both. For agents and local-LLM apps, the safest contract is the OpenAI-compatible endpoint plus CLI lifecycle commands.

## Universal OpenAI-Compatible Contract

Start the daemon:

```powershell
node packages/cli/src/index.js start
```

In a consuming project, install the local release bundle first, then replace `node packages/cli/src/index.js` with `npx htlm`.

Configure the client or agent:

```text
base_url: http://127.0.0.1:3001/v1
api_key: local-not-needed
model: use `node packages/cli/src/index.js list` from source, `htlm list` after installing the CLI, or `GET /v1/models`
```

Supported local routes include:

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/completions`
- `POST /v1/responses`
- `POST /v1/embeddings` with delegated-server proxying and deterministic local hash fallback by default
- Ollama-style `GET /api/tags`, `POST /api/generate`, `POST /api/show`, `GET /api/ps`

## Marketplace Lifecycle For Agents

Agents should not blindly download or delete models. Use the lifecycle gates:

```powershell
node packages/cli/src/index.js search "small coding model"
node packages/cli/src/index.js files <hf-repo>
node packages/cli/src/index.js pull <ollama-ref-or-hf-repo>
node packages/cli/src/index.js downloads
node packages/cli/src/index.js inventory
node packages/cli/src/index.js verify <artifact-id>
node packages/cli/src/index.js load <artifact-id>
node packages/cli/src/index.js run <model> "quick smoke prompt"
node packages/cli/src/index.js rm <artifact-id>
```

## App Families

| App family | Integration path |
| --- | --- |
| Hermes-style agents | Set the agent's OpenAI base URL to `http://127.0.0.1:3001/v1`; use `htlm` for model lifecycle. |
| Coding agents and IDE assistants | Use the OpenAI-compatible endpoint for chat and `htlm search/pull/verify/load` for local model management. |
| Agent frameworks | Use `@ht-llm-marketplace/sdk` for direct lifecycle control, or the `/v1` endpoint for model calls. |
| Local chat UIs | Point their OpenAI-compatible backend setting to `http://127.0.0.1:3001/v1`. |
| Workflow automation and CI | Use `htlm status`, `htlm list`, `htlm run`, and `htlm bench` as terminal gates. |
| Desktop shells | Embed the React component or Web Component and run the daemon locally. |
| Server-rendered web apps | Use the Web Component and configure trusted loopback origins. |

## Hermes-Style Minimal Config

Use this shape when the agent accepts OpenAI-compatible settings:

```json
{
  "provider": "openai-compatible",
  "baseUrl": "http://127.0.0.1:3001/v1",
  "apiKey": "local-not-needed",
  "model": "use-htlm-list"
}
```

If the agent supports shell hooks, use:

```powershell
node packages/cli/src/index.js status
node packages/cli/src/index.js list
node packages/cli/src/index.js load <artifact-id>
```

## SDK Control Plane

Use SDK methods when the host app needs first-class lifecycle control:

```ts
import { MarketplaceClient } from "@ht-llm-marketplace/sdk";

const client = new MarketplaceClient({ apiUrl: "http://127.0.0.1:3001" });
const { items } = await client.searchCatalog("qwen coder");
const { artifacts } = await client.inventory();
await client.verifyArtifact(artifacts[0].id);
await client.loadEngineModel({ artifactId: artifacts[0].id });
```

## Safety Rules

- Keep the daemon on loopback unless intentionally exposing it.
- Do not use wildcard browser origins outside disposable development.
- Verify artifacts before long-running agent jobs.
- Prefer explicit model names from `/v1/models` or `htlm list`.
- Use delete plans rather than direct file deletion.
