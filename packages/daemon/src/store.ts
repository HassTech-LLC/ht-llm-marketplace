import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { DeletePlan, DownloadJob, InventoryArtifact, RuntimeId } from "@ht-llm-marketplace/sdk";

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
          (id, source, runtime, name, display_name, repo_id, filename, revision, path, size_bytes, sha256, owned, runnable, loaded, notes, created_at, updated_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  deleteArtifact(id: string) {
    this.db.prepare("DELETE FROM artifacts WHERE id = ?").run(id);
  }

  upsertJob(job: DownloadJob): DownloadJob {
    this.db
      .prepare(
        `INSERT INTO jobs
          (id, type, status, progress, source, target, message, total_bytes, downloaded_bytes, artifact_id, started_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status=excluded.status,
          progress=excluded.progress,
          source=excluded.source,
          target=excluded.target,
          message=excluded.message,
          total_bytes=excluded.total_bytes,
          downloaded_bytes=excluded.downloaded_bytes,
          artifact_id=excluded.artifact_id,
          updated_at=excluded.updated_at`
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
        job.updatedAt
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
        updated_at TEXT NOT NULL
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
    `);
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
    owned,
    runnable: Number(row.runnable) === 1,
    loaded: Number(row.loaded) === 1,
    notes: row.notes ? JSON.parse(String(row.notes)) : [],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deleteEligible: owned,
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
