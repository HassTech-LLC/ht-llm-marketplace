import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";

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

export interface LlamaServerInstallRequest {
  flavor?: "auto" | "vulkan" | "cpu" | "cuda";
  force?: boolean;
  release?: string;
}

export interface LlamaServerInstallStatus {
  ok: boolean;
  installed: boolean;
  binaryPath?: string;
  release?: string;
  asset?: string;
  sourceUrl?: string;
  message: string;
}

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  assets: GithubReleaseAsset[];
}

const BINARY_NAMES = os.platform() === "win32" ? ["llama-server.exe", "server.exe"] : ["llama-server", "server"];
const RELEASE_API = "https://api.github.com/repos/ggml-org/llama.cpp/releases";
const DOWNLOAD_LIMIT_BYTES = 750_000_000;

export class LlamaServerManager {
  private child?: ChildProcess;
  private lastMessage?: string;

  constructor(private options: LlamaServerManagerOptions = {}) {}

  configure(options: LlamaServerManagerOptions) {
    this.options = {
      ...this.options,
      ...options,
      searchRoots: options.searchRoots ?? this.options.searchRoots,
      extraArgs: options.extraArgs ?? this.options.extraArgs
    };
  }

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
    const manifestBinary = binaryFromManifest(root);
    if (manifestBinary) return manifestBinary;
    for (const candidate of candidatePaths(root)) {
      if (fs.existsSync(candidate)) return candidate;
    }
    const managedBinary = path.basename(root) === "llama-server" ? findBinaryRecursive(root, 4) : undefined;
    if (managedBinary) return managedBinary;
  }
  for (const entry of pathEnv.split(path.delimiter).filter(Boolean)) {
    for (const name of BINARY_NAMES) {
      const candidate = path.join(entry, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

export function llamaServerManagedRoot(storageDir: string) {
  return path.join(storageDir, "tools", "llama-server");
}

export async function installManagedLlamaServer(
  storageDir: string,
  request: LlamaServerInstallRequest = {}
): Promise<LlamaServerInstallStatus> {
  const root = llamaServerManagedRoot(storageDir);
  fs.mkdirSync(root, { recursive: true });
  const existing = findLlamaServerBinary([root], "");
  if (existing && !request.force) {
    return {
      ok: true,
      installed: true,
      binaryPath: existing,
      message: `Managed llama-server is already installed at ${existing}.`
    };
  }

  const release = await fetchLlamaRelease(request.release);
  const asset = selectLlamaServerAsset(release.assets, {
    platform: os.platform(),
    arch: os.arch(),
    flavor: request.flavor || "auto"
  });
  if (!asset) {
    return {
      ok: false,
      installed: false,
      release: release.tag_name,
      message: `No llama.cpp release asset matched ${os.platform()} ${os.arch()} (${request.flavor || "auto"}).`
    };
  }

  const releaseSegment = safeManagedPathSegment(release.tag_name, "release");
  const assetSegment = safeManagedPathSegment(asset.name, "asset");
  const assetDir = path.join(root, releaseSegment, assetSegment.replace(/\.(zip|tar\.gz)$/i, ""));
  const archivePath = path.join(root, `${releaseSegment}-${assetSegment}`);
  fs.rmSync(assetDir, { recursive: true, force: true });
  fs.mkdirSync(assetDir, { recursive: true });
  await downloadFile(asset.browser_download_url, archivePath);
  await extractArchive(archivePath, assetDir);
  const binaryPath = findLlamaServerBinary([assetDir], "");
  if (!binaryPath) {
    return {
      ok: false,
      installed: false,
      release: release.tag_name,
      asset: asset.name,
      sourceUrl: asset.browser_download_url,
      message: "Downloaded llama.cpp release, but no llama-server binary was found inside the archive."
    };
  }
  const manifest = {
    installedAt: new Date().toISOString(),
    release: release.tag_name,
    asset: asset.name,
    sourceUrl: asset.browser_download_url,
    binaryPath
  };
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
  return {
    ok: true,
    installed: true,
    binaryPath,
    release: release.tag_name,
    asset: asset.name,
    sourceUrl: asset.browser_download_url,
    message: `Installed managed llama-server ${release.tag_name} at ${binaryPath}.`
  };
}

export function selectLlamaServerAsset(
  assets: GithubReleaseAsset[],
  options: { platform?: NodeJS.Platform; arch?: string; flavor?: LlamaServerInstallRequest["flavor"] } = {}
) {
  const platform = options.platform || os.platform();
  const arch = options.arch || os.arch();
  const flavor = options.flavor || "auto";
  const names = assets.map((asset) => asset.name);

  if (platform === "win32") {
    const suffix = arch === "arm64" ? "arm64.zip" : "x64.zip";
    const preferred =
      flavor === "cpu"
        ? [`bin-win-cpu-${suffix}`]
        : flavor === "cuda"
          ? [`bin-win-cuda-13`, `bin-win-cuda-12`]
          : flavor === "vulkan" || flavor === "auto"
            ? [`bin-win-vulkan-${suffix}`, `bin-win-cpu-${suffix}`]
            : [`bin-win-cpu-${suffix}`];
    return matchAsset(assets, names, preferred);
  }

  if (platform === "darwin") {
    const suffix = arch === "arm64" ? "macos-arm64.tar.gz" : "macos-x64.tar.gz";
    return matchAsset(assets, names, [suffix]);
  }

  if (platform === "linux") {
    const suffix = arch === "arm64" ? "arm64.tar.gz" : "x64.tar.gz";
    const preferred =
      flavor === "vulkan" || flavor === "auto"
        ? [`ubuntu-vulkan-${suffix}`, `ubuntu-${suffix}`]
        : [`ubuntu-${suffix}`];
    return matchAsset(assets, names, preferred);
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

function binaryFromManifest(root: string) {
  try {
    const manifestPath = path.join(root, "manifest.json");
    if (!fs.existsSync(manifestPath)) return undefined;
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { binaryPath?: unknown };
    if (
      typeof parsed.binaryPath === "string" &&
      fs.existsSync(parsed.binaryPath) &&
      isPathInside(root, parsed.binaryPath)
    ) {
      return parsed.binaryPath;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function findBinaryRecursive(root: string, depth: number): string | undefined {
  if (depth < 0 || !fs.existsSync(root)) return undefined;
  for (const name of BINARY_NAMES) {
    const candidate = path.join(root, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  if (depth === 0) return undefined;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const nested = findBinaryRecursive(path.join(root, entry.name), depth - 1);
    if (nested) return nested;
  }
  return undefined;
}

function matchAsset(assets: GithubReleaseAsset[], names: string[], patterns: string[]) {
  for (const pattern of patterns) {
    const index = names.findIndex((name) => name.includes(pattern));
    if (index >= 0) return assets[index];
  }
  return undefined;
}

function escapePowerShellLiteral(value: string) {
  return value.replace(/'/g, "''");
}

async function fetchLlamaRelease(tag?: string): Promise<GithubRelease> {
  const url = tag ? `${RELEASE_API}/tags/${encodeURIComponent(tag)}` : `${RELEASE_API}/latest`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "ht-llm-marketplace"
    }
  });
  if (!response.ok) throw new Error(`Unable to resolve llama.cpp release (${response.status}).`);
  return (await response.json()) as GithubRelease;
}

async function downloadFile(url: string, target: string) {
  if (!isTrustedLlamaReleaseUrl(url)) {
    throw new Error("Refusing llama-server download from an untrusted release URL.");
  }
  const response = await fetch(url, {
    headers: {
      "user-agent": "ht-llm-marketplace"
    }
  });
  if (!response.ok || !response.body) throw new Error(`Unable to download llama-server archive (${response.status}).`);
  const size = Number(response.headers.get("content-length") || "0");
  if (size > DOWNLOAD_LIMIT_BYTES) throw new Error("llama-server archive is larger than the managed installer limit.");
  try {
    await pipeline(response.body as unknown as NodeJS.ReadableStream, byteLimitTransform(DOWNLOAD_LIMIT_BYTES), createWriteStream(target));
  } catch (error) {
    fs.rmSync(target, { force: true });
    throw error;
  }
}

export function safeManagedPathSegment(value: string, fallback = "item") {
  const cleaned = value
    .replace(/[\\/]+/g, "__")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^\.+$/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  return /[a-zA-Z0-9]/.test(cleaned) ? cleaned : fallback;
}

export function isTrustedLlamaReleaseUrl(value: string) {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "github.com" ||
        parsed.hostname === "objects.githubusercontent.com" ||
        parsed.hostname === "release-assets.githubusercontent.com")
    );
  } catch {
    return false;
  }
}

function byteLimitTransform(maxBytes: number) {
  let bytes = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        callback(new Error(`Download exceeded the managed installer limit of ${maxBytes} bytes.`));
        return;
      }
      callback(null, chunk);
    }
  });
}

function isPathInside(root: string, candidate: string) {
  const resolvedRoot = fs.existsSync(root) ? fs.realpathSync(root) : path.resolve(root);
  const resolvedCandidate = fs.existsSync(candidate) ? fs.realpathSync(candidate) : path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function extractArchive(archivePath: string, targetDir: string) {
  if (archivePath.endsWith(".zip")) {
    await runExtractor(
      process.platform === "win32" ? "powershell.exe" : "pwsh",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${escapePowerShellLiteral(archivePath)}' -DestinationPath '${escapePowerShellLiteral(targetDir)}' -Force`
      ]
    );
    return;
  }
  if (archivePath.endsWith(".tar.gz")) {
    await runExtractor("tar", ["-xzf", archivePath, "-C", targetDir]);
    return;
  }
  throw new Error(`Unsupported llama-server archive format: ${archivePath}`);
}

async function runExtractor(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with code ${code ?? "unknown"}${stderr ? `: ${stderr.slice(-500)}` : ""}`));
    });
  });
}
