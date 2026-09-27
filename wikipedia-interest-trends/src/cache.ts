// Tiny file-based JSON cache. Keyed by a stable string; stored under .cache/ as JSON.
// Pageview history is stable once published, so a simple TTL keeps repeated/related queries fast.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(here, "..", ".cache");

// 24h is plenty: months in the past never change; only the last day or two can be revised.
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry<T> {
  fetchedAt: number;
  value: T;
}

function keyToPath(key: string): string {
  const hash = createHash("sha1").update(key).digest("hex");
  return join(CACHE_DIR, `${hash}.json`);
}

export async function getCached<T>(key: string, ttlMs = DEFAULT_TTL_MS): Promise<T | null> {
  try {
    const raw = await readFile(keyToPath(key), "utf8");
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.fetchedAt > ttlMs) return null;
    return entry.value;
  } catch {
    return null;
  }
}

export async function setCached<T>(key: string, value: T): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const entry: CacheEntry<T> = { fetchedAt: Date.now(), value };
  await writeFile(keyToPath(key), JSON.stringify(entry), "utf8");
}
