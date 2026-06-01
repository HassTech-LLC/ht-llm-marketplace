import { MarketplaceClient } from "@ht-llm-marketplace/sdk";

const client = new MarketplaceClient({
  apiUrl: process.env.HT_MARKETPLACE_API_URL || "http://127.0.0.1:3001"
});

const { artifacts } = await client.inventory();
const runnable = artifacts.find((artifact) => artifact.runnable && artifact.runtime === "llamacpp");

if (!runnable) {
  console.log("No runnable llama.cpp artifact found. Use `npx htlm search` and `npx htlm pull` first.");
  process.exit(0);
}

console.log(`Verifying ${runnable.displayName || runnable.name}`);
await client.verifyArtifact(runnable.id);

console.log(`Loading ${runnable.displayName || runnable.name}`);
await client.loadEngineModel({ artifactId: runnable.id });

const response = await client.completion({
  model: runnable.name,
  prompt: "Say hi in one short sentence.",
  max_tokens: 24
});

console.log(response.choices[0]?.text || "");
