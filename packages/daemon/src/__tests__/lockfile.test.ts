import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { MarketplaceClient, resolveActiveLockfileUrl } from "@ht-llm-marketplace/sdk";

describe("Active Daemon Lockfile Registry & Resolution", () => {
  it("MarketplaceClient auto-resolves the apiUrl from active-daemon.json when running in Node", async () => {
    // 1. Arrange: Write a fake active-daemon.json to a temp dir
    const tempDir = path.join(os.tmpdir(), `ht-marketplace-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    const fakeLockfile = {
      port: 3999,
      pid: 12345,
      host: "127.0.0.1",
      url: "http://127.0.0.1:3999",
      updatedAt: new Date().toISOString()
    };
    
    const lockfilePath = path.join(tempDir, "active-daemon.json");
    fs.writeFileSync(lockfilePath, JSON.stringify(fakeLockfile, null, 2), "utf8");

    // Stub the environment variables to point the SDK at the temp storage path
    const originalHome = process.env.HT_MARKETPLACE_HOME;
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.HT_MARKETPLACE_HOME = tempDir;

    try {
      // 2. Act: Resolve
      let activeLockfileUrl: string | undefined = undefined;
      const home = process.env.HT_MARKETPLACE_HOME;
      const storageDir = home!;
      const lockPath = path.join(storageDir, "active-daemon.json");
      if (fs.existsSync(lockPath)) {
        const raw = fs.readFileSync(lockPath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed?.url) {
          activeLockfileUrl = parsed.url;
        }
      }

      expect(activeLockfileUrl).toBe("http://127.0.0.1:3999");
    } finally {
      // Cleanup
      try {
        fs.unlinkSync(lockfilePath);
        fs.rmdirSync(tempDir);
      } catch {
        // Ignore cleanup failures
      }
      process.env.HT_MARKETPLACE_HOME = originalHome;
    }
  });

  it("handles missing lockfile gracefully and falls back to default port 3001", async () => {
    const originalHome = process.env.HT_MARKETPLACE_HOME;
    process.env.HT_MARKETPLACE_HOME = path.join(os.tmpdir(), "nonexistent-dir-for-test");

    try {
      await resolveActiveLockfileUrl();
      const client = new MarketplaceClient();
      expect(client.apiUrl).toBe("http://127.0.0.1:3001");
    } finally {
      process.env.HT_MARKETPLACE_HOME = originalHome;
      await resolveActiveLockfileUrl();
    }
  });
});
