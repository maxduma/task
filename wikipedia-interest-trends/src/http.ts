// Small HTTP helper: descriptive User-Agent (required by Wikimedia policy), retry with backoff,
// and a typed JSON fetch that treats 404 as "no data" rather than an error.

const USER_AGENT =
  process.env.WIT_USER_AGENT ??
  "wikipedia-interest-trends/0.1 (Agent Skill; https://github.com/; set WIT_USER_AGENT to your contact)";

const MAX_RETRIES = 4;
// Base backoff; doubles each retry. Keeps us polite to the shared Wikimedia API.
const BASE_DELAY_MS = 500;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface JsonResult<T> {
  status: number;
  data: T | null;
}

/** GET JSON. Returns data=null for 404 (no data for this query). Retries 429/5xx/network errors. */
export async function getJson<T>(url: string): Promise<JsonResult<T>> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
      if (res.status === 404) return { status: 404, data: null };
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : BASE_DELAY_MS * 2 ** attempt;
        if (attempt < MAX_RETRIES) {
          await sleep(delay);
          continue;
        }
        throw new HttpError(res.status, `HTTP ${res.status} for ${url}`);
      }
      if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} for ${url}`);
      const data = (await res.json()) as T;
      return { status: res.status, data };
    } catch (err) {
      lastError = err;
      if (err instanceof HttpError) throw err;
      // Network/parse error: back off and retry.
      if (attempt < MAX_RETRIES) {
        await sleep(BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Request failed: ${url}`);
}
