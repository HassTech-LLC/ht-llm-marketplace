import { l2Normalize, trimDimensions } from "./local.js";
import type { EmbeddingProvider, LocalEmbeddingResult } from "./types.js";

interface TransformersOptions {
  model: string;
  dimensions: number;
}

type FeatureExtractionPipeline = (input: string[], options: { pooling: "mean"; normalize: true }) => Promise<{ tolist(): number[][] }>;

let cachedPipeline: FeatureExtractionPipeline | undefined;
let cachedModel: string | undefined;

export function createTransformersEmbeddingProvider(options: TransformersOptions): EmbeddingProvider {
  return {
    id: "transformers-js",
    model: options.model,
    dimensions: options.dimensions,
    async embed(input, requestOptions): Promise<LocalEmbeddingResult> {
      const vectors = await embedWithTransformers(options.model, input);
      const output = vectors.map((vector) => l2Normalize(trimDimensions(vector, requestOptions?.dimensions)));
      return {
        model: options.model,
        vectors: output,
        tokenEstimate: estimateTokens(input),
        dimensions: output[0]?.length || requestOptions?.dimensions || options.dimensions
      };
    }
  };
}

async function embedWithTransformers(model: string, input: string[]): Promise<number[][]> {
  if (!cachedPipeline || cachedModel !== model) {
    const importPackage = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<{
      pipeline: (task: string, model: string, options?: Record<string, unknown>) => Promise<FeatureExtractionPipeline>;
    }>;
    const transformers = await importPackage("@huggingface/transformers");
    cachedPipeline = await transformers.pipeline("feature-extraction", model, { dtype: "q8" });
    cachedModel = model;
  }
  const result = await cachedPipeline(input, { pooling: "mean", normalize: true });
  return result.tolist();
}

function estimateTokens(input: string[]) {
  return input.reduce((sum, text) => sum + Math.max(1, Math.ceil(text.length / 4)), 0);
}
