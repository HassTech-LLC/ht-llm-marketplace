import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targets = [
  "packages/sdk/dist",
  "packages/react/dist",
  "packages/web-component/dist",
  "packages/daemon/dist",
  "packages/cli/dist",
  "apps/studio/dist"
];

for (const target of targets) {
  const absolute = path.resolve(root, target);
  assertInsideWorkspace(absolute);
  fs.rmSync(absolute, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}

function assertInsideWorkspace(target) {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clear path outside workspace: ${target}`);
  }
}
