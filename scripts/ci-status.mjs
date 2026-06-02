import { spawnSync } from "node:child_process";

const limit = process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || "5";
const workflow = process.argv.find((arg) => arg.startsWith("--workflow="))?.split("=")[1] || "ci.yml";

const gh = spawnSync("gh", ["--version"], { encoding: "utf8" });
if (gh.status !== 0) {
  console.error("GitHub CLI is required for ci:status. Install gh and authenticate with `gh auth login`.");
  process.exit(1);
}

const result = spawnSync("gh", [
  "run",
  "list",
  "--workflow",
  workflow,
  "--limit",
  limit,
  "--json",
  "databaseId,status,conclusion,headBranch,headSha,displayTitle,createdAt,url"
], { encoding: "utf8", maxBuffer: 1024 * 1024 });

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

const runs = JSON.parse(result.stdout || "[]");
if (!runs.length) {
  console.log(`No runs found for ${workflow}.`);
  process.exit(0);
}

for (const run of runs) {
  const sha = run.headSha ? run.headSha.slice(0, 7) : "unknown";
  console.log(`${run.status}/${run.conclusion || "pending"} ${sha} ${run.headBranch} ${run.displayTitle}`);
  console.log(`  ${run.url}`);
}
