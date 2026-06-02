import os from "node:os";
import path from "node:path";

export interface DaemonConfig {
  host: string;
  port: number;
  storageDir: string;
  modelsDir: string;
  downloadsDir: string;
  dbPath: string;
  allowedOrigins: string[];
  ollamaHost: string;
  lmStudioHost: string;
  llamaCppHost?: string;
  genericOpenAiHost?: string;
  enableEngine: boolean;
  modelScanDirs: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DaemonConfig {
  const storageDir =
    env.HT_MARKETPLACE_HOME ||
    env.HT_STUDIO_HOME ||
    path.join(env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "HT LLM Marketplace");
  const modelsDir = env.HT_MARKETPLACE_MODELS_DIR || env.HT_STUDIO_MODELS_DIR || path.join(storageDir, "models");
  const downloadsDir = env.HT_MARKETPLACE_DOWNLOADS_DIR || env.HT_STUDIO_DOWNLOADS_DIR || path.join(storageDir, "downloads");
  const port = Number.parseInt(env.HT_MARKETPLACE_PORT || env.HT_STUDIO_PORT || "3001", 10);

  return {
    host: env.HT_MARKETPLACE_HOST || env.HT_STUDIO_HOST || "127.0.0.1",
    port: Number.isFinite(port) ? port : 3001,
    storageDir,
    modelsDir,
    downloadsDir,
    dbPath: env.HT_MARKETPLACE_DB || env.HT_STUDIO_DB || path.join(storageDir, "marketplace.sqlite"),
    allowedOrigins: parseOrigins(env.HT_MARKETPLACE_ALLOWED_ORIGINS || env.HT_STUDIO_ALLOWED_ORIGINS),
    ollamaHost: (env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/$/, ""),
    lmStudioHost: (env.LM_STUDIO_HOST || "http://127.0.0.1:1234").replace(/\/$/, ""),
    llamaCppHost: env.LLAMA_CPP_HOST?.replace(/\/$/, ""),
    genericOpenAiHost: env.OPENAI_COMPATIBLE_BASE_URL?.replace(/\/$/, ""),
    enableEngine: (env.HT_MARKETPLACE_ENGINE || env.HT_STUDIO_ENGINE) !== "off",
    modelScanDirs: (env.HT_MARKETPLACE_MODEL_DIRS || env.HT_STUDIO_MODEL_DIRS || "")
      .split(/[;,]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  };
}

function parseOrigins(raw?: string): string[] {
  const defaults = [
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3009",
    "http://localhost:3009",
    "http://127.0.0.1:5173",
    "http://localhost:5173"
  ];
  if (!raw) return defaults;
  return [...defaults, ...raw.split(",").map((item) => item.trim()).filter(Boolean)];
}
