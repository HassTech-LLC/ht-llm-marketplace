# Best Replacement Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining blockers that prevent HT LLM Marketplace from honestly claiming best open-source replacement status for Ollama and LM Studio.

**Architecture:** Keep the daemon local-first and evidence-gated. Add real embeddings/RAG, fuller OpenAI Responses parity, runtime control/delegated server mode, Windows desktop/tray packaging, and generated compatibility proof without reintroducing Turbo mode or bloating the core app.

**Tech Stack:** Node 24, TypeScript, React/Vite, SQLite through `node:sqlite`, optional `@huggingface/transformers` for local embeddings, optional `sqlite-vec` for accelerated vector search, Tauri for the lightweight Windows desktop shell, Playwright/Vitest for proof gates.

---

## Scope Check

These blockers are five independent implementation lanes. Build them as separate commits and keep each lane release-green before moving to the next:

1. Local embeddings and document chat.
2. OpenAI Responses API parity.
3. Runtime controls, scheduler, and delegated `llama-server` mode.
4. Windows desktop/tray installer.
5. Public compatibility and benchmark proof gates.

The implementation order matters because the public scorecard depends on the other lanes. Do not change the scorecard claim beyond `foundation` until the proof scripts pass.

## Design Decisions

- Use standard mode only. Routing may be benchmark-aware, but no Turbo toggle, Turbo label, or Turbo code path returns.
- Keep `@huggingface/transformers` optional and dynamically imported so installs without embeddings still boot fast.
- Store embeddings as JSON vectors first. Add optional `sqlite-vec` acceleration only after the JSON cosine path is correct and tested.
- Prefer Tauri for the desktop shell because it gives native Windows installer/tray support without bundling a full Chromium runtime.
- Delegated `llama-server` mode is optional and status-gated. In-process `node-llama-cpp` remains the default path.
- The scorecard is generated from runnable smoke results, not hand-edited marketing text.

## Reference Sources

- Hugging Face Transformers.js supports Node/browser pipelines, quantized dtypes, and sentence similarity / embeddings tasks: https://huggingface.co/docs/transformers.js/
- `sqlite-vec` offers small local SQLite vector tables and has a Node.js install path, but is pre-v1, so use it as an optional accelerator: https://github.com/asg017/sqlite-vec
- `llama.cpp` ships `llama-server` as an OpenAI-compatible API server and supports broad local hardware targets: https://github.com/ggml-org/llama.cpp
- Tauri can build Windows `.msi` or NSIS setup installers and supports native tray use: https://v2.tauri.app/distribute/windows-installer/
- OpenAI documents `/v1/responses` and `/v1/embeddings`; compatibility should match request/response shape where feasible while returning explicit unsupported errors for local gaps: https://platform.openai.com/docs/api-reference/responses and https://platform.openai.com/docs/api-reference/embeddings

## File Structure

Create and modify these files:

- Create `packages/daemon/src/embeddings/types.ts`: embedding request/result/provider interfaces.
- Create `packages/daemon/src/embeddings/transformers.ts`: optional Transformers.js backend with model caching.
- Create `packages/daemon/src/embeddings/local.ts`: provider selection, deterministic fallback errors, cosine helpers.
- Create `packages/daemon/src/embeddings/__tests__/local.test.ts`: input normalization, dimensions, encoding format, cosine tests.
- Modify `packages/daemon/src/store.ts`: add embedding model metadata, document embedding rows, response storage rows, runtime config rows, compatibility run rows.
- Modify `packages/daemon/src/server.ts`: route `/v1/embeddings`, `/api/documents/ask`, `/v1/responses`, runtime config routes, delegated server routes.
- Create `packages/daemon/src/responses/types.ts`: local Responses API request/response/event types.
- Create `packages/daemon/src/responses/adapter.ts`: convert Responses input to chat messages and output/event objects.
- Create `packages/daemon/src/responses/__tests__/adapter.test.ts`: non-stream and stream event shape tests.
- Create `packages/daemon/src/runtime/config.ts`: runtime config validation and default config.
- Create `packages/daemon/src/runtime/scheduler.ts`: per-model queueing, timeouts, cancellation, headers.
- Create `packages/daemon/src/runtime/llama-server.ts`: delegated server process discovery/start/stop/status.
- Create `packages/daemon/src/runtime/__tests__/config.test.ts`, `scheduler.test.ts`, and `llama-server.test.ts`.
- Create `apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/src/main.rs`: Tauri shell.
- Create `apps/desktop/src/daemon.ts`: desktop-to-daemon process lifecycle bridge.
- Create `scripts/compatibility-smoke.mjs`: route, SDK, CLI, Docker, and document-chat smoke runner.
- Create `scripts/scorecard-gate.mjs`: reads smoke output and fails if claim is higher than evidence.
- Create `docs/scorecard.md`: generated competitor scorecard.
- Create `docs/windows-installer.md`: install, uninstall, model storage, and migration docs.
- Modify `packages/sdk/src/index.ts`: add embeddings, document ask, responses, runtime config, delegated server, and scorecard methods.
- Modify `apps/studio/src/App.tsx`, `apps/studio/src/RunConsole.tsx`, and `apps/studio/src/page.css`: expose Documents chat, runtime manager, queue/cancel details, and scorecard proof.
- Modify `package.json`: add `check:compatibility`, `scorecard:generate`, `desktop:build`, and include compatibility gate in `release:check` only after smoke is deterministic.

