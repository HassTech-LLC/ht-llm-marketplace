export interface LocalEmbeddingRequest {
  model?: string;
  input: string | string[];
  encoding_format?: "float" | "base64";
  dimensions?: number;
  user?: string;
}

export interface LocalEmbeddingResult {
  model: string;
  vectors: number[][];
  tokenEstimate: number;
  dimensions: number;
}

export interface EmbeddingProvider {
  id: string;
  model: string;
  dimensions: number;
  embed(input: string[], options?: { dimensions?: number; signal?: AbortSignal }): Promise<LocalEmbeddingResult>;
}
