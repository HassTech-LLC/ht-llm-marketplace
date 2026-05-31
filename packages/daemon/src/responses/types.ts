export interface LocalResponsesRequest {
  model?: string;
  input: string | Array<{ role?: string; content?: string | Array<{ type: string; text?: string }> }>;
  instructions?: string;
  stream?: boolean;
  max_output_tokens?: number;
  temperature?: number;
  response_format?: unknown;
  tools?: unknown[];
  tool_choice?: unknown;
  store?: boolean;
  previous_response_id?: string;
}

export interface LocalResponsesUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}