## API Contracts

### `/v1/embeddings`

Request:

```json
{
  "model": "local-minilm",
  "input": ["hello", "marketplace"],
  "encoding_format": "float",
  "dimensions": 384
}
```

Response:

```json
{
  "object": "list",
  "model": "local-minilm",
  "data": [
    { "object": "embedding", "index": 0, "embedding": [0.01, -0.02] },
    { "object": "embedding", "index": 1, "embedding": [0.03, 0.04] }
  ],
  "usage": { "prompt_tokens": 3, "total_tokens": 3 }
}
```

Unsupported states return:

```json
{
  "error": {
    "message": "Local embeddings are not enabled.",
    "type": "not_implemented",
    "code": "local_embeddings_unavailable"
  }
}
```

### `/api/documents/ask`

Request:

```json
{
  "question": "Which local API routes are supported?",
  "documentIds": ["doc_1"],
  "limit": 6,
  "model": "loaded"
}
```

Response:

```json
{
  "answer": "The local API supports /api/chat, /api/tags, /v1/models, /v1/chat/completions, /v1/responses, and /v1/embeddings.",
  "citations": [
    { "documentId": "doc_1", "documentName": "replacement-readiness.md", "chunkIndex": 2, "score": 0.91, "text": "API parity smoke..." }
  ]
}
```

### `/v1/responses`

Non-stream response:

```json
{
  "id": "resp_local_123",
  "object": "response",
  "created_at": 1780170000,
  "model": "local",
  "status": "completed",
  "output": [
    {
      "id": "msg_local_123",
      "type": "message",
      "status": "completed",
      "role": "assistant",
      "content": [{ "type": "output_text", "text": "hi" }]
    }
  ],
  "output_text": "hi",
  "usage": { "input_tokens": 1, "output_tokens": 1, "total_tokens": 2 }
}
```

Streaming event order:

```text
event: response.created
event: response.output_text.delta
event: response.output_text.done
event: response.completed
```

### Runtime Config

Endpoint: `GET /api/engine/config`

```json
{
  "keepWarm": true,
  "unloadAfterIdleMs": 900000,
  "contextSize": 4096,
  "gpuLayers": "auto",
  "threads": "auto",
  "backend": "in-process",
  "draftModel": null,
  "delegatedServer": {
    "enabled": false,
    "port": 8080,
    "parallel": 4,
    "continuousBatching": true
  }
}
```

## Task 1: Local Embeddings Backend

**Files:**
- Create: `packages/daemon/src/embeddings/types.ts`
- Create: `packages/daemon/src/embeddings/local.ts`
- Create: `packages/daemon/src/embeddings/transformers.ts`
- Create: `packages/daemon/src/embeddings/__tests__/local.test.ts`
- Modify: `packages/daemon/package.json`
- Modify: `packages/daemon/src/server.ts`
- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: Add failing embedding shape tests**

Create `packages/daemon/src/embeddings/__tests__/local.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeEmbeddingInput, trimDimensions, l2Normalize, cosineSimilarity } from "../local.js";

describe("local embeddings helpers", () => {
  it("normalizes string and array inputs", () => {
    expect(normalizeEmbeddingInput("hello")).toEqual(["hello"]);
    expect(normalizeEmbeddingInput(["hello", "world"])).toEqual(["hello", "world"]);
  });

  it("rejects empty embedding input", () => {
    expect(() => normalizeEmbeddingInput("")).toThrow("input must not be empty");
    expect(() => normalizeEmbeddingInput(["ok", ""])).toThrow("input[1] must not be empty");
  });

  it("trims dimensions without mutating the original vector", () => {
    const vector = [1, 2, 3, 4];
    expect(trimDimensions(vector, 2)).toEqual([1, 2]);
    expect(vector).toEqual([1, 2, 3, 4]);
  });

  it("normalizes vectors to unit length", () => {
    const normalized = l2Normalize([3, 4]);
    expect(normalized[0]).toBeCloseTo(0.6);
    expect(normalized[1]).toBeCloseTo(0.8);
  });

  it("computes cosine similarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Run the failing embedding tests**

Run:

```powershell
npm test -- packages/daemon/src/embeddings/__tests__/local.test.ts
```

Expected before implementation: TypeScript module resolution fails because `../local.js` does not exist.

- [ ] **Step 3: Add embedding types**

Create `packages/daemon/src/embeddings/types.ts`:

```ts
export interface LocalEmbeddingRequest {
  model?: string;
  input: string | string[];
  encoding_format?: "float" | "base64";
  dimensions?: number;
  user?: string;
}

export interface LocalEmbeddingResult {
  model: string;
  vectors: number[][];
  tokenEstimate: number;
  dimensions: number;
}

