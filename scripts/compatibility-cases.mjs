export const compatibilityCases = [
  { client: "health", method: "GET", path: "/health", allowed: [200] },
  { client: "ollama", method: "GET", path: "/api/version", allowed: [200] },
  { client: "ollama", method: "GET", path: "/api/tags", allowed: [200] },
  { client: "ollama", method: "GET", path: "/api/ps", allowed: [200] },
  { client: "ollama", method: "POST", path: "/api/show", body: { model: "local" }, allowed: [200, 404] },
  { client: "ollama", method: "POST", path: "/api/generate", body: { model: "local", prompt: "hello", stream: false, options: { num_predict: 4 } }, allowed: [200, 400, 422, 503] },
  { client: "openai", method: "GET", path: "/v1/models", allowed: [200] },
  { client: "openai", method: "POST", path: "/v1/completions", body: { prompt: "hello", max_tokens: 4, stream: false }, allowed: [200, 400, 422] },
  { client: "openai", method: "POST", path: "/v1/embeddings", body: { model: "local", input: "hello" }, allowed: [200, 501] },
  { client: "openai", method: "POST", path: "/v1/responses", body: { input: "hello", max_output_tokens: 4, store: false }, allowed: [200, 400, 422] },
  {
    client: "openai",
    method: "POST",
    path: "/v1/chat/completions",
    body: { messages: [{ role: "user", content: "hello" }], max_tokens: 4, stream: false },
    allowed: [200, 400, 422]
  },
  { client: "lmstudio", method: "GET", path: "/api/runtimes/llamacpp/models", allowed: [200] },
  { client: "jan", method: "GET", path: "/api/queue", allowed: [200] },
  { client: "localai", method: "GET", path: "/api/engine/config", allowed: [200] },
  { client: "llama.cpp", method: "GET", path: "/api/engine/server/status", allowed: [200] },
  { client: "routing", method: "GET", path: "/api/routing/standard", allowed: [200] }
];

export async function runCompatibilityCases(base) {
  const checks = [];
  for (const testCase of compatibilityCases) {
    checks.push(await runCase(base, testCase));
  }
  return checks;
}

async function runCase(base, testCase) {
  const res = await fetch(`${base}${testCase.path}`, {
    method: testCase.method,
    headers: testCase.body ? { "content-type": "application/json", "x-ht-marketplace-confirm": "privileged-action" } : undefined,
    body: testCase.body ? JSON.stringify(testCase.body) : undefined
  });
  return {
    client: testCase.client,
    method: testCase.method,
    path: testCase.path,
    status: res.status,
    ok: testCase.allowed.includes(res.status)
  };
}
