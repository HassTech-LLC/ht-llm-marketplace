#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const command = process.argv[2] || "help";
const args = process.argv.slice(3);
const apiUrl = process.env.HT_MARKETPLACE_API_URL || "http://127.0.0.1:3001";

try {
  if (command === "init") {
    initConfig(args);
  } else if (command === "status") {
    await printStatus();
  } else if (command === "search") {
    await searchCatalog(args);
  } else if (command === "files") {
    await listFiles(requiredArg(args[0], "Hugging Face repo id"), args);
  } else if (command === "downloads") {
    await listDownloads(args);
  } else if (command === "profile" || command === "profiles") {
    printProfile(args[0]);
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
  } else if (command === "load") {
    await loadModel(requiredArg(args[0], "artifact id or model name"));
  } else if (command === "verify") {
    await verifyArtifact(requiredArg(args[0], "artifact id or model name"));
  } else if (command === "reveal") {
    await revealArtifact(requiredArg(args[0], "artifact id or model name"));
  } else if (command === "lifecycle") {
    await printLifecyclePlan(args[0]);
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

function initConfig(argv = []) {
  const flags = parseFlags(argv);
  const configPath = path.resolve(process.cwd(), "ht-llm-marketplace.config.json");
  const target = normalizeTarget(flags.target || flags.t || "auto");
  const resolvedTarget = target === "auto" ? detectProjectTarget(process.cwd()) : target;
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
  console.log(`Project target: ${resolvedTarget}`);
  printProjectSnippet(resolvedTarget, config);
}

async function printStatus() {
  const [health, scan, inventory, downloads] = await Promise.all([
    getJson("/health").catch((error) => ({ ok: false, error: error.message })),
    getJson("/api/system/scan").catch((error) => ({ notes: [error.message], runtimes: [] })),
    getJson("/api/inventory").catch(() => ({ artifacts: [] })),
    getJson("/api/downloads").catch(() => ({ jobs: [] }))
  ]);
  const runtimes = scan.runtimes || [];
  const online = runtimes.filter((runtime) => runtime.online).map((runtime) => runtime.label || runtime.id);
  console.log(`Daemon: ${health.ok ? "online" : "offline"} ${health.version || health.error || ""}`.trim());
  console.log(`Runtimes online: ${online.length ? online.join(", ") : "none reported"}`);
  console.log(`Installed artifacts: ${(inventory.artifacts || []).length}`);
  console.log(`Active downloads: ${(downloads.jobs || []).filter((job) => ["queued", "running", "paused"].includes(job.status)).length}`);
  if (scan.gpus?.length) {
    console.log(`GPU: ${scan.gpus.map((gpu) => `${gpu.name}${gpu.memoryTotalBytes ? ` (${formatBytes(gpu.memoryTotalBytes)})` : ""}`).join(", ")}`);
  }
}

async function searchCatalog(argv = []) {
  const flags = parseFlags(argv);
  const query = positionalArgs(argv).join(" ") || "qwen coder";
  const limit = Number.parseInt(flags.limit || flags.l || "12", 10);
  const payload = await getJson(`/api/catalog/search?q=${encodeURIComponent(query)}&limit=${Number.isFinite(limit) ? limit : 12}`);
  if (flags.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const rows = (payload.items || []).map((item) => ({
    name: item.name,
    source: item.source,
    license: item.license || "unknown",
    fit: item.fit?.label || "unknown",
    repo: item.repoId || item.id
  }));
  printRows(rows, ["name", "source", "license", "fit", "repo"]);
}

async function listFiles(repoId, argv = []) {
  const flags = parseFlags(argv.slice(1));
  const revision = flags.revision || flags.r || "main";
  const payload = await getJson(`/api/catalog/hf/files?repo=${encodeURIComponent(repoId)}&revision=${encodeURIComponent(revision)}`);
  if (flags.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const rows = (payload.files || []).map((file) => ({
    file: file.path,
    size: formatBytes(file.sizeBytes),
    fit: file.fit?.label || "unknown",
    runnable: file.runnable ? "yes" : "no",
    parts: file.partCount || (file.parts ? file.parts.length : 1)
  }));
  printRows(rows, ["file", "size", "fit", "runnable", "parts"]);
}

async function listDownloads(argv = []) {
  const flags = parseFlags(argv);
  const payload = await getJson("/api/downloads");
  if (flags.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const rows = (payload.jobs || []).map((job) => ({
    id: job.id,
    status: job.status,
    progress: `${job.progress}%`,
    target: job.target,
    artifact: job.artifactId || ""
  }));
  printRows(rows, ["id", "status", "progress", "target", "artifact"]);
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

async function loadModel(nameOrId) {
  const artifact = await resolveArtifact(nameOrId);
  if (artifact.runtime === "llamacpp") {
    console.log(JSON.stringify(await postJson("/api/runtimes/llamacpp/load", { artifactId: artifact.id }), null, 2));
    return;
  }
  console.log(JSON.stringify(await postJson(`/api/runtimes/${artifact.runtime}/load`, { runtime: artifact.runtime, model: artifact.name }), null, 2));
}

async function verifyArtifact(nameOrId) {
  const artifact = await resolveArtifact(nameOrId);
  console.log(JSON.stringify(await postJson(`/api/artifacts/${encodeURIComponent(artifact.id)}/verify`, {}), null, 2));
}

async function revealArtifact(nameOrId) {
  const artifact = await resolveArtifact(nameOrId);
  console.log(JSON.stringify(await postJson(`/api/artifacts/${encodeURIComponent(artifact.id)}/reveal`, {}), null, 2));
}

async function printLifecyclePlan(ref) {
  console.log("Terminal lifecycle:");
  console.log("  1. htlm status");
  console.log(`  2. htlm search ${ref ? quote(ref) : "\"qwen coder\""}`);
  console.log(`  3. htlm pull ${ref || "<ollama-ref-or-huggingface-repo>"}`);
  console.log("  4. htlm downloads");
  console.log("  5. htlm inventory");
  console.log("  6. htlm verify <artifact-id>");
  console.log("  7. htlm load <artifact-id>");
  console.log("  8. htlm run <model-or-artifact> \"hi\"");
  console.log("  9. htlm rm <artifact-id>");
  console.log("");
  console.log("Project embed lifecycle:");
  console.log("  htlm init --target react       # React/Vite/Next style host");
  console.log("  htlm init --target html        # plain HTML, Astro, Rails, Django, static sites");
  console.log("  htlm init --target terminal    # CLI-only/backend projects");
}

function printProfile(name = "") {
  const profiles = marketplaceProfiles();
  const key = normalizeProfile(name);
  if (!key) {
    console.log("Available HT Local LLM Marketplace profiles:");
    for (const profile of profiles) {
      console.log(`  ${profile.name.padEnd(15)} ${profile.summary}`);
    }
    console.log("");
    console.log("Use: htlm profile <runtime-only|embed-ui|studio-full|terminal-agent|dev>");
    return;
  }
  const profile = profiles.find((item) => item.name === key);
  if (!profile) throw new Error(`Unknown profile: ${name}`);
  console.log(profile.title);
  console.log(profile.summary);
  console.log("");
  console.log("Install:");
  for (const line of profile.install) console.log(`  ${line}`);
  console.log("");
  console.log("Run:");
  for (const line of profile.run) console.log(`  ${line}`);
  if (profile.integrate.length) {
    console.log("");
    console.log("Integrate:");
    for (const line of profile.integrate) console.log(`  ${line}`);
  }
  if (profile.notes.length) {
    console.log("");
    console.log("Notes:");
    for (const line of profile.notes) console.log(`  - ${line}`);
  }
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
  const artifact = await resolveArtifact(nameOrId);
  const { plan } = await postJson("/api/delete-plans", { artifactId: artifact.id });
  if (plan.blockedReasons?.length) {
    console.log(JSON.stringify(plan, null, 2));
    throw new Error("Delete plan is blocked.");
  }
  console.log(JSON.stringify(await postJson(`/api/delete-plans/${encodeURIComponent(plan.id)}/confirm`, {}), null, 2));
}

async function resolveArtifact(nameOrId) {
  const { artifacts } = await getJson("/api/inventory");
  const artifact = (artifacts || []).find((item) =>
    item.id === nameOrId ||
    item.name === nameOrId ||
    item.displayName === nameOrId ||
    item.repoId === nameOrId ||
    item.filename === nameOrId
  );
  if (!artifact) throw new Error(`Artifact not found: ${nameOrId}`);
  return artifact;
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

function parseFlags(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith("--")) continue;
    const raw = arg.slice(2);
    const [key, inlineValue] = raw.split("=", 2);
    if (inlineValue !== undefined) {
      flags[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("-")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

function positionalArgs(argv) {
  const result = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      if (!arg.includes("=") && argv[index + 1] && !argv[index + 1].startsWith("-")) index += 1;
      continue;
    }
    result.push(arg);
  }
  return result;
}

function normalizeTarget(target) {
  const normalized = String(target).toLowerCase();
  if (["auto", "react", "vite", "next", "html", "web-component", "node", "terminal"].includes(normalized)) return normalized;
  return "auto";
}

function normalizeProfile(name) {
  if (!name) return "";
  const normalized = String(name).toLowerCase();
  const aliases = {
    runtime: "runtime-only",
    engine: "runtime-only",
    daemon: "runtime-only",
    embed: "embed-ui",
    widget: "embed-ui",
    studio: "studio-full",
    peak: "studio-full",
    full: "studio-full",
    agent: "terminal-agent",
    agents: "terminal-agent",
    terminal: "terminal-agent",
    cli: "terminal-agent"
  };
  return aliases[normalized] || normalized;
}

function marketplaceProfiles() {
  return [
    {
      name: "runtime-only",
      title: "Runtime-only profile",
      summary: "Lightest fully functional local model engine: daemon, SDK, CLI, OpenAI/Ollama-compatible APIs, no Studio UI required.",
      install: ["npm install @ht-llm-marketplace/cli @ht-llm-marketplace/sdk", "npx htlm start"],
      run: ["npx htlm status", "npx htlm search \"qwen coder\"", "npx htlm pull qwen2.5:0.5b", "npx htlm run <model> \"hi\""],
      integrate: ["OpenAI base URL: http://127.0.0.1:3001/v1", "Ollama-compatible URL: http://127.0.0.1:3001"],
      notes: [
        "Use this for servers, agents, CLIs, CI, and apps that only need model execution.",
        "Optional native/runtime binaries and model weights remain outside the lightweight JS control plane."
      ]
    },
    {
      name: "embed-ui",
      title: "Embed UI profile",
      summary: "Portable marketplace UI for existing apps: React component or Web Component plus local daemon.",
      install: ["npm install @ht-llm-marketplace/cli @ht-llm-marketplace/react", "npm install @ht-llm-marketplace/web-component"],
      run: ["npx htlm start", "npx htlm init --target react", "npx htlm init --target html"],
      integrate: [
        "React/Vite/Next: import ModelMarketplace from @ht-llm-marketplace/react",
        "Any HTML host: load /widget/ht-model-marketplace.js and render <ht-model-marketplace>"
      ],
      notes: [
        "Use this for SaaS tools, internal dashboards, CMS/admin panels, desktop shells, and web apps that want a model marketplace.",
        "The daemon remains local-first; browser origins must be configured explicitly."
      ]
    },
    {
      name: "studio-full",
      title: "Studio full/peak profile",
      summary: "Full local Studio: marketplace, runtime controls, hot pool, delegated llama-server, benchmark routing, and browser QA.",
      install: ["npm install", "npm run studio"],
      run: ["npm run smoke:studio", "npm run smoke:marketplace", "npm run smoke:server-quality", "npm run release:check"],
      integrate: ["Use Studio when users want visual model discovery, downloads, verification, runtime tuning, and peak local performance controls."],
      notes: [
        "This keeps the current peak performance option fully functional.",
        "Managed llama-server, residency modes, hot pools, and benchmark routing live here without forcing UI users into a separate repo."
      ]
    },
    {
      name: "terminal-agent",
      title: "Terminal and agent profile",
      summary: "Agent-ready local model backend and marketplace lifecycle from terminal commands or OpenAI-compatible clients.",
      install: ["npm install @ht-llm-marketplace/cli @ht-llm-marketplace/sdk", "npx htlm init --target terminal"],
      run: ["npx htlm lifecycle", "npx htlm status", "npx htlm verify <artifact-id>", "npx htlm load <artifact-id>"],
      integrate: [
        "Set OPENAI_BASE_URL=http://127.0.0.1:3001/v1",
        "Set OPENAI_API_KEY=local-not-needed",
        "Use model names from htlm list or GET /v1/models"
      ],
      notes: [
        "Use this for Hermes-style agents, coding agents, local IDE assistants, workflow runners, and automation scripts.",
        "Any tool that supports custom OpenAI-compatible base URLs can use the daemon without embedding the UI."
      ]
    },
    {
      name: "dev",
      title: "Development profile",
      summary: "Contributor mode with workspaces, tests, Playwright, package smoke, compatibility smoke, and artifact gates.",
      install: ["npm install", "npm run build"],
      run: ["npm run check", "npm test", "npm run smoke:cli-marketplace", "npm run release:check"],
      integrate: [],
      notes: ["Use this for modifying the repo, validating publishable packages, and preserving all release gates."]
    }
  ];
}

function detectProjectTarget(cwd) {
  const packagePath = path.join(cwd, "package.json");
  if (!fs.existsSync(packagePath)) return "html";
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (deps.next) return "next";
    if (deps.react || deps["@vitejs/plugin-react"]) return deps.vite ? "vite" : "react";
    if (pkg.scripts?.start || pkg.scripts?.dev) return "node";
  } catch {
    return "html";
  }
  return "terminal";
}

function printProjectSnippet(target, config) {
  if (target === "react" || target === "vite" || target === "next") {
    console.log("React/Vite/Next snippet:");
    console.log('import { ModelMarketplace, type MarketplaceConfig } from "@ht-llm-marketplace/react";');
    console.log('import "@ht-llm-marketplace/react/styles.css";');
    console.log("");
    console.log(`const marketplaceConfig: MarketplaceConfig = ${JSON.stringify(config, null, 2)};`);
    console.log("");
    console.log("export function LocalModels() {");
    console.log("  return <ModelMarketplace config={marketplaceConfig} />;");
    console.log("}");
    if (target === "next") {
      console.log("");
      console.log("Next.js note: render this from a client component because the marketplace uses browser storage and local daemon calls.");
    }
    return;
  }
  if (target === "node" || target === "terminal") {
    console.log("Terminal/backend commands:");
    console.log("  htlm start");
    console.log("  htlm status");
    console.log("  htlm search \"qwen coder\"");
    console.log("  htlm pull qwen2.5:0.5b");
    console.log("  htlm downloads");
    console.log("  htlm inventory");
    console.log("  htlm verify <artifact-id>");
    console.log("  htlm load <artifact-id>");
    console.log("  htlm run <model> \"hi\"");
    return;
  }
  console.log("Web Component snippet:");
  console.log(`<script type="module" src="${apiUrl}/widget/ht-model-marketplace.js"></script>`);
  console.log(`<ht-model-marketplace api-url="${apiUrl}" theme="system" brand-name="${config.branding.name}" brand-tagline="${config.branding.tagline}" brand-mark="${config.branding.mark}" accent-color="${config.tokens["--ht-cyan"]}" default-query="${config.defaultQuery}"></ht-model-marketplace>`);
}

function printRows(rows, columns) {
  if (!rows.length) {
    console.log("No results.");
    return;
  }
  const widths = Object.fromEntries(columns.map((column) => [
    column,
    Math.min(48, Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length)))
  ]));
  console.log(columns.map((column) => pad(column, widths[column])).join("  "));
  console.log(columns.map((column) => "-".repeat(widths[column])).join("  "));
  for (const row of rows) {
    console.log(columns.map((column) => pad(truncateAscii(String(row[column] ?? ""), widths[column]), widths[column])).join("  "));
  }
}

function pad(value, width) {
  return String(value).padEnd(width, " ");
}

function truncateAscii(value, width) {
  if (value.length <= width) return value;
  return `${value.slice(0, Math.max(0, width - 3))}...`;
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value === undefined) return "unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function quote(value) {
  return JSON.stringify(value);
}

function printHelp() {
  console.log("HT Local LLM Marketplace CLI");
  console.log("");
  console.log("Commands:");
  console.log("  htlm init [--target auto|react|vite|next|html|terminal]");
  console.log("                            Write config and print a project-specific embed or terminal snippet");
  console.log("  htlm serve|start          Start the local daemon");
  console.log("  htlm status               Summarize daemon, runtimes, inventory, and downloads");
  console.log("  htlm profile [name]       Show runtime-only, embed-ui, studio-full, terminal-agent, or dev profile");
  console.log("  htlm search <query>       Search marketplace catalogs from a terminal");
  console.log("  htlm files <hf-repo>      List downloadable files for a Hugging Face repo");
  console.log("  htlm pull <ref|repo>      Pull an Ollama-library ref or smallest HF GGUF");
  console.log("  htlm downloads            List download jobs");
  console.log("  htlm verify <artifact>    Verify a local artifact's bytes and hash");
  console.log("  htlm load <artifact>      Load a local artifact into its runtime");
  console.log("  htlm reveal <artifact>    Open or reveal a local artifact path");
  console.log("  htlm run <model> [prompt] Run a local model through the daemon");
  console.log("  htlm list                 List indexed local runnable models");
  console.log("  htlm rm <model|id>        Delete a marketplace-owned artifact with evidence");
  console.log("  htlm bench [model]        Run a short local benchmark");
  console.log("  htlm doctor               Print live local scanner output");
  console.log("  htlm inventory            Print local inventory");
  console.log("  htlm lifecycle [ref]      Print the terminal lifecycle checklist");
}
