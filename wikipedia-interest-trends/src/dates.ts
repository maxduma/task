// Date helpers: window resolution, API date formatting, and monthly aggregation.
import type { PageviewPoint } from "./types.ts";

// The Wikimedia per-article API serves data starting on this date.
export const DATA_FLOOR = "2015-07-01";

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO YYYY-MM-DD -> API YYYYMMDD. */
export function toApiDate(iso: string): string {
  return iso.replace(/-/g, "");
}

/** API timestamp YYYYMMDDHH -> ISO YYYY-MM-DD. */
export function timestampToIso(ts: string): string {
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Accepts YYYY-MM or YYYY-MM-DD and returns the first day (YYYY-MM-DD). */
export function normalizeStart(s: string): string {
  return s.length === 7 ? `${s}-01` : s;
}

/** Accepts YYYY-MM or YYYY-MM-DD and returns the last day of the month for YYYY-MM. */
export function normalizeEnd(s: string): string {
  if (s.length === 7) {
    const [y, m] = s.split("-").map(Number);
    const last = new Date(Date.UTC(y!, m!, 0));
    return isoDate(last);
  }
  return s;
}

/** Whole months spanned, inclusive of both endpoints' months. */
export function monthsBetween(fromIso: string, toIso: string): number {
  const [fy, fm] = fromIso.split("-").map(Number);
  const [ty, tm] = toIso.split("-").map(Number);
  return (ty! - fy!) * 12 + (tm! - fm!) + 1;
}

export interface Window {
  from: string;
  to: string;
  months: number;
}

/**
 * Resolve the analysis window. Explicit from/to win. Otherwise use `window` months ending at the
 * last COMPLETE month (the current month is excluded because its pageviews are still accumulating).
 * Clamped to the API data floor.
 */
export function resolveWindow(opts: { from?: string; to?: string; window?: number; now?: Date }): Window {
  const now = opts.now ?? new Date();
  const normFrom = opts.from ? normalizeStart(opts.from) : null;
  const normTo = opts.to ? normalizeEnd(opts.to) : null;

  let from: string;
  let to: string;
  if (normFrom && normTo) {
    from = normFrom;
    to = normTo;
  } else {
    const windowMonths = opts.window && opts.window > 0 ? Math.floor(opts.window) : 24;
    // Last day of the previous month.
    const lastComplete = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    const endYear = lastComplete.getUTCFullYear();
    const endMonth0 = lastComplete.getUTCMonth();
    to = normTo ?? isoDate(lastComplete);
    from = normFrom ?? isoDate(new Date(Date.UTC(endYear, endMonth0 - (windowMonths - 1), 1)));
  }

  if (from < DATA_FLOOR) from = DATA_FLOOR;
  return { from, to, months: monthsBetween(from, to) };
}

/** Sum daily (or any) points into monthly buckets keyed by the first of the month. */
export function aggregateToMonthly(points: PageviewPoint[]): PageviewPoint[] {
  const byMonth = new Map<string, number>();
  for (const p of points) {
    const key = monthKey(p.date);
    byMonth.set(key, (byMonth.get(key) ?? 0) + p.views);
  }
  return [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, views]) => ({ date: `${key}-01`, views }));
}

/** Month number 1-12 from an ISO date. */
export function monthOf(iso: string): number {
  return Number(iso.slice(5, 7));
}
