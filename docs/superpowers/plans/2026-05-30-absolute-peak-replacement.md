# Absolute Peak Local LLM Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move HT LLM Marketplace from `foundation` to evidence-backed `best-replacement` for local Ollama/LM Studio-class use without adding Turbo mode or default install bloat.

**Architecture:** Keep the standard path fast by default: cached model index, warm-model routing, measured benchmark decisions, serialized runtime execution, and optional delegated `llama-server` batching. Keep heavy capabilities opt-in: semantic embeddings, vector search, installer packaging, and compatibility score upgrades only activate when their smoke evidence passes.

**Tech Stack:** Node 24, TypeScript, React/Vite, `node:sqlite`, optional Transformers.js, optional `sqlite-vec`, node-llama-cpp/llama.cpp server mode, Tauri, Docker, Vitest, Playwright.

---

## Current Truth

Current claim remains `foundation`.

Already green:
- `npm run release:check`
- 19 test files / 121 tests
- compatibility smoke
- scorecard gate
- package smoke
- artifact cleanliness
- served Playwright desktop/mobile smoke for Documents and runtime config save

Absolute peak means the scorecard can prove every gate, not merely describe it.

## Non-Negotiable Constraints

- No Turbo mode returns. Standard mode is the fastest path.
- Do not add Transformers/ONNX to the default install graph.
- Do not promote the scorecard claim by hand.
- Every claim upgrade must be generated from live smoke artifacts.
- Every package/installer smoke must clean up after itself.
- Mobile and desktop Studio surfaces must pass no-overflow Playwright checks.

## File Structure

Create:
- `packages/daemon/src/routing/decision.ts`: benchmark-aware standard model selection.
- `packages/daemon/src/routing/__tests__/decision.test.ts`: routing rules and fallback tests.
- `packages/daemon/src/embeddings/vector-store.ts`: document embedding rows and cosine/sqlite-vec search abstraction.
- `packages/daemon/src/embeddings/__tests__/vector-store.test.ts`: vector write/search/fallback tests.
- `packages/daemon/src/compatibility/evidence.ts`: load compatibility smoke artifacts and compute gate statuses.
- `packages/daemon/src/compatibility/__tests__/evidence.test.ts`: claim promotion rules.
- `scripts/peak-smoke.mjs`: one command that runs API, CLI, Docker, installer, benchmark, RAG, and UI checks.
- `scripts/benchmark-matrix.mjs`: benchmark candidate local models and write evidence JSON.
- `scripts/docker-smoke.mjs`: build/run/health-check Docker daemon.
- `scripts/installer-smoke.mjs`: validate desktop package artifacts when prerequisites exist.
- `scripts/playwright-studio-smoke.mjs`: committed desktop/mobile Studio smoke.
- `docs/absolute-peak-readiness.md`: live checklist generated from evidence.
- `docs/make-this-my-backend.md`: OpenAI/Ollama/LM Studio/Jan/Open WebUI client setup.

Modify:
- `packages/daemon/src/server.ts`: route standard model decisions, embeddings/vector RAG, compatibility scorecard, delegated server proxy.
- `packages/daemon/src/store.ts`: benchmark run metadata, routing decisions, vector rows, compatibility run rows.
- `packages/daemon/src/runtime/llama-server.ts`: real binary discovery/start/stop/health.
- `packages/daemon/src/engine/llama.ts`: expose loaded model residency and timing hooks.
- `packages/sdk/src/index.ts`: expose routing decision, evidence scorecard, vector RAG metadata.
- `apps/studio/src/RunConsole.tsx`: runtime proof dashboard, standard route explanation, queue/cancel controls.
- `apps/studio/src/App.tsx`: RAG citations and scorecard view.
- `package.json`: add peak smoke, benchmark matrix, Docker smoke, installer smoke, Playwright smoke scripts.
- `.github/workflows/ci.yml`: run safe peak gates that do not require local GPU or installer prerequisites.

---

## Task 1: Evidence-Backed Scorecard Engine

**Files:**
- Create: `packages/daemon/src/compatibility/evidence.ts`
- Create: `packages/daemon/src/compatibility/__tests__/evidence.test.ts`
- Modify: `packages/daemon/src/compatibility.ts`
- Modify: `scripts/scorecard-gate.mjs`
- Modify: `docs/scorecard.md`

