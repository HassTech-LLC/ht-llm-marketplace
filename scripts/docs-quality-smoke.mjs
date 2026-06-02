import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "README.md",
  "docs/index.md",
  "docs/assets/marketplace-desktop.png",
  "docs/assets/marketplace-mobile.png",
  "docs/assets/terminal-marketplace.svg",
  "docs/assets/embed-surfaces.svg",
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
  "## Visual Proof",
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
  "## Visual Proof",
  "## Product Surfaces",
  "## Main Guides",
  "## Verification Commands"
];

for (const relative of requiredFiles) {
  assertFile(relative);
}
assertPngDimensions("docs/assets/marketplace-desktop.png", 1000, 700);
assertPngDimensions("docs/assets/marketplace-mobile.png", 360, 700);
assertIncludes("docs/assets/terminal-marketplace.svg", read("docs/assets/terminal-marketplace.svg"), "<svg");
assertIncludes("docs/assets/embed-surfaces.svg", read("docs/assets/embed-surfaces.svg"), "<svg");

const readme = read("README.md");
for (const marker of readmeMarkers) assertIncludes("README.md", readme, marker);

const docsIndex = read("docs/index.md");
for (const marker of docsIndexMarkers) assertIncludes("docs/index.md", docsIndex, marker);

const pkg = JSON.parse(read("package.json"));
for (const script of ["smoke:docs", "smoke:universal", "smoke:cli-marketplace", "release:check", "bundle:local", "docs:assets"]) {
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

function assertPngDimensions(relative, minWidth, minHeight) {
  const absolute = path.join(root, relative);
  const buffer = fs.readFileSync(absolute);
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error(`${relative} is not a PNG`);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width < minWidth || height < minHeight) {
    throw new Error(`${relative} is too small: ${width}x${height}`);
  }
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
