#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.js";
import { createContext, createServer } from "./server.js";

const config = loadConfig();
const context = createContext(config);
const server = createServer(context);
const lockfilePath = path.join(config.storageDir, "active-daemon.json");

function startServer(port: number) {
  server.once("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      if (port >= 3010) {
        console.error(`Port sliding range exceeded (3001-3010). Could not bind daemon server.`);
        process.exit(1);
      }
      console.warn(`Port ${port} is already in use. Sliding to ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error("Fatal daemon server error:", err);
      process.exit(1);
    }
  });

  server.listen(port, config.host, () => {
    console.log(`HT Local LLM Marketplace daemon listening on http://${config.host}:${port}`);
    config.port = port;
    try {
      fs.mkdirSync(config.storageDir, { recursive: true });
      fs.writeFileSync(
        lockfilePath,
        JSON.stringify(
          {
            port,
            pid: process.pid,
            host: config.host,
            url: `http://${config.host}:${port}`,
            updatedAt: new Date().toISOString()
          },
          null,
          2
        ),
        "utf8"
      );
    } catch (err) {
      console.error("Failed to write daemon active-daemon.json lockfile:", err);
    }
  });
}

startServer(config.port);

function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down daemon.`);
  try {
    if (fs.existsSync(lockfilePath)) {
      fs.unlinkSync(lockfilePath);
    }
  } catch {
    // Ignore unlink errors during exit
  }
  server.close(() => {
    context.store.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