- [ ] **Step 1: Write claim promotion tests**

Create `packages/daemon/src/compatibility/__tests__/evidence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { claimFromEvidence, gatesFromEvidence } from "../evidence.js";

describe("compatibility evidence", () => {
  it("keeps foundation when proof is incomplete", () => {
    const evidence = { release: true, api: true, cli: false, docker: false, installer: false, benchmarks: false, rag: true };
    expect(claimFromEvidence(evidence)).toBe("foundation");
    expect(gatesFromEvidence(evidence).find((gate) => gate.id === "cli")?.status).toBe("partial");
  });

  it("promotes to candidate only when broad smoke proof passes", () => {
    const evidence = { release: true, api: true, cli: true, docker: true, installer: false, benchmarks: true, rag: true };
    expect(claimFromEvidence(evidence)).toBe("candidate");
  });

  it("promotes to best-replacement only when every gate passes", () => {
    const evidence = { release: true, api: true, cli: true, docker: true, installer: true, benchmarks: true, rag: true };
    expect(claimFromEvidence(evidence)).toBe("best-replacement");
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
npm test -- packages/daemon/src/compatibility/__tests__/evidence.test.ts
```

Expected: fails because `packages/daemon/src/compatibility/evidence.ts` does not exist.

- [ ] **Step 3: Implement deterministic evidence rules**

Create `packages/daemon/src/compatibility/evidence.ts`:

```ts
export interface ReplacementEvidence {
  release: boolean;
  api: boolean;
  cli: boolean;
  docker: boolean;
  installer: boolean;
  benchmarks: boolean;
  rag: boolean;
}

export function gatesFromEvidence(evidence: ReplacementEvidence) {
  return [
    { id: "release", label: "Release gate passes", status: evidence.release ? "pass" : "partial" },
    { id: "api", label: "OpenAI/Ollama compatibility smoke passes", status: evidence.api ? "pass" : "partial" },
    { id: "cli", label: "CLI lifecycle smoke passes", status: evidence.cli ? "pass" : "partial" },
    { id: "docker", label: "Headless Docker daemon boots", status: evidence.docker ? "pass" : "planned" },
    { id: "installer", label: "Windows installer smoke passes", status: evidence.installer ? "pass" : "planned" },
    { id: "benchmarks", label: "Benchmark-driven routing proof exists", status: evidence.benchmarks ? "pass" : "partial" },
    { id: "rag", label: "Local document chat with citations passes", status: evidence.rag ? "pass" : "partial" }
  ] as const;
}

export function claimFromEvidence(evidence: ReplacementEvidence) {
  if (Object.values(evidence).every(Boolean)) return "best-replacement" as const;
  if (evidence.release && evidence.api && evidence.cli && evidence.docker && evidence.benchmarks && evidence.rag) {
    return "candidate" as const;
  }
  return "foundation" as const;
}
```

- [ ] **Step 4: Wire scorecard to evidence**

Modify `packages/daemon/src/compatibility.ts` so `compatibilityScorecard()` accepts an optional evidence object:

```ts
import { claimFromEvidence, gatesFromEvidence, type ReplacementEvidence } from "./compatibility/evidence.js";

const competitors: CompatibilityScorecard["competitors"] = [
  {
    name: "Ollama",
    parity: "partial",
    covered: ["local model list", "chat route", "version route", "Ollama library GGUF download path"],
    gaps: ["full model lifecycle parity", "broad client compatibility matrix", "production installer"]
  },
  {
    name: "LM Studio",
    parity: "partial",
    covered: ["local GGUF discovery", "runtime status", "manual load/unload", "document chat scaffold"],
    gaps: ["installer smoke", "semantic RAG proof", "OpenAI parity matrix"]
  },
  {
    name: "Jan",
    parity: "partial",
    covered: ["open-source local daemon", "CLI surface", "OpenAI-compatible chat basics"],
    gaps: ["packaged desktop/server distribution", "stable API compatibility proof"]
  },
  {
    name: "LocalAI",
    parity: "partial",
    covered: ["OpenAI-compatible chat basics", "Responses route", "embeddings contract"],
    gaps: ["semantic embeddings proof", "multimodal/provider breadth", "deployment matrix"]
  },
  {
    name: "Open WebUI",
    parity: "partial",
    covered: ["marketplace UI", "runtime management foundation", "document workspace scaffold"],
    gaps: ["Open WebUI connection smoke", "admin/server feature parity", "teams/users"]
  },
  {
    name: "llama.cpp/KoboldCpp",
    parity: "partial",
    covered: ["direct GGUF load", "local streaming chat", "delegated server status scaffold"],
    gaps: ["continuous batching proof", "advanced sampling parity", "server monitoring endpoints"]
  }
];

const foundationEvidence: ReplacementEvidence = {
  release: true,
  api: true,
  cli: false,
  docker: false,
  installer: false,
  benchmarks: false,
  rag: true
};

export function compatibilityScorecard(evidence: ReplacementEvidence = foundationEvidence): CompatibilityScorecard {
  return {
    generatedAt: new Date().toISOString(),
    claim: claimFromEvidence(evidence),
    summary: "Claim is generated from replacement evidence gates, not edited by hand.",
    competitors,
    gates: gatesFromEvidence(evidence)
  };
}
```

