export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
export const DEFAULT_JSON_RESPONSE_LIMIT = 5 * 1024 * 1024;
export const README_RESPONSE_LIMIT = 512 * 1024;

interface FetchOptions extends RequestInit {
  timeoutMs?: number;
}

export async function fetchWithTimeout(input: string | URL | Request, init: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, signal, ...rest } = init;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new Error(`Request timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function responseTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`Response is too large (${contentLength} bytes; max ${maxBytes})`);
  }

  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new Error(`Response is too large (max ${maxBytes} bytes)`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`Response is too large (max ${maxBytes} bytes)`);
    }
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

export async function fetchTextWithLimit(
  input: string | URL | Request,
  init: FetchOptions & { maxBytes?: number } = {}
): Promise<Response & { limitedText: () => Promise<string> }> {
  const { maxBytes = DEFAULT_JSON_RESPONSE_LIMIT, ...fetchInit } = init;
  const response = await fetchWithTimeout(input, fetchInit);
  return Object.assign(response, {
    limitedText: () => responseTextWithLimit(response, maxBytes)
  });
}

export async function fetchJsonWithLimit<T>(
  input: string | URL | Request,
  init: FetchOptions & { maxBytes?: number } = {}
): Promise<T> {
  const { maxBytes = DEFAULT_JSON_RESPONSE_LIMIT, ...fetchInit } = init;
  const response = await fetchWithTimeout(input, {
    ...fetchInit,
    headers: { accept: "application/json", ...(fetchInit.headers || {}) }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return JSON.parse(await responseTextWithLimit(response, maxBytes)) as T;
}
