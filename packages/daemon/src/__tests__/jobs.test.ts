import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { DownloadManager } from "../downloads/jobs.js";
import { MarketplaceStore } from "../store.js";
import * as hfSource from "../sources/huggingface.js";
import * as utils from "../utils.js";

describe("DownloadManager model hash verification", () => {
  let tempDir: string;
  let store: MarketplaceStore;
  let manager: DownloadManager;
  let mockOllama: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ht-jobs-test-"));
    const dbPath = path.join(tempDir, "test.db");
    store = new MarketplaceStore(dbPath);

    const config = {
      downloadsDir: path.join(tempDir, "downloads"),
      modelsDir: path.join(tempDir, "models")
    } as any;

    mockOllama = {
      status: vi.fn().mockResolvedValue({ online: false }),
      pull: vi.fn()
    };

    manager = new DownloadManager(config, store, mockOllama);
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("completes download when sha256 matches expected", async () => {
    const repoId = "org/model";
    const filename = "model.gguf";
    const targetDir = path.join(tempDir, "models", "huggingface", "org__model");
    const targetPath = path.join(targetDir, filename);

    // Mock Hugging Face fetch to return expected sha256
    const expectedSha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // Empty file sha256
    const fetchShaSpy = vi.spyOn(hfSource, "fetchHuggingFaceFileSha256").mockResolvedValue(expectedSha256);

    // Mock downloadFiles to just write an empty file (which will have the matching sha256)
    const downloadFilesSpy = (vi.spyOn(manager as any, "downloadFiles") as any).mockImplementation(
      async (repo: string, files: string[], rev: string, paths: string[]) => {
        fs.mkdirSync(path.dirname(paths[0]), { recursive: true });
        fs.writeFileSync(paths[0], "", "utf8");
        return { sizeBytes: 0 };
      }
    );

    const request = {
      source: "huggingface" as const,
      repoId,
      filename,
      revision: "main",
      license: "apache-2.0",
      licenseAccepted: true
    };

    const job = await manager.start(request);
    expect(job.status).toBe("running");

    // Wait for the async task inside runHuggingFaceFile to complete
    await new Promise<void>((resolve) => {
      manager.once("change", () => {
        // First change might be status updates, let's wait until it's not running
        const check = () => {
          const updatedJob = manager.list().find((j) => j.id === job.id);
          if (updatedJob && updatedJob.status !== "running") {
            resolve();
          } else {
            setTimeout(check, 10);
          }
        };
        check();
      });
    });

    const finalJob = manager.list().find((j) => j.id === job.id);
    if (finalJob?.status === "failed") {
      console.log("JOB FAILURE DETECTED: ", finalJob.message);
    }
    expect(finalJob?.status).toBe("completed");
    expect(fs.existsSync(targetPath)).toBe(true);

    fetchShaSpy.mockRestore();
    downloadFilesSpy.mockRestore();
  });

  it("fails download and purges files when sha256 mismatches", async () => {
    const repoId = "org/model";
    const filename = "model.gguf";
    const targetDir = path.join(tempDir, "models", "huggingface", "org__model");
    const targetPath = path.join(targetDir, filename);

    // Mock Hugging Face fetch to return expected sha256 that does NOT match empty file
    const expectedSha256 = "different-sha256-string";
    const fetchShaSpy = vi.spyOn(hfSource, "fetchHuggingFaceFileSha256").mockResolvedValue(expectedSha256);

    // Mock downloadFiles to write an empty file (whose sha256 is e3b0c4429...)
    const downloadFilesSpy = (vi.spyOn(manager as any, "downloadFiles") as any).mockImplementation(
      async (repo: string, files: string[], rev: string, paths: string[]) => {
        fs.mkdirSync(path.dirname(paths[0]), { recursive: true });
        fs.writeFileSync(paths[0], "", "utf8");
        return { sizeBytes: 0 };
      }
    );

    const request = {
      source: "huggingface" as const,
      repoId,
      filename,
      revision: "main",
      license: "apache-2.0",
      licenseAccepted: true
    };

    const job = await manager.start(request);

    // Wait for async execution
    await new Promise<void>((resolve) => {
      manager.once("change", () => {
        const check = () => {
          const updatedJob = manager.list().find((j) => j.id === job.id);
          if (updatedJob && updatedJob.status !== "running") {
            resolve();
          } else {
            setTimeout(check, 10);
          }
        };
        check();
      });
    });

    const finalJob = manager.list().find((j) => j.id === job.id);
    expect(finalJob?.status).toBe("failed");
    expect(finalJob?.message).toContain("Model hash verification failed");
    // Verify that the corrupted file was completely purged!
    expect(fs.existsSync(targetPath)).toBe(false);

    fetchShaSpy.mockRestore();
    downloadFilesSpy.mockRestore();
  });
});