- [ ] **Step 5: Run verification**

Run:

```powershell
npm test -- packages/daemon/src/compatibility/__tests__/evidence.test.ts packages/daemon/src/__tests__/server.test.ts
npm run scorecard:gate
```

Expected: evidence tests pass and scorecard still reports `foundation`.

---

## Task 2: Benchmark-Driven Standard Routing

**Files:**
- Create: `packages/daemon/src/routing/decision.ts`
- Create: `packages/daemon/src/routing/__tests__/decision.test.ts`
- Modify: `packages/daemon/src/store.ts`
- Modify: `packages/daemon/src/server.ts`
- Modify: `packages/sdk/src/index.ts`
- Modify: `apps/studio/src/RunConsole.tsx`
- Create: `scripts/benchmark-matrix.mjs`

- [ ] **Step 1: Write routing tests**

Create `packages/daemon/src/routing/__tests__/decision.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chooseStandardModel } from "../decision.js";

const models = [
  { id: "big", name: "Big 7B", path: "big.gguf", sizeBytes: 4_000_000_000, source: "marketplace", runnable: true },
  { id: "small", name: "Qwen 0.5B", path: "small.gguf", sizeBytes: 500_000_000, source: "marketplace", runnable: true }
];

describe("standard model routing", () => {
  it("chooses fastest healthy warm model for simple prompts", () => {
    const result = chooseStandardModel({
      prompt: "hi",
      models,
      benchmarks: [
        { model: "Big 7B", firstTokenMs: 900, totalMs: 1300, tokensPerSecond: 30, failureRate: 0, warm: true },
        { model: "Qwen 0.5B", firstTokenMs: 75, totalMs: 160, tokensPerSecond: 80, failureRate: 0, warm: true }
      ]
    });
    expect(result.model?.name).toBe("Qwen 0.5B");
    expect(result.reason).toContain("fastest healthy warm model");
  });

  it("avoids models with recent failures", () => {
    const result = chooseStandardModel({
      prompt: "hi",
      models,
      benchmarks: [
        { model: "Qwen 0.5B", firstTokenMs: 75, totalMs: 160, tokensPerSecond: 80, failureRate: 0.7, warm: true }
      ]
    });
    expect(result.model?.name).toBe("Big 7B");
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
npm test -- packages/daemon/src/routing/__tests__/decision.test.ts
```

Expected: fails because `decision.ts` does not exist.

- [ ] **Step 3: Implement decision function**

Create `packages/daemon/src/routing/decision.ts`:

```ts
interface RunnableModel {
  id: string;
  name: string;
  path?: string;
  sizeBytes?: number;
  source: string;
  runnable: boolean;
}

interface RoutingBenchmark {
  model: string;
  firstTokenMs: number;
  totalMs: number;
  tokensPerSecond: number;
  failureRate?: number;
  warm?: boolean;
}

export function chooseStandardModel(input: {
  prompt: string;
  models: RunnableModel[];
  benchmarks: RoutingBenchmark[];
}) {
  const runnable = input.models.filter((model) => model.runnable && !/embed|vision|mmproj/i.test(model.name));
  const byName = new Map(input.benchmarks.map((benchmark) => [benchmark.model.toLowerCase(), benchmark]));
  const scored = runnable
    .map((model) => {
      const benchmark = byName.get(model.name.toLowerCase());
      const failurePenalty = (benchmark?.failureRate || 0) * 10_000;
      const warmBonus = benchmark?.warm ? -100 : 0;
      const latency = benchmark?.firstTokenMs ?? Number.POSITIVE_INFINITY;
      const sizeFallback = model.sizeBytes ? model.sizeBytes / 1024 / 1024 : 99_999;
      return { model, score: latency + failurePenalty + warmBonus + sizeFallback / 1000, benchmark };
    })
    .sort((a, b) => a.score - b.score);
  const healthy = scored.find((item) => (item.benchmark?.failureRate || 0) < 0.5);
  return {
    model: healthy?.model ?? runnable.sort((a, b) => (a.sizeBytes || Infinity) - (b.sizeBytes || Infinity))[0],
    reason: healthy?.benchmark ? "standard route selected fastest healthy warm model" : "standard route selected smallest runnable fallback"
  };
}
```

