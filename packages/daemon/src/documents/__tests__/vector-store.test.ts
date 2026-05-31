import { describe, expect, it } from "vitest";
import { mergeDocumentResults, semanticSearch } from "../vector-store.js";

describe("document vector search", () => {
  it("ranks document chunks by cosine similarity", () => {
    const results = semanticSearch(
      [1, 0],
      [
        { documentId: "doc1", documentName: "A", chunkIndex: 0, content: "alpha", model: "hash", dimensions: 2, vector: [0.1, 0.9] },
        { documentId: "doc2", documentName: "B", chunkIndex: 0, content: "beta", model: "hash", dimensions: 2, vector: [0.9, 0.1] }
      ],
      1
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ documentId: "doc2", source: "semantic" });
  });

  it("merges lexical and semantic matches without duplicate citations", () => {
    const merged = mergeDocumentResults(
      [{ documentId: "doc1", documentName: "A", chunkIndex: 0, content: "alpha", score: 0.4, source: "lexical" }],
      [{ documentId: "doc1", documentName: "A", chunkIndex: 0, content: "alpha", score: 0.8, source: "semantic" }],
      3
    );

    expect(merged).toEqual([
      { documentId: "doc1", documentName: "A", chunkIndex: 0, content: "alpha", score: 0.8, source: "hybrid" }
    ]);
  });
});
