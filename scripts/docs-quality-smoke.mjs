import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "README.md",
  "docs/index.md",
  "docs/universal-integration.md",
  "docs/integration-profiles.md",
  "docs/agent-integration.md",
  "docs/customization.md",
  "docs/open-source.md",
  "docs/security-privacy.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "SECURITY.md"
];

const readmeMarkers = [
  "# HT Local LLM Marketplace",
  "## Why This Exists",
  "## Quick Start",
  "## Use It In Another Project",
  "## Terminal Marketplace",
  "## Embed Examples",
  "## Architecture",
  "## Trust And Safety Boundaries",
  "## Verification",
  "## Documentation",
  "```mermaid",
  "npx htlm targets",
  "npm run bundle:local",
  "OPENAI_BASE_URL=http://127.0.0.1:3001/v1"
];

const docsIndexMarkers = [
  "# HT Local LLM Marketplace Docs",
  "## Start Here",
  "## Product Surfaces",
  "## Main Guides",
  "## Verification Commands"
];

for (const relative of requiredFiles) {
  assertFile(relative);
}

const readme = read("README.md");
for (const marker of readmeMarkers) assertIncludes("README.md", readme, marker);

const docsIndex = read("docs/index.md");
for (const marker of docsIndexMarkers) assertIncludes("docs/index.md", docsIndex, marker);

const pkg = JSON.parse(read("package.json"));
for (const script of ["smoke:docs", "smoke:universal", "smoke:cli-marketplace", "release:check", "bundle:local"]) {
  if (!pkg.scripts?.[script]) throw new Error(`package.json missing script ${script}`);
}
if (!pkg.scripts["release:check"].includes("smoke:docs")) {
  throw new Error("release:check must include smoke:docs");
}

const markdownFiles = [
  "README.md",
  ...walk(path.join(root, "docs")).filter((file) => file.endsWith(".md")).map((file) => path.relative(root, file))
];

for (const relative of markdownFiles) {
  checkLinks(relative);
}

console.log("docs quality smoke ok");

function assertFile(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) throw new Error(`Missing ${relative}`);
}

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function assertIncludes(relative, contents, marker) {
  if (!contents.includes(marker)) throw new Error(`${relative} missing marker: ${marker}`);
}

function walk(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(absolute));
    else result.push(absolute);
  }
  return result;
}

function checkLinks(relative) {
  const contents = read(relative);
  const sourceDir = path.dirname(path.join(root, relative));
  const links = [...contents.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
  for (const raw of links) {
    const target = raw.trim();
    if (!target || target.startsWith("#")) continue;
    if (/^[a-z]+:/i.test(target)) continue;
    const withoutAnchor = target.split("#")[0];
    if (!withoutAnchor) continue;
    const decoded = withoutAnchor.replace(/^<|>$/g, "");
    const absolute = path.resolve(sourceDir, decoded);
    if (!absolute.startsWith(root)) {
      throw new Error(`${relative} links outside repo: ${target}`);
    }
    if (!fs.existsSync(absolute)) {
      throw new Error(`${relative} has broken link: ${target}`);
    }
  }
}