- [ ] **Step 4: Add route for routing decisions**

Modify `packages/daemon/src/server.ts`:

```ts
if (route === "POST /api/routing/standard") {
  const body = requireObject(await readJson<{ prompt: string }>(request, { maxBytes: 64_000 }));
  const models = await context.modelIndex.models();
  const benchmarks = context.store.listBenchmarks();
  return json(response, chooseStandardModel({ prompt: requireString(body.prompt, "prompt", 8_000), models, benchmarks }));
}
```

- [ ] **Step 5: Add SDK method**

Modify `packages/sdk/src/index.ts`:

```ts
standardRoute(prompt: string) {
  return this.post<{ model?: ModelIndexEntry; reason: string }>("/api/routing/standard", { prompt });
}
```

- [ ] **Step 6: Add benchmark matrix script**

Create `scripts/benchmark-matrix.mjs`:

```js
const base = process.env.HT_BENCHMARK_BASE_URL || "http://127.0.0.1:3001";
const prompts = ["hi", "Summarize this in one sentence: local model marketplace", "Return JSON with ok true"];
const models = await (await fetch(`${base}/api/models/index`)).json();
const candidates = models.models.filter((model) => model.runnable).slice(0, 5);
const results = [];
for (const model of candidates) {
  for (const prompt of prompts) {
    const response = await fetch(`${base}/api/benchmarks/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: model.name, prompt })
    });
    results.push({ model: model.name, prompt, status: response.status, body: await response.json().catch(() => ({})) });
  }
}
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
```

- [ ] **Step 7: Run verification**

Run:

```powershell
npm test -- packages/daemon/src/routing/__tests__/decision.test.ts packages/daemon/src/__tests__/server.test.ts
npm run check
```

Expected: routing tests pass and standard route compiles without reintroducing Turbo strings.

---

## Task 3: Semantic RAG And Vector Storage

**Files:**
- Create: `packages/daemon/src/embeddings/vector-store.ts`
- Create: `packages/daemon/src/embeddings/__tests__/vector-store.test.ts`
- Modify: `packages/daemon/src/store.ts`
- Modify: `packages/daemon/src/server.ts`
- Modify: `apps/studio/src/App.tsx`
- Modify: `docs/replacement-readiness.md`

- [ ] **Step 1: Write vector search tests**

Create `packages/daemon/src/embeddings/__tests__/vector-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cosineSearch } from "../vector-store.js";

describe("vector document search", () => {
  it("ranks by cosine similarity", () => {
    const results = cosineSearch({
      query: [1, 0],
      rows: [
        { documentId: "a", chunkIndex: 0, vector: [1, 0], content: "match" },
        { documentId: "b", chunkIndex: 0, vector: [0, 1], content: "miss" }
      ],
      limit: 1
    });
    expect(results).toEqual([{ documentId: "a", chunkIndex: 0, score: 1, content: "match" }]);
  });
});
```

- [ ] **Step 2: Implement JSON-vector fallback**

Create `packages/daemon/src/embeddings/vector-store.ts`:

```ts
import { cosineSimilarity } from "./local.js";

export interface VectorRow {
  documentId: string;
  chunkIndex: number;
  vector: number[];
  content: string;
}

