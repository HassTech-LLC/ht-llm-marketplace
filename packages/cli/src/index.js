#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const command = process.argv[2] || "help";
const args = process.argv.slice(3);
const apiUrl = process.env.HT_MARKETPLACE_API_URL || "http://127.0.0.1:3001";

try {
  if (command === "init") {
    initConfig();
  } else if (command === "doctor") {
    console.log(JSON.stringify(await getJson("/api/system/scan"), null, 2));
  } else if (command === "inventory") {
    console.log(JSON.stringify(await getJson("/api/inventory"), null, 2));
  } else if (command === "list") {
    const payload = await getJson("/api/models/index");
    for (const model of payload.models || []) {
      console.log(`${model.loaded ? "*" : " "} ${model.name}\t${model.source}\t${model.path}`);
    }
  } else if (command === "pull") {
    await pullModel(requiredArg(args[0], "model reference"));
  } else if (command === "run") {
    await runModel(requiredArg(args[0], "model"), args.slice(1).join(" ") || "hi");
  } else if (command === "rm") {
    await removeModel(requiredArg(args[0], "model name or artifact id"));
  } else if (command === "bench") {
    const model = args[0];
    console.log(JSON.stringify(await postJson("/api/benchmarks/run", { model, prompt: args.slice(1).join(" ") || "hi" }), null, 2));
  } else if (command === "start" || command === "serve") {
    await startDaemon();
  } else {
    printHelp();
  }
} catch (error) {
  console.error((error instanceof Error ? error.message : String(error)) || "Command failed");
  process.exitCode = 1;
}

function initConfig() {
  const configPath = path.resolve(process.cwd(), "ht-llm-marketplace.config.json");
  const config = {
    apiUrl,
    theme: "system",
    component: "ht-model-marketplace",
    branding: {
      name: "Local LLM Marketplace",
      tagline: "Private model supply chain",
      mark: "HT"
    },
    display: {
      showLogos: true,
      showDescriptions: true,
      showBadges: true,
      showSpecs: true
    },
    features: {
      discover: true,
      downloads: true,
      library: true,
      runtimes: true,
      doctor: true,
      settings: true
    },
    tokens: {
      "--ht-cyan": "#06b6d4",
      "--ht-green": "#06b6d4"
    },
    defaultQuery: "qwen coder",
    storageKey: "ht_marketplace"
  };
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`Created ${configPath}`);
  } else {
    console.log(`Config already exists at ${configPath}`);
  }
  console.log("");
  console.log("Embed snippet:");
  console.log(`<script type="module" src="${apiUrl}/widget/ht-model-marketplace.js"></script>`);
  console.log(`<ht-model-marketplace api-url="${apiUrl}" theme="system" brand-name="${config.branding.name}" brand-tagline="${config.branding.tagline}" brand-mark="${config.branding.mark}" accent-color="${config.tokens["--ht-cyan"]}" default-query="${config.defaultQuery}"></ht-model-marketplace>`);
}

async function pullModel(ref) {
  if (ref.includes("/")) {
    const filesPayload = await getJson(`/api/catalog/hf/files?repo=${encodeURIComponent(ref)}`);
    const file = (filesPayload.files || []).filter((item) => item.runnable).sort((a, b) => (a.sizeBytes || Infinity) - (b.sizeBytes || Infinity))[0];
    if (!file) throw new Error(`No runnable GGUF files found for ${ref}`);
    const filenames = file.parts ? file.parts.map((part) => part.path) : [file.path];
    const expectedFiles = file.parts ? file.parts.map((part) => ({ path: part.path, sizeBytes: part.sizeBytes })) : [{ path: file.path, sizeBytes: file.sizeBytes }];
    console.log(JSON.stringify(await postJson("/api/downloads", {
      source: "huggingface",
      runtime: "llamacpp",
      repoId: ref,
      filename: filenames[0],
      filenames,
      displayName: path.basename(file.path, ".gguf"),
      expectedBytes: expectedFiles.reduce((total, part) => total + (part.sizeBytes || 0), 0) || undefined,
      expectedFiles
    }), null, 2));
    return;
  }
  console.log(JSON.stringify(await postJson("/api/downloads", { source: "ollama-registry", ref, runtime: "llamacpp" }), null, 2));
}

async function runModel(model, prompt) {
  const response = await fetch(`${apiUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runtime: "llamacpp", model, stream: true, messages: [{ role: "user", content: prompt }] })
  });
  if (!response.ok || !response.body) throw new Error(`Run failed with ${response.status}: ${await response.text()}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.message?.content) process.stdout.write(event.message.content);
      if (event.error) throw new Error(event.error);
    }
  }
  process.stdout.write("\n");
}

async function removeModel(nameOrId) {
  const { artifacts } = await getJson("/api/inventory");
  const artifact = artifacts.find((item) => item.id === nameOrId || item.name === nameOrId || item.displayName === nameOrId);
  if (!artifact) throw new Error(`Artifact not found: ${nameOrId}`);
  const { plan } = await postJson("/api/delete-plans", { artifactId: artifact.id });
  if (plan.blockedReasons?.length) {
    console.log(JSON.stringify(plan, null, 2));
    throw new Error("Delete plan is blocked.");
  }
  console.log(JSON.stringify(await postJson(`/api/delete-plans/${encodeURIComponent(plan.id)}/confirm`, {}), null, 2));
}

async function startDaemon() {
  if (!process.env.HT_MARKETPLACE_PORT) {
    try {
      process.env.HT_MARKETPLACE_PORT = new URL(apiUrl).port || "3001";
    } catch {
      process.env.HT_MARKETPLACE_PORT = "3001";
    }
  }
  console.log(`Starting HT Local LLM Marketplace daemon at ${apiUrl}`);
  await import("@ht-llm-marketplace/daemon");
}

async function getJson(route) {
  const response = await fetch(`${apiUrl}${route}`);
  return readJson(response);
}

async function postJson(route, body) {
  const response = await fetch(`${apiUrl}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ht-marketplace-confirm": "privileged-action" },
    body: JSON.stringify(body)
  });
  return readJson(response);
}

async function readJson(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || payload?.message || `Request failed with ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function requiredArg(value, label) {
  if (!value) throw new Error(`${label} is required`);
  return value;
}

function printHelp() {
  console.log("HT Local LLM Marketplace CLI");
  console.log("");
  console.log("Commands:");
  console.log("  htlm init                 Write config and print the Web Component snippet");
  console.log("  htlm serve|start          Start the local daemon");
  console.log("  htlm pull <ref|repo>      Pull an Ollama-library ref or smallest HF GGUF");
  console.log("  htlm run <model> [prompt] Run a local model through the daemon");
  console.log("  htlm list                 List indexed local runnable models");
  console.log("  htlm rm <model|id>        Delete a marketplace-owned artifact with proof");
  console.log("  htlm bench [model]        Run a short local benchmark");
  console.log("  htlm doctor               Print live local scanner output");
  console.log("  htlm inventory            Print local inventory");
}