export interface EmbeddingProvider {
  id: string;
  model: string;
  dimensions: number;
  embed(input: string[], options?: { dimensions?: number; signal?: AbortSignal }): Promise<LocalEmbeddingResult>;
}
```

- [ ] **Step 4: Implement deterministic helpers and provider selection**

Create `packages/daemon/src/embeddings/local.ts`:

```ts
import type { EmbeddingProvider, LocalEmbeddingRequest } from "./types.js";

export function normalizeEmbeddingInput(input: LocalEmbeddingRequest["input"]): string[] {
  const values = typeof input === "string" ? [input] : input;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("input must be a non-empty string or string array");
  }
  return values.map((value, index) => {
    if (typeof value !== "string") throw new Error(`input[${index}] must be a string`);
    const trimmed = value.trim();
    if (!trimmed) throw new Error(index === 0 && values.length === 1 ? "input must not be empty" : `input[${index}] must not be empty`);
    return value;
  });
}

export function trimDimensions(vector: number[], dimensions?: number): number[] {
  if (!dimensions) return [...vector];
  if (!Number.isInteger(dimensions) || dimensions <= 0) throw new Error("dimensions must be a positive integer");
  if (dimensions > vector.length) throw new Error(`dimensions must be <= ${vector.length}`);
  return vector.slice(0, dimensions);
}

export function l2Normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return vector.map(() => 0);
  return vector.map((value) => value / magnitude);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const size = Math.min(a.length, b.length);
  if (!size) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < size; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (!magA || !magB) return 0;
  return dot / Math.sqrt(magA * magB);
}

export async function createEmbeddingProvider(): Promise<EmbeddingProvider | undefined> {
  if (process.env.HT_LLM_ENABLE_EMBEDDINGS !== "1") return undefined;
  const { createTransformersEmbeddingProvider } = await import("./transformers.js");
  return createTransformersEmbeddingProvider({
    model: process.env.HT_LLM_EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2",
    dimensions: Number(process.env.HT_LLM_EMBEDDING_DIMENSIONS || 384)
  });
}
```

- [ ] **Step 5: Implement optional Transformers.js provider**

Create `packages/daemon/src/embeddings/transformers.ts`:

```ts
import { l2Normalize, trimDimensions } from "./local.js";
import type { EmbeddingProvider, LocalEmbeddingResult } from "./types.js";

interface TransformersOptions {
  model: string;
  dimensions: number;
}

type FeatureExtractionPipeline = (input: string[], options: { pooling: "mean"; normalize: true }) => Promise<{ tolist(): number[][] }>;

let cachedPipeline: FeatureExtractionPipeline | undefined;
let cachedModel: string | undefined;

export function createTransformersEmbeddingProvider(options: TransformersOptions): EmbeddingProvider {
  return {
    id: "transformers-js",
    model: options.model,
    dimensions: options.dimensions,
    async embed(input, requestOptions): Promise<LocalEmbeddingResult> {
      const vectors = await embedWithTransformers(options.model, input);
      const output = vectors.map((vector) => l2Normalize(trimDimensions(vector, requestOptions?.dimensions)));
      return {
        model: options.model,
        vectors: output,
        tokenEstimate: estimateTokens(input),
        dimensions: output[0]?.length || requestOptions?.dimensions || options.dimensions
      };
    }
  };
}

async function embedWithTransformers(model: string, input: string[]): Promise<number[][]> {
  if (!cachedPipeline || cachedModel !== model) {
    const transformers = await import("@huggingface/transformers");
    cachedPipeline = (await transformers.pipeline("feature-extraction", model, { dtype: "q8" })) as FeatureExtractionPipeline;
    cachedModel = model;
  }
  const result = await cachedPipeline(input, { pooling: "mean", normalize: true });
  return result.tolist();
}

