import fs from "node:fs";
import path from "node:path";

const [from, to] = process.argv.slice(2);

if (!from || !to) {
  throw new Error("Usage: node scripts/copy-file.mjs <from> <to>");
}

fs.mkdirSync(path.dirname(to), { recursive: true });
fs.copyFileSync(from, to);
