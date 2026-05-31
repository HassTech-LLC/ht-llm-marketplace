import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type {
  ArtifactVerification,
  BenchmarkResult,
  DeletePlan,
  DownloadJob,
  EngineRuntimeConfig,
  InventoryArtifact,
  LocalResponsesResponse,
  RuntimeId
} from "@ht-llm-marketplace/sdk";
import { defaultRuntimeConfig, sanitizeRuntimeConfig } from "./runtime/config.js";

export interface ArtifactInput {
  id?: string;
  source: string;
  runtime: RuntimeId;
  name: string;
  displayName?: string;
  repoId?: string;
  filename?: string;
  revision?: string;
  path?: string;
  sizeBytes?: number;
  sha256?: string;
  verificationStatus?: ArtifactVerification["status"];
  verifiedAt?: string;
  expectedBytes?: number;
  actualBytes?: number;
  sourceUrl?: string;
  etag?: string;
  lastModified?: string;
  owned: boolean;
  runnable: boolean;
  loaded?: boolean;
  notes?: string[];
}

export class MarketplaceStore {
  readonly db: DatabaseSync;

  constructor(readonly dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.migrate();
  }

  close() {
    this.db.close();
  }

  upsertArtifact(input: ArtifactInput): InventoryArtifact {
    const now = new Date().toISOString();
    const existing = input.id ? this.getArtifact(input.id) : undefined;
    const id = input.id || randomUUID();
    const notes = JSON.stringify(input.notes || []);

    this.db
      .prepare(
        `INSERT INTO artifacts
          (id, source, runtime, name, display_name, repo_id, filename, revision, path, size_bytes, sha256, verification_status, verified_at, expected_bytes, actual_bytes, source_url, etag, last_modified, owned, runnable, loaded, notes, created_at, updated_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          source=excluded.source,
          runtime=excluded.runtime,
          name=excluded.name,
          display_name=excluded.display_name,
          repo_id=excluded.repo_id,
          filename=excluded.filename,
          revision=excluded.revision,
          path=excluded.path,
          size_bytes=excluded.size_bytes,
          sha256=excluded.sha256,
          verification_status=excluded.verification_status,
          verified_at=excluded.verified_at,
          expected_bytes=excluded.expected_bytes,
          actual_bytes=excluded.actual_bytes,
          source_url=excluded.source_url,
          etag=excluded.etag,
          last_modified=excluded.last_modified,
          owned=excluded.owned,
          runnable=excluded.runnable,
          loaded=excluded.loaded,
          notes=excluded.notes,
          updated_at=excluded.updated_at`
      )
      .run(
        id,
        input.source,
        input.runtime,
        input.name,
        input.displayName || null,
        input.repoId || null,
        input.filename || null,
        input.revision || null,
        input.path || null,
        input.sizeBytes || null,
        input.sha256 || null,
        input.verificationStatus || "unverified",
        input.verifiedAt || null,
        input.expectedBytes || null,
        input.actualBytes || input.sizeBytes || null,
        input.sourceUrl || null,
        input.etag || null,
        input.lastModified || null,
        input.owned ? 1 : 0,
        input.runnable ? 1 : 0,
        input.loaded ? 1 : 0,
        notes,
        existing?.createdAt || now,
        now
      );

    const artifact = this.getArtifact(id);
    if (!artifact) throw new Error("Failed to persist artifact");
    return artifact;
  }

