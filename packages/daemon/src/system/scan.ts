import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RuntimeStatus, SystemGpu, SystemScan } from "@ht-llm-marketplace/sdk";
import { fileSize, runCommand } from "../utils.js";

export async function scanSystem(modelsDir: string, runtimes: RuntimeStatus[]): Promise<SystemScan> {
  const notes: string[] = [];
  const disk = scanDisk(modelsDir);
  if (!disk.totalBytes) notes.push("Disk totals are unavailable on this Node/platform combination.");

  const gpus = await scanNvidiaGpus();
  if (gpus.length === 0) notes.push("No NVIDIA GPU was reported by nvidia-smi.");

  return {
    os: {
      platform: os.platform(),
      arch: os.arch(),
      cpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      freeMemoryBytes: os.freemem()
    },
    disk,
    gpus,
    runtimes,
    notes,
    scannedAt: new Date().toISOString()
  };
}

function scanDisk(modelsDir: string) {
  fs.mkdirSync(modelsDir, { recursive: true });
  let totalBytes: number | undefined;
  let freeBytes: number | undefined;
  try {
    const stat = fs.statfsSync(modelsDir);
    totalBytes = Number(stat.blocks) * Number(stat.bsize);
    freeBytes = Number(stat.bavail) * Number(stat.bsize);
  } catch {
    totalBytes = undefined;
    freeBytes = undefined;
  }

  return {
    totalBytes,
    freeBytes,
    modelsBytes: directoryBytes(modelsDir)
  };
}

function directoryBytes(root: string): number {
  if (!fs.existsSync(root)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) total += directoryBytes(fullPath);
    if (entry.isFile()) total += fileSize(fullPath) || 0;
  }
  return total;
}

async function scanNvidiaGpus(): Promise<SystemGpu[]> {
  const result = await runCommand(
    "nvidia-smi",
    [
      "--query-gpu=name,driver_version,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu",
      "--format=csv,noheader,nounits"
    ],
    10000
  );
  if (!result.ok || !result.stdout) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.split(",").map((part) => part.trim()))
    .filter((parts) => parts.length >= 7)
    .map(([name, driverVersion, total, used, free, util, temp]) => ({
      name,
      driverVersion,
      memoryTotalBytes: mib(total),
      memoryUsedBytes: mib(used),
      memoryFreeBytes: mib(free),
      utilizationPercent: numberOrUndefined(util),
      temperatureC: numberOrUndefined(temp)
    }));
}

function mib(value?: string): number | undefined {
  const parsed = numberOrUndefined(value);
  return parsed === undefined ? undefined : parsed * 1024 * 1024;
}

function numberOrUndefined(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
