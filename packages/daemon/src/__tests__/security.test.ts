import { describe, expect, it } from "vitest";
import { evaluateGuard, evaluatePrivilegedActionGuard, isAllowedLocalOrigin, isConfiguredOrigin, isLoopbackHost } from "../server.js";

const config = { host: "127.0.0.1", allowedOrigins: ["http://127.0.0.1:3000", "http://127.0.0.1:3009", "http://localhost:5173"] };

describe("isLoopbackHost", () => {
  it("accepts loopback hosts", () => {
    expect(isLoopbackHost("127.0.0.1:3001", config)).toBe(true);
    expect(isLoopbackHost("localhost:3001", config)).toBe(true);
    expect(isLoopbackHost("[::1]:3001", config)).toBe(true);
  });

  it("rejects non-loopback hosts (DNS rebinding guard)", () => {
    expect(isLoopbackHost("evil.com", config)).toBe(false);
    expect(isLoopbackHost("attacker.example:3001", config)).toBe(false);
    expect(isLoopbackHost(undefined, config)).toBe(false);
  });

  it("accepts a configured non-loopback host and the wildcard escape hatch", () => {
    expect(isLoopbackHost("192.168.1.5:3001", { host: "192.168.1.5", allowedOrigins: [] })).toBe(true);
    expect(isLoopbackHost("anything.com", { host: "127.0.0.1", allowedOrigins: ["*"] })).toBe(true);
  });
});

describe("isAllowedLocalOrigin", () => {
  it("allows loopback origins for read/CORS handling", () => {
    expect(isAllowedLocalOrigin("http://127.0.0.1:8123", config.allowedOrigins)).toBe(true);
    expect(isAllowedLocalOrigin("http://localhost:5173", config.allowedOrigins)).toBe(true);
  });

  it("rejects remote origins", () => {
    expect(isAllowedLocalOrigin("https://evil.com", config.allowedOrigins)).toBe(false);
  });
});

describe("isConfiguredOrigin", () => {
  it("only allows exact configured origins for state-changing browser requests", () => {
    expect(isConfiguredOrigin("http://127.0.0.1:3000", config.allowedOrigins)).toBe(true);
    expect(isConfiguredOrigin("http://127.0.0.1:8123", config.allowedOrigins)).toBe(false);
  });
});

describe("evaluateGuard", () => {
  it("blocks a state-changing request from a remote browser origin (drive-by localhost)", () => {
    const result = evaluateGuard({ method: "POST", host: "127.0.0.1:3001", origin: "https://evil.com" }, config);
    expect(result.ok).toBe(false);
  });

  it("allows a state-changing request from a configured studio origin", () => {
    const result = evaluateGuard({ method: "POST", host: "127.0.0.1:3001", origin: "http://127.0.0.1:3000" }, config);
    expect(result.ok).toBe(true);
  });

  it("blocks a state-changing request from an unconfigured localhost origin", () => {
    const result = evaluateGuard({ method: "POST", host: "127.0.0.1:3001", origin: "http://127.0.0.1:8123" }, config);
    expect(result.ok).toBe(false);
  });

  it("allows a state-changing request with no Origin (CLI / SDK from Node)", () => {
    expect(evaluateGuard({ method: "POST", host: "127.0.0.1:3001" }, config).ok).toBe(true);
  });

  it("does not apply the Origin rule to GETs (widget assets, reads)", () => {
    expect(evaluateGuard({ method: "GET", host: "127.0.0.1:3001", origin: "https://evil.com" }, config).ok).toBe(true);
  });

  it("blocks any request with a rebound (non-loopback) Host", () => {
    expect(evaluateGuard({ method: "GET", host: "evil.com" }, config).ok).toBe(false);
    expect(evaluateGuard({ method: "POST", host: "evil.com", origin: "http://127.0.0.1:3000" }, config).ok).toBe(false);
  });
});

describe("evaluatePrivilegedActionGuard", () => {
  it("requires an explicit confirmation header for command-style endpoints", () => {
    const result = evaluatePrivilegedActionGuard(
      { method: "POST", pathname: "/api/engine/upgrade", origin: "http://127.0.0.1:3000", headers: {} },
      config
    );
    expect(result.ok).toBe(false);
  });

  it("allows confirmed command-style endpoints from configured origins", () => {
    const result = evaluatePrivilegedActionGuard(
      {
        method: "POST",
        pathname: "/api/engine/upgrade",
        origin: "http://127.0.0.1:3000",
        headers: { "x-ht-marketplace-confirm": "privileged-action" }
      },
      config
    );
    expect(result.ok).toBe(true);
  });

  it("blocks confirmed command-style endpoints from arbitrary localhost origins", () => {
    const result = evaluatePrivilegedActionGuard(
      {
        method: "POST",
        pathname: "/api/runtimes/install",
        origin: "http://127.0.0.1:8123",
        headers: { "x-ht-marketplace-confirm": "privileged-action" }
      },
      config
    );
    expect(result.ok).toBe(false);
  });
});
