export interface DesktopDaemonStatus {
  ok: boolean;
  url: string;
  message: string;
}

export const DEFAULT_DAEMON_URL = "http://127.0.0.1:3001";

export async function waitForDaemon(
  url = DEFAULT_DAEMON_URL,
  options: { attempts?: number; delayMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<DesktopDaemonStatus> {
  const attempts = options.attempts ?? 40;
  const delayMs = options.delayMs ?? 250;
  const fetchImpl = options.fetchImpl ?? fetch;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(`${url}/health`);
      if (response.ok) return { ok: true, url, message: "Daemon is healthy." };
    } catch {
      /* daemon may still be starting */
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return { ok: false, url, message: "Daemon did not become healthy before timeout." };
}