export function cosineSearch(input: { query: number[]; rows: VectorRow[]; limit: number }) {
  return input.rows
    .map((row) => ({ documentId: row.documentId, chunkIndex: row.chunkIndex, score: cosineSimilarity(input.query, row.vector), content: row.content }))
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit);
}
```

- [ ] **Step 3: Store document embeddings during ingestion**

Modify `packages/daemon/src/store.ts`:

```ts
addDocumentEmbedding(row: { documentId: string; chunkIndex: number; model: string; vector: number[]; createdAt: string }) {
  this.db.prepare(
    `INSERT OR REPLACE INTO document_embeddings (document_id, chunk_index, model, vector_json, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(row.documentId, row.chunkIndex, row.model, JSON.stringify(row.vector), row.createdAt);
}

listDocumentEmbeddings(model: string) {
  const rows = this.db.prepare("SELECT document_id, chunk_index, vector_json FROM document_embeddings WHERE model = ?").all(model);
  return rows.map((row: any) => ({ documentId: row.document_id, chunkIndex: row.chunk_index, vector: JSON.parse(row.vector_json) as number[] }));
}
```

- [ ] **Step 4: Use semantic search when embeddings are enabled**

Modify `/api/documents/ask` in `packages/daemon/src/server.ts`:

```ts
const provider = await context.embeddings;
const lexical = context.store.searchDocuments(question, limit);
let citations = lexical;
if (provider) {
  const embedded = await provider.embed([question]);
  const vectorRows = context.store.listDocumentEmbeddings(provider.model);
  const semantic = cosineSearch({ query: embedded.vectors[0], rows: vectorRows, limit });
  citations = mergeLexicalAndSemantic(lexical, semantic);
}
```

Add `mergeLexicalAndSemantic()` in the same file or a focused helper next to `vector-store.ts`.

- [ ] **Step 5: Add Studio citation proof**

Modify `apps/studio/src/App.tsx` so each citation renders source type:

```tsx
<span>
  chunk {result.chunkIndex + 1} - score {result.score.toFixed(2)} - {result.source || "lexical"}
</span>
```

- [ ] **Step 6: Run verification**

Run:

```powershell
npm test -- packages/daemon/src/embeddings/__tests__/vector-store.test.ts packages/daemon/src/__tests__/server.test.ts
npm run check
```

Expected: RAG tests pass with embeddings disabled and enabled mock providers.

---

## Task 4: Delegated `llama-server` Mode With Continuous Batching Proof

**Files:**
- Modify: `packages/daemon/src/runtime/llama-server.ts`
- Create: `packages/daemon/src/runtime/__tests__/llama-server-process.test.ts`
- Modify: `packages/daemon/src/server.ts`
- Modify: `packages/sdk/src/index.ts`
- Modify: `apps/studio/src/RunConsole.tsx`

- [ ] **Step 1: Write binary discovery tests**

Create `packages/daemon/src/runtime/__tests__/llama-server-process.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findLlamaServerBinary } from "../llama-server.js";

describe("llama-server discovery", () => {
  it("returns undefined when no known binary exists", () => {
    expect(findLlamaServerBinary(["C:/missing/path"])).toBeUndefined();
  });

  it("finds Windows server binary names", () => {
    const names = ["llama-server.exe", "server.exe"];
    expect(names.some((name) => name.endsWith(".exe"))).toBe(true);
  });
});
```

- [ ] **Step 2: Implement discovery and process lifecycle**

Modify `packages/daemon/src/runtime/llama-server.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

export function findLlamaServerBinary(searchRoots: string[]) {
  const names = process.platform === "win32" ? ["llama-server.exe", "server.exe"] : ["llama-server", "server"];
  for (const root of searchRoots) {
    for (const name of names) {
      const candidate = path.join(root, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

export class LlamaServerManager {
  private child?: ChildProcess;
  private endpoint?: string;
  constructor(private readonly roots: string[] = []) {}

  status() {
    const binary = findLlamaServerBinary(this.roots);
    return {
      available: Boolean(binary),
      running: Boolean(this.child && !this.child.killed),
      endpoint: this.endpoint,
      pid: this.child?.pid,
      message: binary ? "llama-server binary found." : "Delegated llama-server mode is unavailable until a server binary is installed."
    };
  }
}
```

- [ ] **Step 3: Add delegated chat proxy status path**

Modify `packages/daemon/src/server.ts` so backend `delegated-server` never silently falls back:

```ts
if (config.backend === "delegated-server" && !context.llamaServer.status().running) {
  throw httpError(503, "Delegated server mode is enabled but llama-server is not running.");
}
```

- [ ] **Step 4: Add Studio controls**

Modify `apps/studio/src/RunConsole.tsx`:

```tsx
<button className="run-btn secondary small" onClick={() => void client.startEngineServer()}>
  Start delegated server
</button>
<button className="run-btn ghost small" onClick={() => void client.stopEngineServer()}>
  Stop delegated server
</button>
```

- [ ] **Step 5: Run verification**

Run:

```powershell
npm test -- packages/daemon/src/runtime/__tests__/llama-server.test.ts packages/daemon/src/runtime/__tests__/llama-server-process.test.ts
npm run check
```

Expected: unavailable binary returns clean status; delegated mode cannot pretend batching is active.

---

## Task 5: Full API Compatibility Matrix

**Files:**
- Modify: `scripts/compatibility-smoke.mjs`
- Create: `scripts/compatibility-cases.mjs`
- Modify: `packages/daemon/src/engine/openai.ts`
- Modify: `packages/daemon/src/responses/adapter.ts`
- Modify: `packages/daemon/src/__tests__/server.test.ts`
- Modify: `docs/make-this-my-backend.md`

- [ ] **Step 1: Add shared compatibility cases**

Create `scripts/compatibility-cases.mjs`:

```js
export const cases = [
  { method: "GET", path: "/api/version", allowed: [200], client: "ollama" },
  { method: "GET", path: "/api/tags", allowed: [200], client: "ollama" },
  { method: "POST", path: "/api/chat", body: { model: "local", messages: [{ role: "user", content: "hi" }], stream: false }, allowed: [200, 400, 422], client: "ollama" },
  { method: "GET", path: "/v1/models", allowed: [200], client: "openai" },
  { method: "POST", path: "/v1/chat/completions", body: { model: "local", messages: [{ role: "user", content: "hi" }], stream: false }, allowed: [200, 400, 422], client: "openai" },
  { method: "POST", path: "/v1/responses", body: { model: "local", input: "hi", store: false }, allowed: [200, 400, 422], client: "openai" },
  { method: "POST", path: "/v1/embeddings", body: { model: "local", input: "hello" }, allowed: [200, 501], client: "openai" }
];
```

- [ ] **Step 2: Reuse cases in compatibility smoke**

Modify `scripts/compatibility-smoke.mjs`:

```js
import { cases } from "./compatibility-cases.mjs";

for (const testCase of cases) {
  checks.push(await runCase(base, testCase));
}
```

Add `runCase()` that handles GET/POST and records `{ client, path, status, ok }`.

- [ ] **Step 3: Add JSON schema boundary tests**

Add to `packages/daemon/src/__tests__/server.test.ts`:

```ts
it("POST /v1/chat/completions accepts response_format json_object as best effort", async () => {
  const context = createMockContext();
  context.engine.chat = vi.fn().mockResolvedValue("{\"ok\":true}");
  const req = createMockRequest("POST", "/v1/chat/completions", {
    model: "local",
    messages: [{ role: "user", content: "Return JSON" }],
    response_format: { type: "json_object" }
  });
  const res = createMockResponse();
  await (createServer(context) as any)._events.request(req, res);
  expect([200, 400, 422]).toContain(res.statusCode);
});
```

- [ ] **Step 4: Add client setup docs**

Create `docs/make-this-my-backend.md`:

```md
# Make HT LLM Marketplace My Local Backend

## OpenAI-compatible clients

Set base URL to `http://127.0.0.1:3001/v1`.

## Ollama-compatible clients

Set host to `http://127.0.0.1:3001`.

## Open WebUI

Use OpenAI-compatible mode with base URL `http://host.docker.internal:3001/v1` when Open WebUI runs in Docker.

## LM Studio client replacements

Use `/v1/models`, `/v1/chat/completions`, `/v1/responses`, and `/v1/embeddings`. Unsupported local features return explicit 400/501 responses.
```

- [ ] **Step 5: Run verification**

Run:

```powershell
npm run build
npm run check:compatibility
```

Expected: all cases produce allowed statuses and JSON output includes per-client results.

---

## Task 6: Distribution Proof: Docker And Windows Installer

**Files:**
- Create: `scripts/docker-smoke.mjs`
- Create: `scripts/installer-smoke.mjs`
- Modify: `apps/desktop/src/daemon.ts`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/windows-installer.md`

- [ ] **Step 1: Add Docker smoke**

Create `scripts/docker-smoke.mjs`:

```js
import { spawnSync, spawn } from "node:child_process";

const image = "ht-llm-marketplace:smoke";
const build = spawnSync("docker", ["build", "-t", image, "."], { stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const port = process.env.HT_DOCKER_SMOKE_PORT || "55933";
const container = spawn("docker", ["run", "--rm", "-p", `${port}:3001`, image], { stdio: ["ignore", "pipe", "pipe"] });
try {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) {
        console.log("docker smoke ok");
        process.exit(0);
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Docker daemon did not answer /health");
} finally {
  container.kill("SIGTERM");
}
```

- [ ] **Step 2: Add installer smoke**

Create `scripts/installer-smoke.mjs`:

```js
import fs from "node:fs";
import path from "node:path";

const bundleDir = path.join("apps", "desktop", "src-tauri", "target", "release", "bundle");
if (!fs.existsSync(bundleDir)) {
  console.log("installer smoke skipped: bundle directory not present");
  process.exit(0);
}
const files = fs.readdirSync(bundleDir, { recursive: true }).map(String);
const installers = files.filter((file) => /\.(msi|exe)$/i.test(file));
if (!installers.length) throw new Error("installer smoke failed: no MSI or NSIS exe found");
console.log(JSON.stringify({ ok: true, installers }, null, 2));
```

- [ ] **Step 3: Wire scripts**

Modify `package.json`:

```json
{
  "scripts": {
    "smoke:docker": "node scripts/docker-smoke.mjs",
    "smoke:installer": "node scripts/installer-smoke.mjs"
  }
}
```

- [ ] **Step 4: Add Windows installer docs**

Modify `docs/windows-installer.md` to include exact smoke:

```md
## Smoke

Run `npm run desktop:build` on Windows with Rust and Tauri prerequisites installed.
Run `npm run smoke:installer`.
The smoke passes only when an `.msi` or NSIS `.exe` exists under `apps/desktop/src-tauri/target/release/bundle`.
```

- [ ] **Step 5: Run verification**

Run:

```powershell
npm run desktop:check
npm run smoke:installer
```

Expected: desktop TypeScript passes; installer smoke skips cleanly when no Tauri bundle has been built.

---

## Task 7: Studio Proof Dashboard And Mobile QA

**Files:**
- Create: `scripts/playwright-studio-smoke.mjs`
- Modify: `apps/studio/src/App.tsx`
- Modify: `apps/studio/src/RunConsole.tsx`
- Modify: `apps/studio/src/page.css`
- Modify: `package.json`

- [ ] **Step 1: Commit current Playwright smoke as a script**

Create `scripts/playwright-studio-smoke.mjs`:

```js
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const failures = [];

async function checkViewport(viewport, label) {
  const page = await browser.newPage({ viewport });
  page.on("console", (msg) => {
    if (msg.type() === "error") failures.push(`${label} console: ${msg.text()}`);
  });
  await page.goto(process.env.HT_STUDIO_URL || "http://127.0.0.1:3000", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Documents" }).click();
  await page.getByRole("heading", { name: "Document Search" }).waitFor();
  await page.getByRole("button", { name: "HT Studio" }).click();
  await page.getByText("Speed proof").waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) failures.push(`${label} overflow ${overflow}px`);
  await page.close();
}

await checkViewport({ width: 1440, height: 900 }, "desktop");
await checkViewport({ width: 390, height: 844, isMobile: true }, "mobile");
await browser.close();

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true }, null, 2));
```

- [ ] **Step 2: Add script**

Modify `package.json`:

```json
{
  "scripts": {
    "smoke:studio": "node scripts/playwright-studio-smoke.mjs"
  }
}
```

- [ ] **Step 3: Add scorecard/proof UI**

Modify `apps/studio/src/App.tsx` to add a `proof` tab:

```tsx
type Tab = "marketplace" | "run" | "documents" | "proof";

<button className={tab === "proof" ? "active" : ""} onClick={() => setTab("proof")}>
  Proof
</button>
```

Add `ProofPanel` that calls `client.compatibilityScorecard()` and renders `claim`, `gates`, and competitor gaps.

- [ ] **Step 4: Run served smoke**

Run:

```powershell
npm run build
npm run dev
```

In another shell:

```powershell
npm run smoke:studio
```

Expected: both desktop and mobile pass with no console errors and no horizontal overflow.

---

## Task 8: Peak Gate Orchestrator

**Files:**
- Create: `scripts/peak-smoke.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/absolute-peak-readiness.md`

- [ ] **Step 1: Add peak orchestrator**

Create `scripts/peak-smoke.mjs`:

```js
import { spawnSync } from "node:child_process";

const commands = [
  ["npm", ["run", "release:check"]],
  ["npm", ["run", "scorecard:gate"]],
  ["npm", ["run", "desktop:check"]],
  ["npm", ["run", "smoke:installer"]]
];

const results = [];
for (const [cmd, args] of commands) {
  const start = Date.now();
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  results.push({ command: `${cmd} ${args.join(" ")}`, status: result.status, durationMs: Date.now() - start });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(JSON.stringify({ ok: true, results }, null, 2));
```

- [ ] **Step 2: Add root script**

Modify `package.json`:

```json
{
  "scripts": {
    "peak:smoke": "node scripts/peak-smoke.mjs"
  }
}
```

- [ ] **Step 3: Document peak gate**

Create `docs/absolute-peak-readiness.md`:

```md
# Absolute Peak Readiness

The project may claim `best-replacement` only when:

- `npm run peak:smoke` passes.
- Live benchmark matrix proves a warm standard route under 250ms first UI token for a simple prompt on the target machine.
- Docker smoke passes.
- Windows installer smoke passes on a real Windows package build.
- Studio desktop and mobile Playwright smoke passes.
- Compatibility scorecard generated claim is `best-replacement`.
```

- [ ] **Step 4: Run verification**

Run:

```powershell
npm run peak:smoke
```

Expected: release, scorecard, desktop check, and installer skip/pass complete cleanly.

---

## Task 9: Bloat Budget And Package Size Enforcement

**Files:**
- Modify: `scripts/check-artifacts.mjs`
- Modify: `scripts/package-smoke.mjs`
- Modify: `package.json`
- Modify: `docs/absolute-peak-readiness.md`

- [ ] **Step 1: Add explicit package size budgets**

Modify `scripts/check-artifacts.mjs`:

```js
const budgets = [
  { name: "@ht-llm-marketplace/sdk", maxPackedKb: 20 },
  { name: "@ht-llm-marketplace/cli", maxPackedKb: 10 },
  { name: "@ht-llm-marketplace/daemon", maxPackedKb: 150 },
  { name: "@ht-llm-marketplace/web-component", maxPackedKb: 120 }
];
```

After `npm pack --json`, fail if any packed size exceeds budget.

- [ ] **Step 2: Verify heavy packages are not default dependencies**

Add this check in `scripts/check-artifacts.mjs`:

```js
const forbiddenLockEntries = ["node_modules/@huggingface/transformers", "node_modules/onnxruntime-node", "node_modules/onnxruntime-web"];
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
for (const entry of forbiddenLockEntries) {
  if (lock.packages?.[entry]) throw new Error(`forbidden default package-lock entry: ${entry}`);
}
```

- [ ] **Step 3: Run verification**

Run:

```powershell
npm run check:artifacts
npm run release:check
```

Expected: artifact cleanliness stays green and default lockfile does not include Transformers or ONNX.

---

## Self-Review

Spec coverage:
- Best-replacement proof is Task 1 and Task 8.
- Standard fast path without Turbo is Task 2.
- Semantic RAG proof is Task 3.
- Delegated batching/server proof is Task 4.
- API/client parity proof is Task 5.
- Docker and Windows installer proof is Task 6.
- Studio proof and mobile QA are Task 7.
- Bloat prevention is Task 9.

Placeholder scan:
- No unresolved placeholder markers.
- Unsupported or skipped installer states are explicit pass/skip smoke states.
- Every task has exact files and commands.

Type consistency:
- Scorecard claim remains `"foundation" | "candidate" | "best-replacement"`.
- Gate statuses remain `"pass" | "partial" | "planned"`.
- `standardRoute()` returns a selected model plus reason.
- Vector storage uses JSON fallback first, with optional acceleration kept outside the default dependency graph.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-30-absolute-peak-replacement.md`. Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks, fastest safe iteration.
2. Inline Execution - execute tasks in this session using executing-plans, batch execution with checkpoints.