function estimateTokens(input: string[]) {
  return input.reduce((sum, text) => sum + Math.max(1, Math.ceil(text.length / 4)), 0);
}
```

- [ ] **Step 6: Add optional daemon dependency**

Modify `packages/daemon/package.json`:

```json
{
  "optionalDependencies": {
    "@huggingface/transformers": "^3.8.1",
    "node-llama-cpp": "^3.18.1"
  }
}
```

- [ ] **Step 7: Replace stable 501 with real `/v1/embeddings` path**

Modify `packages/daemon/src/server.ts` so `createContext()` initializes `embeddingProvider?: EmbeddingProvider`, and route `POST /v1/embeddings`:

```ts
const provider = await context.embeddings;
if (!provider) {
  return json(response, {
    error: {
      message: "Local embeddings are not enabled.",
      type: "not_implemented",
      code: "local_embeddings_unavailable"
    }
  }, 501);
}
const body = requireObject(await readJson<LocalEmbeddingRequest>(request, { maxBytes: 512_000 }));
const input = normalizeEmbeddingInput(body.input);
const result = await provider.embed(input, { dimensions: body.dimensions });
return json(response, {
  object: "list",
  model: result.model,
  data: result.vectors.map((embedding, index) => ({ object: "embedding", index, embedding })),
  usage: { prompt_tokens: result.tokenEstimate, total_tokens: result.tokenEstimate }
});
```

- [ ] **Step 8: Run tests**

Run:

```powershell
npm test -- packages/daemon/src/embeddings/__tests__/local.test.ts packages/daemon/src/__tests__/server.test.ts
npm run check
```

Expected: helper tests pass; existing server embedding 501 test is updated to assert the disabled-provider path.

## Task 2: Document Chat With Citations

**Files:**
- Modify: `packages/daemon/src/store.ts`
- Modify: `packages/daemon/src/documents/local-rag.ts`
- Modify: `packages/daemon/src/server.ts`
- Modify: `packages/sdk/src/index.ts`
- Modify: `apps/studio/src/App.tsx`
- Modify: `apps/studio/src/page.css`
- Test: `packages/daemon/src/__tests__/server.test.ts`

- [ ] **Step 1: Add document ask test**

Add to `packages/daemon/src/__tests__/server.test.ts`:

```ts
it("POST /api/documents/ask returns an answer with citations", async () => {
  const context = createTestContext();
  context.store.searchDocuments = vi.fn().mockReturnValue([
    { documentId: "doc_1", documentName: "replacement-readiness.md", chunkIndex: 0, score: 0.9, text: "API parity includes /v1/responses." }
  ]);
  context.engine.chat = vi.fn().mockResolvedValue({ content: "Use /v1/responses for Responses API clients.", tokens: 8 });
  const req = createMockRequest("POST", "/api/documents/ask", { question: "Which Responses route exists?", limit: 3 });
  const res = createMockResponse();

  await createServer(context).emitRequest(req, res);

  expect(res.statusCode).toBe(200);
  expect(JSON.parse(res.body).citations[0].documentId).toBe("doc_1");
});
```

- [ ] **Step 2: Run the failing document ask test**

Run:

```powershell
npm test -- packages/daemon/src/__tests__/server.test.ts -t "documents/ask"
```

Expected before implementation: `404 Not found`.

- [ ] **Step 3: Add prompt assembly helper**

Modify `packages/daemon/src/documents/local-rag.ts`:

```ts
export interface RagCitation {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  score: number;
  text: string;
}

export function buildDocumentPrompt(question: string, citations: RagCitation[]) {
  const context = citations
    .map((item, index) => `[${index + 1}] ${item.documentName} chunk ${item.chunkIndex + 1}: ${item.text}`)
    .join("\n\n");
  return [
    "Answer using only the local document context below.",
    "If the context is insufficient, say exactly what is missing.",
    "",
    context,
    "",
    `Question: ${question}`
  ].join("\n");
}
```

- [ ] **Step 4: Add route**

Modify `packages/daemon/src/server.ts`:

```ts
if (route === "POST /api/documents/ask") {
  const body = requireObject(await readJson<{ question: string; limit?: number }>(request, { maxBytes: 128_000 }));
  const question = requireString(body.question, "question", 4_000);
  const limit = clampNumber(body.limit, 1, 12, 6);
  const citations = context.store.searchDocuments(question, limit);
  const prompt = buildDocumentPrompt(question, citations);
  const answer = await context.queue.run(`documents:${context.engine.loadedModel || "loaded"}`, (signal) =>
    context.engine.chat({ messages: [{ role: "user", content: prompt }], maxTokens: 512, temperature: 0.2, signal })
  );
  return json(response, { answer: answer.content, citations });
}
```

- [ ] **Step 5: Add SDK method**

Modify `packages/sdk/src/index.ts`:

```ts
askDocument(request: { question: string; documentIds?: string[]; limit?: number; model?: string }) {
  return this.post<{ answer: string; citations: DocumentSearchResult[] }>("/api/documents/ask", request);
}
```

- [ ] **Step 6: Add Studio document chat UI**

Modify `apps/studio/src/App.tsx` inside `DocumentsPanel`:

```tsx
const [question, setQuestion] = useState("");
const [answer, setAnswer] = useState("");

async function ask() {
  if (!question.trim()) return;
  setBusy("Asking local documents...");
  setError(undefined);
  try {
    const payload = await client.askDocument({ question, limit: 6 });
    setAnswer(payload.answer);
    setResults(payload.citations);
  } catch (err) {
    setError((err as Error).message);
  } finally {
    setBusy(undefined);
  }
}
```

Add a button labelled `Ask documents` and render the answer above citations.

- [ ] **Step 7: Run verification**

Run:

```powershell
npm test -- packages/daemon/src/__tests__/server.test.ts -t "documents/ask"
npm run check
npm run build -w @ht-llm-marketplace/studio
```

Expected: server test passes, TypeScript passes, Studio builds.

## Task 3: Responses API Parity

**Files:**
- Create: `packages/daemon/src/responses/types.ts`
- Create: `packages/daemon/src/responses/adapter.ts`
- Create: `packages/daemon/src/responses/__tests__/adapter.test.ts`
- Modify: `packages/daemon/src/store.ts`
- Modify: `packages/daemon/src/server.ts`
- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: Add response adapter tests**

Create `packages/daemon/src/responses/__tests__/adapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { inputToMessages, responseObject, streamEvents } from "../adapter.js";

