import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "README.md",
  "docs/index.md",
  "docs/assets/marketplace-desktop.png",
  "docs/assets/marketplace-mobile.png",
  "docs/assets/marketplace-demo.webm",
  "docs/assets/terminal-usability.png",
  "docs/assets/terminal-demo.webm",
  "docs/assets/terminal-marketplace.svg",
  "docs/assets/embed-surfaces.svg",
  "docs/assets/repo-banner.svg",
  "docs/proofs/terminal-logs/cli-usability-transcript.txt",
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
  "node packages/cli/src/index.js targets",
  "Avoid bare `npx htlm` before installing this CLI package",
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
assertPngDimensions("docs/assets/terminal-usability.png", 1000, 700);
assertNonEmpty("docs/assets/marketplace-demo.webm", 50_000);
assertNonEmpty("docs/assets/terminal-demo.webm", 20_000);
assertIncludes("docs/assets/terminal-marketplace.svg", read("docs/assets/terminal-marketplace.svg"), "<svg");
assertIncludes("docs/assets/embed-surfaces.svg", read("docs/assets/embed-surfaces.svg"), "<svg");
assertIncludes("docs/assets/repo-banner.svg", read("docs/assets/repo-banner.svg"), "<svg");
assertIncludes("docs/proofs/terminal-logs/cli-usability-transcript.txt", read("docs/proofs/terminal-logs/cli-usability-transcript.txt"), "node packages/cli/src/index.js status");

const readme = read("README.md");
for (const marker of readmeMarkers) assertIncludes("README.md", readme, marker);

const docsIndex = read("docs/index.md");
for (const marker of docsIndexMarkers) assertIncludes("docs/index.md", docsIndex, marker);

const pkg = JSON.parse(read("package.json"));
for (const script of ["smoke:docs", "smoke:universal", "smoke:cli-marketplace", "release:check", "bundle:local", "docs:assets", "docs:terminal"]) {
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
  checkQuickstartPreconditions(relative);
}

const npxPreconditionFiles = unique([
  ...markdownFiles,
  "examples/agent-configs/hermes-agent.openai-compatible.json",
  "examples/agent-configs/openai-compatible.env.example",
  "examples/agent-configs/sdk-lifecycle.mjs",
  "scripts/local-release-bundle.mjs"
]);
for (const relative of npxPreconditionFiles) {
  assertNpxHtlmHasInstallPrecondition(relative, read(relative));
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

function assertNonEmpty(relative, minBytes) {
  const absolute = path.join(root, relative);
  const size = fs.statSync(absolute).size;
  if (size < minBytes) throw new Error(`${relative} is too small: ${size} bytes`);
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

function checkQuickstartPreconditions(relative) {
  const contents = read(relative);
  const sections = contents.split(/\n#+\s+/);
  for (const section of sections) {
    const lines = section.split("\n");
    const heading = lines[0] || "";
    const lowerHeading = heading.toLowerCase();
    const isSetupOrQuickstart =
      lowerHeading.includes("quick start") ||
      lowerHeading.includes("quickstart") ||
      lowerHeading.includes("start here") ||
      lowerHeading.includes("setup") ||
      lowerHeading.includes("install");
    if (isSetupOrQuickstart) {
      const sectionText = lines.slice(1).join("\n");
      const hasNpxCommand =
        sectionText.includes("npx htlm") ||
        sectionText.includes("npx ollm") ||
        sectionText.includes("npx ht-llm-marketplace");
      if (hasNpxCommand) {
        const hasPrecondition =
          sectionText.includes("npm install") ||
          sectionText.includes("npm run bundle:local") ||
          sectionText.includes("npm i ") ||
          sectionText.includes("install the local release") ||
          sectionText.includes("install the cli") ||
          sectionText.includes("installed from the local release") ||
          sectionText.includes("install first") ||
          sectionText.includes("assume the CLI package was installed");
        if (!hasPrecondition) {
          throw new Error(
            `Documentation Safety Violation in ${relative} -> Section "${heading}": ` +
            `Found bare npx command execution without an explicit installation precondition/context in this section. ` +
            `Please state the installation requirements before invoking "npx htlm" or "npx ollm" to prevent npm package conflicts.`
          );
        }
      }
    }
  }
}

function assertNpxHtlmHasInstallPrecondition(relative, contents) {
  const lower = contents.toLowerCase();
  let index = lower.indexOf("npx htlm");
  while (index >= 0) {
    const context = lower.slice(Math.max(0, index - 900), Math.min(lower.length, index + 350));
    const allowed = [
      "after installing",
      "after install",
      "after the cli package is installed",
      "cli package was installed",
      "commands that use `npx htlm` assume",
      "install the local release bundle first",
      "install-local",
      "installer adds",
      "expected to resolve after",
      "npm install @ht-llm-marketplace/cli",
      "published `@ht-llm-marketplace/cli` package",
      "published @ht-llm-marketplace/cli package",
      "after installing the ht cli package",
      "after installing the cli",
      "installed from the local release bundle",
      "run this after installing the cli"
    ].some((marker) => context.includes(marker));
    if (!allowed) {
      const line = contents.slice(0, index).split(/\r?\n/).length;
      const excerpt = contents.slice(index, Math.min(contents.length, index + 120)).replace(/\s+/g, " ");
      throw new Error(`${relative}:${line} uses npx htlm without a nearby install precondition: ${excerpt}`);
    }
    index = lower.indexOf("npx htlm", index + "npx htlm".length);
  }
}

function unique(items) {
  return [...new Set(items)];
}
