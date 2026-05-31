export interface ChunkInput {
  documentId: string;
  content: string;
  index: number;
}

export function chunkText(content: string, chunkSize = 1200, overlap = 120): ChunkInput[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const chunks: ChunkInput[] = [];
  let offset = 0;
  let index = 0;
  while (offset < normalized.length) {
    const end = Math.min(normalized.length, offset + chunkSize);
    chunks.push({ documentId: "", content: normalized.slice(offset, end), index });
    if (end === normalized.length) break;
    offset = Math.max(0, end - overlap);
    index += 1;
  }
  return chunks;
}

export function lexicalScore(query: string, content: string) {
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 2);
  if (terms.length === 0) return 0;
  const haystack = content.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) / terms.length;
}

export interface RagCitation {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  score: number;
  content: string;
}

export function buildDocumentPrompt(question: string, citations: RagCitation[]) {
  const context = citations.length
    ? citations.map((item, index) => `[${index + 1}] ${item.documentName} chunk ${item.chunkIndex + 1}: ${item.content}`).join("\n\n")
    : "No matching local document chunks were found.";
  return [
    "Answer using only the local document context below.",
    "If the context is insufficient, say exactly what is missing.",
    "",
    context,
    "",
    `Question: ${question}`
  ].join("\n");
}