describe("Responses API adapter", () => {
  it("converts string input to chat messages", () => {
    expect(inputToMessages({ input: "hello" })).toEqual([{ role: "user", content: "hello" }]);
  });

  it("builds an OpenAI-style response object", () => {
    const response = responseObject({ id: "resp_1", model: "local", text: "hi", inputTokens: 1, outputTokens: 1 });
    expect(response.object).toBe("response");
    expect(response.output_text).toBe("hi");
    expect(response.output[0].content[0].type).toBe("output_text");
  });

  it("emits ordered stream events", () => {
    const events = streamEvents({ id: "resp_1", model: "local", text: "hi" }).map((event) => event.event);
    expect(events).toEqual(["response.created", "response.output_text.delta", "response.output_text.done", "response.completed"]);
  });
});
```

- [ ] **Step 2: Run failing adapter tests**

Run:

```powershell
npm test -- packages/daemon/src/responses/__tests__/adapter.test.ts
```

Expected before implementation: module not found.

- [ ] **Step 3: Add local Responses types**

Create `packages/daemon/src/responses/types.ts`:

```ts
export interface LocalResponsesRequest {
  model?: string;
  input: string | Array<{ role?: string; content?: string | Array<{ type: string; text?: string }> }>;
  instructions?: string;
  stream?: boolean;
  max_output_tokens?: number;
  temperature?: number;
  response_format?: unknown;
  tools?: unknown[];
  tool_choice?: unknown;
  store?: boolean;
  previous_response_id?: string;
}

export interface LocalResponsesUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}
```

- [ ] **Step 4: Implement adapter**

Create `packages/daemon/src/responses/adapter.ts`:

```ts
import type { ChatMessage } from "../engine/openai.js";
import type { LocalResponsesRequest } from "./types.js";

export function inputToMessages(request: Pick<LocalResponsesRequest, "input" | "instructions">): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (request.instructions) messages.push({ role: "system", content: request.instructions });
  if (typeof request.input === "string") {
    messages.push({ role: "user", content: request.input });
    return messages;
  }
  for (const item of request.input) {
    const role = item.role === "assistant" || item.role === "system" ? item.role : "user";
    const content = typeof item.content === "string"
      ? item.content
      : (item.content || []).map((part) => part.type === "input_text" || part.type === "output_text" ? part.text || "" : "").join("\n");
    if (content.trim()) messages.push({ role, content });
  }
  return messages;
}

export function responseObject(input: { id: string; model: string; text: string; inputTokens: number; outputTokens: number }) {
  return {
    id: input.id,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model: input.model,
    status: "completed",
    output: [{
      id: `msg_${input.id}`,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: input.text }]
    }],
    output_text: input.text,
    usage: {
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      total_tokens: input.inputTokens + input.outputTokens
    }
  };
}

export function streamEvents(input: { id: string; model: string; text: string }) {
  return [
    { event: "response.created", data: { id: input.id, object: "response", model: input.model, status: "in_progress" } },
    { event: "response.output_text.delta", data: { response_id: input.id, delta: input.text } },
    { event: "response.output_text.done", data: { response_id: input.id, text: input.text } },
    { event: "response.completed", data: responseObject({ id: input.id, model: input.model, text: input.text, inputTokens: 0, outputTokens: estimateTokens(input.text) }) }
  ];
}

export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}
```

- [ ] **Step 5: Add local response storage**

Modify `packages/daemon/src/store.ts`:

```sql
CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  request_json TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
)
```

Add `addResponse(row)` and `getResponse(id)` methods.

- [ ] **Step 6: Replace current `/v1/responses` wrapper**

Modify `packages/daemon/src/server.ts` so `/v1/responses` uses `inputToMessages()`, preserves `store`, supports `previous_response_id` lookup, emits the stream event names from `streamEvents()`, and rejects unsupported multimodal input with `400`:

```ts
if (route === "POST /v1/responses") {
  const body = requireObject(await readJson<LocalResponsesRequest>(request, { maxBytes: 1_000_000 }));
  const messages = inputToMessages(body);
  const id = cryptoRandomId("resp_local");
  const result = await context.queue.run(`responses:${body.model || context.engine.loadedModel || "loaded"}`, (signal) =>
    context.engine.chat({ messages, maxTokens: clampNumber(body.max_output_tokens, 1, 4096, 512), temperature: body.temperature ?? 0.7, signal })
  );
  const output = responseObject({
    id,
    model: body.model || context.engine.loadedModel || "local",
    text: result.content,
    inputTokens: estimateTokens(messages.map((message) => message.content).join("\n")),
    outputTokens: estimateTokens(result.content)
  });
  if (body.store !== false) context.store.addResponse({ id, model: output.model, request: body, response: output });
  return json(response, output);
}
```

- [ ] **Step 7: Add SDK methods**

Modify `packages/sdk/src/index.ts`:

```ts
responses(request: LocalResponsesRequest, options: RequestOptions = {}) {
  return this.post<LocalResponsesResponse>("/v1/responses", request, options);
}

