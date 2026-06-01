import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const cli = path.join(root, "packages", "cli", "src", "index.js");
const smokeParent = path.join(os.tmpdir(), "htlm-universal-integration-smoke");
fs.mkdirSync(smokeParent, { recursive: true });
const smokeRoot = fs.mkdtempSync(path.join(smokeParent, "run-"));
assertInside(smokeRoot, smokeParent);

try {
  runCli(["targets"], root, ["React / Vite / Next.js", "Django / Flask / FastAPI", "VS Code / IDE extensions", "Agents / CI / terminals"]);
  runAutoCase("next", { "package.json": JSON.stringify({ dependencies: { next: "^15.0.0", react: "^19.0.0" } }) }, ["Project target: next", "Next.js note"]);
  runAutoCase("vite", { "package.json": JSON.stringify({ dependencies: { react: "^19.0.0", vite: "^8.0.0" } }) }, ["Project target: vite", "ModelMarketplace"]);
  runAutoCase("python", { "pyproject.toml": "[project]\nname='sample'\n" }, ["Project target: python", "Python stdlib chat call"]);
  runAutoCase("django", { "manage.py": "# django entrypoint\n" }, ["Project target: python-web", "Web Component snippet", "OPENAI_BASE_URL"]);
  runAutoCase("rails", { "Gemfile": "gem 'rails'\n" }, ["Project target: server-html", "ht-model-marketplace"]);
  runAutoCase("laravel", { "composer.json": JSON.stringify({ require: { "laravel/framework": "^11.0" } }) }, ["Project target: server-html", "ht-model-marketplace"]);
  runAutoCase("aspnet", { "Sample.csproj": "<Project Sdk=\"Microsoft.NET.Sdk.Web\"></Project>" }, ["Project target: server-html", "ht-model-marketplace"]);
  runAutoCase("electron", { "package.json": JSON.stringify({ dependencies: { electron: "^35.0.0" } }) }, ["Project target: desktop-web", "Desktop shell pattern"]);
  runAutoCase("vscode", { "package.json": JSON.stringify({ engines: { vscode: "^1.95.0" }, contributes: {} }) }, ["Project target: extension", "Extension pattern"]);

  assertExample("examples/universal/python/openai_chat.py", ["urllib.request", "OPENAI_BASE_URL"]);
  assertExample("examples/universal/django/templates/local_models.html", ["ht-model-marketplace", "/widget/ht-model-marketplace.js"]);
  assertExample("examples/universal/rails/app/views/local_models/index.html.erb", ["ht-model-marketplace", "/widget/ht-model-marketplace.js"]);
  assertExample("examples/universal/laravel/resources/views/local-models.blade.php", ["ht-model-marketplace", "/widget/ht-model-marketplace.js"]);
  assertExample("examples/universal/aspnet/Pages/LocalModels.cshtml", ["ht-model-marketplace", "/widget/ht-model-marketplace.js"]);
  assertExample("examples/universal/electron/renderer.tsx", ["ModelMarketplace", "@ht-llm-marketplace/react"]);
  assertExample("examples/universal/tauri/LocalModels.tsx", ["ModelMarketplace", "@ht-llm-marketplace/react"]);
  assertExample("examples/universal/vscode/extension.ts", ["/v1/chat/completions", "htlm"]);
  assertExample("examples/universal/agents/openai-compatible.env", ["OPENAI_BASE_URL", "OPENAI_API_KEY"]);
  assertExample("docs/universal-integration.md", ["Any Project Quickstart", "Framework Matrix", "Release Bundle"]);

  console.log("universal integration smoke ok");
} finally {
  cleanup();
}

function runAutoCase(name, files, expected) {
  const cwd = path.join(smokeRoot, name);
  fs.mkdirSync(cwd, { recursive: true });
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(cwd, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  runCli(["init", "--target", "auto"], cwd, expected);
  const configPath = path.join(cwd, "ht-llm-marketplace.config.json");
  if (!fs.existsSync(configPath)) throw new Error(`${name} init did not write config`);
}

function runCli(args, cwd, expected) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env: { ...process.env, HT_MARKETPLACE_API_URL: "http://127.0.0.1:3001" },
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(`CLI ${args.join(" ")} failed with ${result.status}\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  }
  for (const marker of expected) {
    if (!result.stdout.includes(marker)) {
      throw new Error(`CLI ${args.join(" ")} output missing ${marker}\nstdout=${result.stdout}`);
    }
  }
}

function assertExample(relative, markers) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing example ${relative}`);
  const contents = fs.readFileSync(file, "utf8");
  for (const marker of markers) {
    if (!contents.includes(marker)) throw new Error(`${relative} missing ${marker}`);
  }
}

function assertInside(target, parent) {
  const relative = path.relative(parent, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to operate outside smoke root: ${target}`);
  }
}

function cleanup() {
  assertInside(smokeRoot, smokeParent);
  fs.rmSync(smokeRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  if (fs.existsSync(smokeParent) && fs.readdirSync(smokeParent).length === 0) fs.rmdirSync(smokeParent);
}
