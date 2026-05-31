import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface LlamaServerStatus {
  available: boolean;
  running: boolean;
  endpoint?: string;
  pid?: number;
  message: string;
}

export interface LlamaServerManagerOptions {
  binaryPath?: string;
  modelPath?: string;
  port?: number;
  parallel?: number;
  continuousBatching?: boolean;
  extraArgs?: string[];
  searchRoots?: string[];
  pathEnv?: string;
}

const BINARY_NAMES = os.platform() === "win32" ? ["llama-server.exe", "server.exe"] : ["llama-server", "server"];

export class LlamaServerManager {
  private child?: ChildProcess;
  private lastMessage?: string;

  constructor(private readonly options: LlamaServerManagerOptions = {}) {}

  status(): LlamaServerStatus {
    const binary = this.resolveBinary();
    const endpoint = `http://127.0.0.1:${this.port}`;
    const running = Boolean(this.child && !this.child.killed && this.child.exitCode === null);
    if (!binary) {
      return {
        available: false,
        running: false,
        endpoint,
        message: "Delegated llama-server mode is configured, but no llama-server binary was found."
      };
    }
    if (running) {
      return {
        available: true,
        running: true,
        endpoint,
        pid: this.child?.pid,
        message: this.lastMessage || `llama-server is running from ${binary}.`
      };
    }
    return {
      available: true,
      running: false,
      endpoint,
      message: this.options.modelPath
        ? `llama-server binary found at ${binary}.`
        : `llama-server binary found at ${binary}; set LLAMA_SERVER_MODEL before delegated startup.`
    };
  }

  async start(): Promise<LlamaServerStatus> {
    const binary = this.resolveBinary();
    if (!binary || !this.options.modelPath) return this.status();
    if (this.child && !this.child.killed && this.child.exitCode === null) return this.status();
    const args = [
      "--model",
      this.options.modelPath,
      "--port",
      String(this.port),
      "--parallel",
      String(this.options.parallel ?? 4),
      ...(this.options.continuousBatching === false ? [] : ["--cont-batching"]),
      ...(this.options.extraArgs || [])
    ];
    this.child = spawn(binary, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    this.lastMessage = `llama-server startup requested on port ${this.port}.`;
    this.child.stderr?.on("data", (chunk) => {
      this.lastMessage = chunk.toString().trim().slice(-500) || this.lastMessage;
    });
    this.child.stdout?.on("data", (chunk) => {
      this.lastMessage = chunk.toString().trim().slice(-500) || this.lastMessage;
    });
    this.child.once("exit", (code) => {
      this.lastMessage = `llama-server exited with code ${code ?? "unknown"}.`;
    });
    return this.status();
  }

  async stop(): Promise<LlamaServerStatus> {
    const child = this.child;
    if (!child || child.killed || child.exitCode !== null) {
      this.child = undefined;
      return this.status();
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 2_000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill("SIGTERM");
    });
    this.child = undefined;
    return this.status();
  }

  private resolveBinary(): string | undefined {
    if (this.options.binaryPath && fs.existsSync(this.options.binaryPath)) return this.options.binaryPath;
    return findLlamaServerBinary(this.options.searchRoots || [], this.options.pathEnv ?? process.env.PATH ?? "");
  }

  private get port() {
    return this.options.port ?? 8080;
  }
}

export function findLlamaServerBinary(searchRoots: string[] = [], pathEnv = process.env.PATH ?? ""): string | undefined {
  for (const root of searchRoots) {
    for (const candidate of candidatePaths(root)) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  for (const entry of pathEnv.split(path.delimiter).filter(Boolean)) {
    for (const name of BINARY_NAMES) {
      const candidate = path.join(entry, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

function candidatePaths(root: string): string[] {
  const expanded = path.resolve(root);
  const dirs = [
    expanded,
    path.join(expanded, "bin"),
    path.join(expanded, "build", "bin"),
    path.join(expanded, "llama.cpp", "build", "bin")
  ];
  return dirs.flatMap((dir) => BINARY_NAMES.map((name) => path.join(dir, name)));
}