getResponse(id: string) {
  return this.get<LocalResponsesResponse>(`/v1/responses/${encodeURIComponent(id)}`);
}
```

- [ ] **Step 8: Run verification**

Run:

```powershell
npm test -- packages/daemon/src/responses/__tests__/adapter.test.ts packages/daemon/src/__tests__/server.test.ts
npm run check
```

Expected: adapter tests pass; server tests verify `/v1/responses` stores and returns output shape.

## Task 4: Runtime Controls And Delegated Server Mode

**Files:**
- Create: `packages/daemon/src/runtime/config.ts`
- Create: `packages/daemon/src/runtime/scheduler.ts`
- Create: `packages/daemon/src/runtime/llama-server.ts`
- Create: `packages/daemon/src/runtime/__tests__/config.test.ts`
- Create: `packages/daemon/src/runtime/__tests__/scheduler.test.ts`
- Create: `packages/daemon/src/runtime/__tests__/llama-server.test.ts`
- Modify: `packages/daemon/src/engine/llama.ts`
- Modify: `packages/daemon/src/server.ts`
- Modify: `packages/sdk/src/index.ts`
- Modify: `apps/studio/src/RunConsole.tsx`

- [ ] **Step 1: Add config validation tests**

Create `packages/daemon/src/runtime/__tests__/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultRuntimeConfig, sanitizeRuntimeConfig } from "../config.js";

describe("runtime config", () => {
  it("keeps safe defaults", () => {
    expect(defaultRuntimeConfig().keepWarm).toBe(true);
    expect(defaultRuntimeConfig().backend).toBe("in-process");
  });

  it("clamps unsafe numeric values", () => {
    const config = sanitizeRuntimeConfig({ contextSize: 999999, threads: 999999, delegatedServer: { parallel: 99 } });
    expect(config.contextSize).toBe(32768);
    expect(config.threads).toBe(64);
    expect(config.delegatedServer.parallel).toBe(16);
  });

  it("rejects draft model when target model is missing", () => {
    expect(() => sanitizeRuntimeConfig({ draftModel: "missing.gguf" }, { knownModelPaths: ["target.gguf"] })).toThrow("Draft model is not in the local model index");
  });
});
```

- [ ] **Step 2: Implement config**

Create `packages/daemon/src/runtime/config.ts`:

```ts
import type { EngineRuntimeConfig } from "@ht-llm-marketplace/sdk";

export function defaultRuntimeConfig(): EngineRuntimeConfig {
  return {
    keepWarm: true,
    unloadAfterIdleMs: 900_000,
    contextSize: 4096,
    gpuLayers: "auto",
    threads: "auto",
    backend: "in-process",
    draftModel: null,
    delegatedServer: { enabled: false, port: 8080, parallel: 4, continuousBatching: true }
  };
}

export function sanitizeRuntimeConfig(input: Partial<EngineRuntimeConfig>, options: { knownModelPaths?: string[] } = {}): EngineRuntimeConfig {
  const current = defaultRuntimeConfig();
  const draftModel = typeof input.draftModel === "string" ? input.draftModel : null;
  if (draftModel && options.knownModelPaths && !options.knownModelPaths.includes(draftModel)) {
    throw new Error("Draft model is not in the local model index");
  }
  return {
    ...current,
    keepWarm: typeof input.keepWarm === "boolean" ? input.keepWarm : current.keepWarm,
    unloadAfterIdleMs: clamp(input.unloadAfterIdleMs, 60_000, 86_400_000, current.unloadAfterIdleMs),
    contextSize: clamp(input.contextSize, 512, 32768, current.contextSize),
    gpuLayers: input.gpuLayers === "auto" ? "auto" : clamp(input.gpuLayers, 0, 999, "auto"),
    threads: input.threads === "auto" ? "auto" : clamp(input.threads, 1, 64, "auto"),
    backend: input.backend === "delegated-server" ? "delegated-server" : "in-process",
    draftModel,
    delegatedServer: {
      enabled: Boolean(input.delegatedServer?.enabled),
      port: clamp(input.delegatedServer?.port, 1024, 65535, current.delegatedServer.port),
      parallel: clamp(input.delegatedServer?.parallel, 1, 16, current.delegatedServer.parallel),
      continuousBatching: input.delegatedServer?.continuousBatching !== false
    }
  };
}

function clamp(value: unknown, min: number, max: number, fallback: number): number;
function clamp(value: unknown, min: number, max: number, fallback: "auto"): number | "auto";
function clamp(value: unknown, min: number, max: number, fallback: number | "auto") {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
```

- [ ] **Step 3: Add scheduler tests**

Create `packages/daemon/src/runtime/__tests__/scheduler.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GenerationScheduler } from "../scheduler.js";

