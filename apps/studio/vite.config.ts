import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function getActiveUrl() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  
  const searchDirs = [
    process.env.HT_MARKETPLACE_HOME,
    process.env.HT_STUDIO_HOME,
    path.join(localAppData, "HT LLM Marketplace"),
    path.join(localAppData, "HT Studio")
  ].filter(Boolean) as string[];

  for (const dir of searchDirs) {
    const lockfilePath = path.join(dir, "active-daemon.json");
    try {
      if (fs.existsSync(lockfilePath)) {
        const raw = fs.readFileSync(lockfilePath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed?.url) {
          return parsed.url;
        }
      }
    } catch {
      // Ignore reading errors, try next fallback
    }
  }

  return "http://127.0.0.1:3001";
}

const activeUrl = getActiveUrl();

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_HT_MARKETPLACE_API_URL": JSON.stringify(process.env.VITE_HT_MARKETPLACE_API_URL || activeUrl),
    "import.meta.env.VITE_HT_STUDIO_API_URL": JSON.stringify(process.env.VITE_HT_STUDIO_API_URL || activeUrl)
  },
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: false
  }
});
