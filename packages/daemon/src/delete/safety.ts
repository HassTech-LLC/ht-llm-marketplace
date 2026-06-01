import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DeletePlan } from "@ht-llm-marketplace/sdk";
import type { OllamaAdapter } from "../adapters/ollama.js";
import type { MarketplaceStore } from "../store.js";
import { fileSize } from "../utils.js";

export interface DeleteContext {
  store: MarketplaceStore;
  ollama: OllamaAdapter;
  roots: string[];
}

export function createDeletePlan(context: DeleteContext, artifactId: string): DeletePlan {
  const artifact = context.store.getArtifact(artifactId);
  const now = new Date().toISOString();
  if (!artifact) throw new Error(`Artifact not found: ${artifactId}`);

  const blockedReasons: string[] = [];
  const providerActions: string[] = [];
  const fileActions: DeletePlan["fileActions"] = [];
  const evidence: string[] = [];

  if (!artifact.owned) {
    blockedReasons.push("Artifact is not marketplace-owned; deletion is refused.");
  }

  if (artifact.runtime === "ollama") {
    providerActions.push(`Unregister Ollama model '${artifact.name}'.`);
  }

  if (artifact.path) {
    const safe = isPathInsideAnyRoot(artifact.path, context.roots);
    if (!safe.ok) {
      blockedReasons.push(safe.reason);
    } else if (fs.existsSync(artifact.path)) {
      fileActions.push({ path: artifact.path, sizeBytes: fileSize(artifact.path), action: "delete-file" });
      evidence.push(`Resolved file is inside registered marketplace storage root.`);
    } else {
      evidence.push("Owned file path is already absent; provider unregister may still be needed.");
    }
  }

  if (providerActions.length === 0 && fileActions.length === 0) {
    blockedReasons.push("No provider or file action could be planned.");
  }

  const plan: DeletePlan = {
    id: randomUUID(),
    artifactId,
    status: blockedReasons.length > 0 ? "blocked" : "planned",
    targetName: artifact.displayName || artifact.name,
    reclaimBytes: fileActions.reduce((total, action) => total + (action.sizeBytes || 0), 0),
    providerActions,
    fileActions,
    blockedReasons,
    unknownLeftovers: [],
    evidence,
    createdAt: now
  };
  return context.store.saveDeletePlan(plan);
}

export async function confirmDeletePlan(context: DeleteContext, planId: string): Promise<DeletePlan> {
  const plan = context.store.getDeletePlan(planId);
  if (!plan) throw new Error(`Delete plan not found: ${planId}`);
  if (plan.status === "blocked") throw new Error(`Delete plan is blocked: ${plan.blockedReasons.join("; ")}`);

  const artifact = context.store.getArtifact(plan.artifactId);
  if (!artifact) throw new Error(`Artifact not found: ${plan.artifactId}`);

  if (artifact.runtime === "ollama") {
    await context.ollama.deleteModel(artifact.name);
  }

  for (const action of plan.fileActions) {
    const safe = isPathInsideAnyRoot(action.path, context.roots);
    if (!safe.ok) throw new Error(safe.reason);
    if (fs.existsSync(action.path) && action.action === "delete-file") {
      fs.unlinkSync(action.path);
    }
  }

  if (artifact.path && fs.existsSync(artifact.path)) {
    throw new Error("Post-delete scan failed: owned artifact file still exists.");
  }

  context.store.deleteArtifact(artifact.id);
  const executed = { ...plan, status: "executed" as const, evidence: [...plan.evidence, "Post-delete scan confirmed owned artifact is absent."] };
  context.store.saveDeletePlan(executed);
  context.store.audit("delete", artifact.name, executed);
  return executed;
}

export function isPathInsideAnyRoot(candidate: string, roots: string[]): { ok: true } | { ok: false; reason: string } {
  const resolvedCandidate = realOrResolved(candidate);
  for (const root of roots) {
    const resolvedRoot = realOrResolved(root);
    const relative = path.relative(resolvedRoot, resolvedCandidate);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
      return { ok: true };
    }
  }
  return { ok: false, reason: `Refusing to operate outside registered marketplace roots: ${candidate}` };
}

function realOrResolved(value: string) {
  let resolved = fs.existsSync(value) ? fs.realpathSync(value) : path.resolve(value);
  if (process.platform === "win32") {
    resolved = resolved.charAt(0).toLowerCase() + resolved.slice(1);
  }
  return resolved;
}