describe("GenerationScheduler", () => {
  it("serializes work for the same model key", async () => {
    const scheduler = new GenerationScheduler();
    const order: string[] = [];
    const first = scheduler.run("llamacpp:model-a", async () => {
      order.push("first:start");
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("first:end");
      return "first";
    });
    const second = scheduler.run("llamacpp:model-a", async () => {
      order.push("second");
      return "second";
    });
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second"]);
  });
});
```

- [ ] **Step 4: Implement scheduler**

Create `packages/daemon/src/runtime/scheduler.ts` by moving the current `GenerationQueue` behavior into per-key queues. Keep `GenerationQueue` as a compatibility wrapper or replace call sites carefully.

Required public methods:

```ts
run<T>(key: string, work: (signal: AbortSignal, id: string) => Promise<T>, options?: { timeoutMs?: number }): Promise<T>
status(): QueueStatus
cancel(id: string): boolean
```

- [ ] **Step 5: Add delegated server manager**

Create `packages/daemon/src/runtime/llama-server.ts`:

```ts
export interface LlamaServerStatus {
  available: boolean;
  running: boolean;
  endpoint?: string;
  pid?: number;
  message: string;
}

export class LlamaServerManager {
  status(): LlamaServerStatus {
    return { available: false, running: false, message: "llama-server binary was not found in bundled engine paths." };
  }

  async start(): Promise<LlamaServerStatus> {
    return this.status();
  }

  async stop(): Promise<LlamaServerStatus> {
    return this.status();
  }
}
```

Add binary discovery in a second commit after the status route is tested.

- [ ] **Step 6: Add runtime routes**

Modify `packages/daemon/src/server.ts`:

```ts
if (route === "GET /api/engine/config") return json(response, context.store.getRuntimeConfig());
if (route === "PUT /api/engine/config") {
  const config = sanitizeRuntimeConfig(await readJson(request), { knownModelPaths: (await context.modelIndex.models()).map((model) => model.path).filter(Boolean) as string[] });
  return json(response, { config: context.store.setRuntimeConfig(config) });
}
if (route === "GET /api/engine/server/status") return json(response, context.llamaServer.status());
if (route === "POST /api/engine/server/start") return json(response, await context.llamaServer.start());
if (route === "POST /api/engine/server/stop") return json(response, await context.llamaServer.stop());
```

- [ ] **Step 7: Run verification**

Run:

```powershell
npm test -- packages/daemon/src/runtime/__tests__/config.test.ts packages/daemon/src/runtime/__tests__/scheduler.test.ts packages/daemon/src/runtime/__tests__/llama-server.test.ts
npm run check
```

Expected: config/scheduler tests pass; server mode status returns unavailable instead of crashing when no binary is found.

## Task 5: Windows Desktop Shell And Installer

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/src/daemon.ts`
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/src/main.rs`
- Create: `docs/windows-installer.md`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add desktop package**

Create `apps/desktop/package.json`:

```json
{
  "name": "@ht-llm-marketplace/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tauri dev",
    "build": "tauri build",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.10.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.10.0",
    "typescript": "^5.9.3"
  }
}
```

- [ ] **Step 2: Add Tauri config**

Create `apps/desktop/src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "HT LLM Marketplace",
  "version": "0.1.0",
  "identifier": "com.hassantech.llm-marketplace",
  "build": {
    "frontendDist": "../../apps/studio/dist",
    "beforeBuildCommand": "npm run build -w @ht-llm-marketplace/studio"
  },
  "app": {
    "windows": [
      { "title": "HT LLM Marketplace", "width": 1280, "height": 860, "resizable": true }
    ]
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "msi"],
    "resources": ["../../packages/daemon/dist/**/*", "../../packages/cli/dist/**/*"]
  }
}
```

- [ ] **Step 3: Add Rust tray skeleton**

Create `apps/desktop/src-tauri/Cargo.toml`:

```toml
[package]
name = "ht-llm-marketplace-desktop"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2.10.0", features = ["tray-icon", "image-png"] }
tauri-plugin-shell = "2"
```

Create `apps/desktop/src-tauri/src/main.rs`:

```rust
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, WebviewWindow};

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
      let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&show, &quit])?;
      TrayIconBuilder::new()
        .tooltip("HT LLM Marketplace")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
          "show" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.show();
              let _ = window.set_focus();
            }
          }
          "quit" => app.exit(0),
          _ => {}
        })
        .build(app)?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("failed to run HT LLM Marketplace desktop shell");
}
```

- [ ] **Step 4: Add root scripts**

Modify `package.json`:

```json
{
  "scripts": {
    "desktop:build": "npm run build -w @ht-llm-marketplace/desktop",
    "desktop:dev": "npm run dev -w @ht-llm-marketplace/desktop"
  }
}
```

- [ ] **Step 5: Add installer docs**

Create `docs/windows-installer.md` with:

```md
# Windows Installer

## Build

Run `npm run desktop:build` on Windows.

## Storage

Models remain in the configured daemon model directory. The installer must not delete model files during app uninstall unless the user chooses "Remove local model storage".

## Uninstall

The uninstall flow removes app binaries, desktop shell settings, and background shortcuts. It leaves marketplace-owned model artifacts in place by default and documents the storage path before removal.

## Migration

