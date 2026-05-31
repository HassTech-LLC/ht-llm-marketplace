import type { DocumentSearchResult } from "@ht-llm-marketplace/sdk";
import { cosineSimilarity } from "../embeddings/local.js";

export interface DocumentChunk {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
}

export interface StoredDocumentEmbedding extends DocumentChunk {
  model: string;
  dimensions: number;
  vector: number[];
}

export function semanticSearch(
  queryVector: number[],
  embeddings: StoredDocumentEmbedding[],
  limit: number
): DocumentSearchResult[] {
  return embeddings
    .map((embedding) => ({
      documentId: embedding.documentId,
      documentName: embedding.documentName,
      chunkIndex: embedding.chunkIndex,
      content: embedding.content,
      score: cosineSimilarity(queryVector, embedding.vector),
      source: "semantic" as const
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function mergeDocumentResults(
  lexical: DocumentSearchResult[],
  semantic: DocumentSearchResult[],
  limit: number
): DocumentSearchResult[] {
  const merged = new Map<string, DocumentSearchResult>();
  for (const result of lexical) {
    merged.set(key(result), { ...result, source: result.source || "lexical" });
  }
  for (const result of semantic) {
    const existing = merged.get(key(result));
    if (!existing) {
      merged.set(key(result), result);
      continue;
    }
    merged.set(key(result), {
      ...existing,
      score: Number(Math.max(existing.score, result.score).toFixed(6)),
      source: "hybrid"
    });
  }
  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function key(result: Pick<DocumentSearchResult, "documentId" | "chunkIndex">) {
  return `${result.documentId}:${result.chunkIndex}`;
}