  getArtifact(id: string): InventoryArtifact | undefined {
    const row = this.db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id);
    return row ? mapArtifact(row as Row) : undefined;
  }

  listArtifacts(): InventoryArtifact[] {
    return this.db
      .prepare("SELECT * FROM artifacts ORDER BY updated_at DESC")
      .all()
      .map((row) => mapArtifact(row as Row));
  }

  setArtifactVerification(input: ArtifactVerification): ArtifactVerification {
    this.db
      .prepare(
        `UPDATE artifacts
         SET verification_status = ?, verified_at = ?, sha256 = COALESCE(?, sha256), expected_bytes = COALESCE(?, expected_bytes), actual_bytes = COALESCE(?, actual_bytes), updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.status,
        input.verifiedAt || new Date().toISOString(),
        input.sha256 || null,
        input.expectedBytes || null,
        input.actualBytes || null,
        new Date().toISOString(),
        input.artifactId
      );
    return input;
  }

  deleteArtifact(id: string) {
    this.db.prepare("DELETE FROM artifacts WHERE id = ?").run(id);
  }

  upsertJob(job: DownloadJob): DownloadJob {
    this.db
      .prepare(
        `INSERT INTO jobs
          (id, type, status, progress, source, target, message, total_bytes, downloaded_bytes, artifact_id, started_at, updated_at, request_payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status=excluded.status,
          progress=excluded.progress,
          source=excluded.source,
          target=excluded.target,
          message=excluded.message,
          total_bytes=excluded.total_bytes,
          downloaded_bytes=excluded.downloaded_bytes,
          artifact_id=excluded.artifact_id,
          updated_at=excluded.updated_at,
          request_payload=excluded.request_payload`
      )
      .run(
        job.id,
        job.type,
        job.status,
        job.progress,
        job.source,
        job.target,
        job.message,
        job.totalBytes || null,
        job.downloadedBytes || null,
        job.artifactId || null,
        job.startedAt,
        job.updatedAt,
        job.requestPayload || null
      );
    return job;
  }

  listJobs(): DownloadJob[] {
    return this.db
      .prepare("SELECT * FROM jobs ORDER BY updated_at DESC LIMIT 100")
      .all()
      .map((row) => mapJob(row as Row));
  }

  saveDeletePlan(plan: DeletePlan): DeletePlan {
    this.db
      .prepare(
        `INSERT INTO delete_plans (id, artifact_id, status, target_name, reclaim_bytes, plan_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status=excluded.status,
          target_name=excluded.target_name,
          reclaim_bytes=excluded.reclaim_bytes,
          plan_json=excluded.plan_json`
      )
      .run(plan.id, plan.artifactId, plan.status, plan.targetName, plan.reclaimBytes, JSON.stringify(plan), plan.createdAt);
    return plan;
  }

  getDeletePlan(id: string): DeletePlan | undefined {
    const row = this.db.prepare("SELECT plan_json FROM delete_plans WHERE id = ?").get(id) as { plan_json?: string } | undefined;
    return row?.plan_json ? (JSON.parse(row.plan_json) as DeletePlan) : undefined;
  }

  audit(type: string, target: string, details: unknown) {
    this.db
      .prepare("INSERT INTO audit_log (id, type, target, details, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(randomUUID(), type, target, JSON.stringify(details), new Date().toISOString());
  }

  listAuditLog() {
    return this.db
      .prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200")
      .all()
      .map((row) => {
        const item = row as Row;
        return {
          id: String(item.id),
          type: String(item.type),
          target: String(item.target),
          details: item.details ? JSON.parse(String(item.details)) : undefined,
          createdAt: String(item.created_at)
        };
      });
  }

  addBenchmark(input: BenchmarkResult): BenchmarkResult {
    this.db
      .prepare(
        `INSERT INTO benchmarks
          (id, model, runtime, prompt, first_token_ms, total_ms, tokens_per_second, token_count, ok, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.model,
        input.runtime,
        input.prompt,
        input.firstTokenMs,
        input.totalMs,
        input.tokensPerSecond,
        input.tokenCount,
        input.ok ? 1 : 0,
        input.error || null,
        input.createdAt
      );
    return input;
  }

  listBenchmarks(limit = 100): BenchmarkResult[] {
    return this.db
      .prepare("SELECT * FROM benchmarks ORDER BY created_at DESC LIMIT ?")
      .all(limit)
      .map((row) => mapBenchmark(row as Row));
  }

  addResponse(input: { id: string; model: string; request: unknown; response: LocalResponsesResponse; createdAt?: string }): LocalResponsesResponse {
    this.db
      .prepare(
        `INSERT INTO responses (id, model, request_json, response_json, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           model=excluded.model,
           request_json=excluded.request_json,
           response_json=excluded.response_json`
      )
      .run(input.id, input.model, JSON.stringify(input.request), JSON.stringify(input.response), input.createdAt || new Date().toISOString());
    return input.response;
  }

  getResponse(id: string): LocalResponsesResponse | undefined {
    const row = this.db.prepare("SELECT response_json FROM responses WHERE id = ?").get(id) as { response_json?: string } | undefined;
    return row?.response_json ? (JSON.parse(row.response_json) as LocalResponsesResponse) : undefined;
  }

  getRuntimeConfig(): EngineRuntimeConfig {
    const row = this.db.prepare("SELECT config_json FROM runtime_config WHERE id = 'default'").get() as { config_json?: string } | undefined;
    if (!row?.config_json) return defaultRuntimeConfig();
    try {
      return sanitizeRuntimeConfig(JSON.parse(row.config_json));
    } catch {
      return defaultRuntimeConfig();
    }
  }

  setRuntimeConfig(config: EngineRuntimeConfig): EngineRuntimeConfig {
    const sanitized = sanitizeRuntimeConfig(config);
    this.db
      .prepare(
        `INSERT INTO runtime_config (id, config_json, updated_at)
         VALUES ('default', ?, ?)
         ON CONFLICT(id) DO UPDATE SET config_json=excluded.config_json, updated_at=excluded.updated_at`
      )
      .run(JSON.stringify(sanitized), new Date().toISOString());
    return sanitized;
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        runtime TEXT NOT NULL,
        name TEXT NOT NULL,
        display_name TEXT,
        repo_id TEXT,
        filename TEXT,
        revision TEXT,
        path TEXT,
        size_bytes INTEGER,
        sha256 TEXT,
        verification_status TEXT NOT NULL DEFAULT 'unverified',
        verified_at TEXT,
        expected_bytes INTEGER,
        actual_bytes INTEGER,
        source_url TEXT,
        etag TEXT,
        last_modified TEXT,
        owned INTEGER NOT NULL DEFAULT 0,
        runnable INTEGER NOT NULL DEFAULT 0,
        loaded INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        progress REAL NOT NULL,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        message TEXT NOT NULL,
        total_bytes INTEGER,
        downloaded_bytes INTEGER,
        artifact_id TEXT,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        request_payload TEXT
      );

      CREATE TABLE IF NOT EXISTS delete_plans (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        status TEXT NOT NULL,
        target_name TEXT NOT NULL,
        reclaim_bytes INTEGER NOT NULL,
        plan_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        target TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS benchmarks (
        id TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        runtime TEXT NOT NULL,
        prompt TEXT NOT NULL,
        first_token_ms REAL NOT NULL,
        total_ms REAL NOT NULL,
        tokens_per_second REAL NOT NULL,
        token_count INTEGER NOT NULL,
        ok INTEGER NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS responses (
        id TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        request_json TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runtime_config (
        id TEXT PRIMARY KEY,
        config_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    try {
      this.db.exec("ALTER TABLE jobs ADD COLUMN request_payload TEXT");
    } catch {
      // Ignored if column already exists
    }
    for (const statement of [
      "ALTER TABLE artifacts ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unverified'",
      "ALTER TABLE artifacts ADD COLUMN verified_at TEXT",
      "ALTER TABLE artifacts ADD COLUMN expected_bytes INTEGER",
      "ALTER TABLE artifacts ADD COLUMN actual_bytes INTEGER",
      "ALTER TABLE artifacts ADD COLUMN source_url TEXT",
      "ALTER TABLE artifacts ADD COLUMN etag TEXT",
      "ALTER TABLE artifacts ADD COLUMN last_modified TEXT"
    ]) {
      try {
        this.db.exec(statement);
      } catch {
        // Ignored if column already exists
      }
    }
  }
}

type Row = Record<string, unknown>;

function mapArtifact(row: Row): InventoryArtifact {
  const owned = Number(row.owned) === 1;
  return {
    id: String(row.id),
    source: String(row.source),
    runtime: row.runtime as RuntimeId,
    name: String(row.name),
    displayName: nullableString(row.display_name),
    repoId: nullableString(row.repo_id),
    filename: nullableString(row.filename),
    revision: nullableString(row.revision),
    path: nullableString(row.path),
    sizeBytes: nullableNumber(row.size_bytes),
    sha256: nullableString(row.sha256),
    verificationStatus: (nullableString(row.verification_status) || "unverified") as ArtifactVerification["status"],
    verifiedAt: nullableString(row.verified_at),
    expectedBytes: nullableNumber(row.expected_bytes),
    actualBytes: nullableNumber(row.actual_bytes),
    sourceUrl: nullableString(row.source_url),
    etag: nullableString(row.etag),
    lastModified: nullableString(row.last_modified),
    owned,
    runnable: Number(row.runnable) === 1,
    loaded: Number(row.loaded) === 1,
    notes: row.notes ? JSON.parse(String(row.notes)) : [],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deleteEligible: owned,
  };
}

function mapBenchmark(row: Row): BenchmarkResult {
  return {
    id: String(row.id),
    model: String(row.model),
    runtime: row.runtime as RuntimeId,
    prompt: String(row.prompt),
    firstTokenMs: Number(row.first_token_ms),
    totalMs: Number(row.total_ms),
    tokensPerSecond: Number(row.tokens_per_second),
    tokenCount: Number(row.token_count),
    ok: Number(row.ok) === 1,
    error: nullableString(row.error),
    createdAt: String(row.created_at)
  };
}

function mapJob(row: Row): DownloadJob {
  return {
    id: String(row.id),
    type: row.type as DownloadJob["type"],
    status: row.status as DownloadJob["status"],
    progress: Number(row.progress),
    source: String(row.source),
    target: String(row.target),
    message: String(row.message),
    totalBytes: nullableNumber(row.total_bytes),
    downloadedBytes: nullableNumber(row.downloaded_bytes),
    artifactId: nullableString(row.artifact_id),
    requestPayload: nullableString(row.request_payload),
    startedAt: String(row.started_at),
    updatedAt: String(row.updated_at)
  };
}

function nullableString(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function nullableNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