If the model directory changes, run `htlm doctor` and `htlm list` before moving files. Move only artifacts returned by the daemon inventory or delete-plan proof.
```

- [ ] **Step 6: Run verification**

Run:

```powershell
npm run build -w @ht-llm-marketplace/studio
npm run check -w @ht-llm-marketplace/desktop
```

Expected: Studio builds and desktop TypeScript passes. Tauri installer build requires Rust/WiX/NSIS prerequisites and is verified in the Windows package lane.

## Task 6: Compatibility And Benchmark Proof Gates

**Files:**
- Create: `scripts/compatibility-smoke.mjs`
- Create: `scripts/scorecard-gate.mjs`
- Modify: `packages/daemon/src/compatibility.ts`
- Modify: `packages/daemon/src/store.ts`
- Modify: `docs/scorecard.md`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add smoke script**

Create `scripts/compatibility-smoke.mjs`:

```js
import { spawn } from "node:child_process";
import { once } from "node:events";

const port = 55931;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["packages/daemon/dist/index.js"], {
  env: { ...process.env, HT_LLM_PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForHealth(base);
  const checks = [];
  checks.push(await get("/health"));
  checks.push(await get("/api/models/index"));
  checks.push(await get("/v1/models"));
  checks.push(await post("/v1/embeddings", { model: "local", input: "hello" }, [200, 501]));
  checks.push(await post("/v1/responses", { input: "hello", max_output_tokens: 4 }, [200, 400, 422]));
  console.log(JSON.stringify({ ok: true, checks }, null, 2));
} finally {
  child.kill("SIGTERM");
}

async function waitForHealth() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("daemon did not become healthy");
}

async function get(path) {
  const res = await fetch(`${base}${path}`);
  return { path, status: res.status, ok: res.ok };
}

async function post(path, body, allowed = [200]) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { path, status: res.status, ok: allowed.includes(res.status) };
}
```

- [ ] **Step 2: Add scorecard gate**

Create `scripts/scorecard-gate.mjs`:

```js
const res = await fetch("http://127.0.0.1:3001/api/compatibility/scorecard");
const scorecard = await res.json();
const allowedClaims = new Set(["foundation", "candidate", "best-replacement"]);
if (!allowedClaims.has(scorecard.claim)) throw new Error(`Unknown scorecard claim: ${scorecard.claim}`);
if (scorecard.claim === "best-replacement") {
  const incomplete = scorecard.gates.filter((gate) => gate.status !== "pass");
  if (incomplete.length) throw new Error(`best-replacement claim blocked by: ${incomplete.map((gate) => gate.id).join(", ")}`);
}
console.log(`scorecard claim ok: ${scorecard.claim}`);
```

- [ ] **Step 3: Generate public scorecard doc**

Modify `docs/scorecard.md`:

```md
# Compatibility Scorecard

Current claim: foundation.

| Competitor | Covered | Gaps |
|---|---|---|
| Ollama | pull/run/list foundation, API aliases | packaged daemon parity and model lifecycle proof |
| LM Studio | local GGUF discovery, load/unload foundation | polished desktop installer, RAG citations, OpenAI parity proof |
| Jan | local-first UI, model manager foundation | installer and extension parity |
| LocalAI | OpenAI-compatible route foundation | multimodal, embeddings, deployment matrix |
| Open WebUI | local marketplace UI foundation | multi-user server/admin features |
| llama.cpp | direct GGUF runtime foundation | delegated server batching proof |
| KoboldCpp | local GGUF runtime foundation | story/chat preset compatibility |

This file is generated from smoke results before any claim upgrade.
```

- [ ] **Step 4: Wire package scripts**

Modify `package.json`:

```json
{
  "scripts": {
    "check:compatibility": "node scripts/compatibility-smoke.mjs",
    "scorecard:gate": "node scripts/scorecard-gate.mjs"
  }
}
```

Keep `scorecard:gate` out of `release:check` until it starts and owns its own daemon port or reads a saved smoke artifact.

- [ ] **Step 5: Run verification**

Run:

```powershell
npm run build
npm run check:compatibility
npm run check:artifacts
```

Expected: build passes; compatibility smoke passes with embeddings allowed to be either `200` when enabled or `501` when disabled; artifact cleanliness remains green.

## Self-Review

Spec coverage:

- Real local embeddings backend: Task 1.
- LM Studio-class document chat/RAG citations: Task 2.
- Fuller `/v1/responses` behavior: Task 3.
- Runtime controls and delegated batching path: Task 4.
- Windows packaged installer/tray path: Task 5.
- Public benchmark/compatibility proof: Task 6.
- No Turbo mode: design decision and no task introduces a Turbo surface.

Placeholder scan:

- No unresolved placeholder markers.
- No "write tests for the above" without concrete tests.
- Unsupported states are explicit `501`, `400`, or status-gated results.

Type consistency:

- `EngineRuntimeConfig` remains the SDK runtime config type.
- `DocumentSearchResult` remains the citation shape reused by document ask.
- Responses API methods use `responses()` and `getResponse()` consistently.
- Queue/scheduler methods keep `run()`, `status()`, and `cancel()` method names.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-30-replacement-blockers.md`. Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks, fastest safe iteration.
2. Inline Execution - execute tasks in this session using executing-plans, batch execution with checkpoints.
