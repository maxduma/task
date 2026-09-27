// Shared types for the Wikipedia interest-trends skill.

export type Granularity = "daily" | "monthly";
export type Access = "all-access" | "desktop" | "mobile-app" | "mobile-web";
export type Agent = "user" | "all-agents" | "spider" | "automated";

/** One time-bucket of pageviews. `date` is ISO (YYYY-MM-DD) at the bucket start. */
export interface PageviewPoint {
  date: string;
  views: number;
}

export interface Series {
  language: string;
  project: string;
  article: string;
  granularity: Granularity;
  access: Access;
  agent: Agent;
  points: PageviewPoint[];
  /** True when the API returned no data for this article/range (404 or empty). */
  empty: boolean;
}

export type ResolveMethod = "override" | "wikidata" | "search" | "none";

export interface ResolvedArticle {
  language: string;
  project: string;
  title: string | null;
  qid: string | null;
  method: ResolveMethod;
  confidence: "high" | "medium" | "low";
  note?: string;
}

export type Confidence = "high" | "medium" | "low";

export interface TrendStats {
  /** OLS slope of views over the bucket index (views per bucket). */
  slope: number;
  intercept: number;
  r2: number;
  /** Mann-Kendall statistic and two-sided p-value. */
  mkS: number;
  mkTau: number;
  mkZ: number;
  mkPValue: number;
  /** Sen's slope: robust median slope (views per bucket). */
  sensSlope: number;
  /** Annualized relative trend from Sen's slope vs mean, in percent. */
  sensSlopeAnnualizedPct: number;
  direction: "increasing" | "decreasing" | "flat";
  significant: boolean;
}

export interface GrowthStats {
  recentMean: number;
  previousMean: number;
  periodOverPeriodPct: number | null;
  cagrPct: number | null;
  comparisonWindowMonths: number;
}

export interface SeasonalityStats {
  detected: boolean;
  strength: number;
  peakMonth: number | null;
  troughMonth: number | null;
  note?: string;
}

export interface SpikeStats {
  spikeDates: string[];
  spikeShareOfTotal: number;
  growthRobustToSpikes: boolean;
}

export interface SeriesAnalysis {
  language: string;
  project: string;
  article: string;
  resolveMethod: ResolveMethod;
  resolveConfidence: Confidence;
  granularity: Granularity;
  monthsCovered: number;
  dataStart: string | null;
  dataEnd: string | null;
  totalViews: number;
  meanMonthly: number;
  lastValue: number;
  volumeBucket: "very-low" | "low" | "medium" | "high";
  volatilityCoV: number;
  missingBuckets: number;
  growth: GrowthStats;
  trend: TrendStats;
  seasonality: SeasonalityStats;
  spikes: SpikeStats;
  confidence: Confidence;
  confidenceReasons: string[];
  caveats: string[];
}

export interface Comparison {
  rankedByGrowth: Array<{
    language: string;
    periodOverPeriodPct: number | null;
    confidence: Confidence;
  }>;
  strongest: string | null;
  weakest: string | null;
  notes: string[];
}

export interface AnalysisArtifact {
  topic: string | null;
  languages: string[];
  window: { from: string; to: string; months: number };
  granularity: Granularity;
  access: Access;
  agent: Agent;
  resolved: ResolvedArticle[];
  series: Series[];
  results: SeriesAnalysis[];
  comparison: Comparison;
  caveats: string[];
  generatedAt: string;
}
