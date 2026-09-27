// Build the visual artifacts: a comparison line chart (SVG -> PNG via resvg) and a one-page PDF
// (pdfkit). Fonts are bundled so Cyrillic and Latin diacritics render deterministically offline.
import { Resvg } from "@resvg/resvg-js";
import PDFDocument from "pdfkit";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { AnalysisArtifact, SeriesAnalysis } from "./types.ts";
import { alignMonthly } from "./analyze.ts";
import { dictFor, languageName, type Dict } from "./i18n.ts";

const here = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(here, "..", "assets", "fonts");
const FONT_REGULAR = join(FONT_DIR, "DejaVuSans.ttf");
const FONT_BOLD = join(FONT_DIR, "DejaVuSans-Bold.ttf");
const HAVE_FONTS = existsSync(FONT_REGULAR) && existsSync(FONT_BOLD);

const PALETTE = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2", "#be185d", "#4d7c0f"];

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

function niceCeil(x: number): number {
  if (x <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(x));
  const frac = x / magnitude;
  const niceFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return niceFrac * magnitude;
}

interface ChartSeries {
  label: string;
  color: string;
  dates: string[];
  values: number[];
}

function renderLineChartSVG(
  series: ChartSeries[],
  opts: { width: number; height: number; title: string; caption: string },
): string {
  const { width, height, title, caption } = opts;
  const left = 74;
  const right = 18;
  const top = 54;
  const bottom = 48;
  const innerW = width - left - right;
  const innerH = height - top - bottom;

  const allDates = [...new Set(series.flatMap((s) => s.dates))].sort();
  const idxOf = new Map(allDates.map((d, i) => [d, i]));
  const n = allDates.length;
  const maxVal = Math.max(1, ...series.flatMap((s) => s.values));
  const niceMax = niceCeil(maxVal);

  const xPos = (i: number) => left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yPos = (v: number) => top + innerH - (v / niceMax) * innerH;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="DejaVu Sans, sans-serif">`,
  );
  parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);
  parts.push(`<text x="${left}" y="26" font-size="18" font-weight="bold" fill="#111827">${escapeXml(title)}</text>`);

  // Legend row under the title.
  let lx = left;
  const ly = 42;
  for (const s of series) {
    parts.push(`<rect x="${lx}" y="${ly - 8}" width="10" height="10" fill="${s.color}"/>`);
    parts.push(`<text x="${lx + 14}" y="${ly + 1}" font-size="11" fill="#374151">${escapeXml(s.label)}</text>`);
    lx += 24 + s.label.length * 6.2;
  }

  // Y gridlines + labels.
  const ticks = 5;
  for (let t = 0; t <= ticks; t++) {
    const v = (niceMax / ticks) * t;
    const y = yPos(v);
    parts.push(`<line x1="${left}" y1="${y}" x2="${left + innerW}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`);
    parts.push(`<text x="${left - 8}" y="${y + 3}" font-size="10" text-anchor="end" fill="#6b7280">${formatCompact(v)}</text>`);
  }

  // X ticks (about 6 evenly spaced).
  const xTickCount = Math.min(6, n);
  for (let t = 0; t < xTickCount; t++) {
    const i = xTickCount <= 1 ? 0 : Math.round((t / (xTickCount - 1)) * (n - 1));
    const x = xPos(i);
    parts.push(`<line x1="${x}" y1="${top + innerH}" x2="${x}" y2="${top + innerH + 4}" stroke="#9ca3af" stroke-width="1"/>`);
    parts.push(`<text x="${x}" y="${top + innerH + 18}" font-size="10" text-anchor="middle" fill="#6b7280">${allDates[i]!.slice(0, 7)}</text>`);
  }

  // Axis lines.
  parts.push(`<line x1="${left}" y1="${top}" x2="${left}" y2="${top + innerH}" stroke="#9ca3af" stroke-width="1"/>`);
  parts.push(`<line x1="${left}" y1="${top + innerH}" x2="${left + innerW}" y2="${top + innerH}" stroke="#9ca3af" stroke-width="1"/>`);

  // Series polylines.
  for (const s of series) {
    if (s.values.length === 0) continue;
    const pts = s.dates
      .map((d, k) => `${xPos(idxOf.get(d)!).toFixed(1)},${yPos(s.values[k]!).toFixed(1)}`)
      .join(" ");
    parts.push(`<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`);
  }

  parts.push(`<text x="${left}" y="${height - 12}" font-size="10" fill="#6b7280">${escapeXml(caption)}</text>`);
  parts.push(`</svg>`);
  return parts.join("");
}

function svgToPng(svg: string, zoom: number): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "zoom", value: zoom },
    font: { fontDirs: [FONT_DIR], defaultFontFamily: "DejaVu Sans", loadSystemFonts: false },
  });
  return resvg.render().asPng();
}

function directionWord(r: SeriesAnalysis, d: Dict): string {
  if (r.monthsCovered === 0) return d.noData;
  if (r.trend.direction === "increasing") return d.rising;
  if (r.trend.direction === "decreasing") return d.falling;
  return d.flat;
}

function confWord(c: SeriesAnalysis["confidence"], d: Dict): string {
  return c === "high" ? d.confHigh : c === "medium" ? d.confMedium : d.confLow;
}

export interface ReportResult {
  pdf: string;
  chart: string;
}

export async function buildReport(
  artifact: AnalysisArtifact,
  opts: { reportLang: string; outDir: string; name: string },
): Promise<ReportResult> {
  const d = dictFor(opts.reportLang);
  await mkdir(opts.outDir, { recursive: true });

  // Build chart series from the raw series aligned to monthly buckets.
  const chartSeries: ChartSeries[] = artifact.series.map((s, i) => {
    const aligned = alignMonthly(s, artifact.window);
    return {
      label: s.language.toUpperCase(),
      color: PALETTE[i % PALETTE.length]!,
      dates: aligned.dates,
      values: aligned.values,
    };
  });

  const title = artifact.topic ?? d.titleDefault;
  const svg = renderLineChartSVG(chartSeries, {
    width: 1000,
    height: 460,
    title,
    caption: d.chartCaption + " · agent=user · all-access",
  });
  const png = svgToPng(svg, 2);
  const chartPath = join(opts.outDir, `${opts.name}.png`);
  await writeFile(chartPath, png);

  const pdfPath = join(opts.outDir, `${opts.name}.pdf`);
  await writePdf(pdfPath, { artifact, dict: d, reportLang: opts.reportLang, png });

  return { pdf: pdfPath, chart: chartPath };
}

function writePdf(
  pdfPath: string,
  ctx: { artifact: AnalysisArtifact; dict: Dict; reportLang: string; png: Buffer },
): Promise<void> {
  const { artifact, dict, png } = ctx;
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const body = HAVE_FONTS ? "body" : "Helvetica";
  const bold = HAVE_FONTS ? "bold" : "Helvetica-Bold";
  if (HAVE_FONTS) {
    doc.registerFont("body", FONT_REGULAR);
    doc.registerFont("bold", FONT_BOLD);
  }

  const stream = createWriteStream(pdfPath);
  doc.pipe(stream);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left;

  // Header.
  doc.font(bold).fontSize(18).fillColor("#111827").text(artifact.topic ?? dict.titleDefault, { width: pageWidth });
  const langs = artifact.languages.map((c) => c.toUpperCase()).join(", ");
  doc
    .font(body)
    .fontSize(10)
    .fillColor("#6b7280")
    .text(
      `${langs}  ·  ${dict.window}: ${artifact.window.from} … ${artifact.window.to} (${artifact.window.months} mo)  ·  ${dict.generated}: ${artifact.generatedAt.slice(0, 10)}`,
      { width: pageWidth },
    );
  doc.moveDown(0.5);

  // Chart.
  const chartWidth = pageWidth;
  const chartHeight = chartWidth * (460 / 1000);
  doc.image(png, left, doc.y, { width: chartWidth, height: chartHeight });
  doc.y += chartHeight + 10;

  // Findings.
  doc.font(bold).fontSize(12).fillColor("#111827").text(dict.findings);
  doc.moveDown(0.2);
  doc.font(body).fontSize(10).fillColor("#1f2937");
  for (const r of artifact.results) {
    const pop = r.growth.periodOverPeriodPct;
    const popStr = pop === null ? "—" : `${pop >= 0 ? "+" : ""}${pop.toFixed(0)}%`;
    const line = `${languageName(r.language)}: ${directionWord(r, dict)}, ${popStr} (${dict.popLabel}) — ${dict.confidenceHdr.toLowerCase()}: ${confWord(r.confidence, dict)}`;
    doc.text(`•  ${line}`, { width: pageWidth });
  }
  for (const note of artifact.comparison.notes) {
    doc.fillColor("#374151").text(`•  ${note}`, { width: pageWidth });
  }
  doc.moveDown(0.5);

  // Confidence reasons (compact, one line per language).
  doc.font(bold).fontSize(12).fillColor("#111827").text(dict.confidenceHdr);
  doc.moveDown(0.2);
  doc.font(body).fontSize(9).fillColor("#4b5563");
  for (const r of artifact.results) {
    const reason = r.confidenceReasons[0] ? ` — ${r.confidenceReasons[0]}` : "";
    doc.text(`•  ${r.language.toUpperCase()}: ${confWord(r.confidence, dict)}${reason}`, { width: pageWidth });
  }
  doc.moveDown(0.5);

  // Assumptions & limitations (dedup, cap length to keep one page).
  doc.font(bold).fontSize(12).fillColor("#111827").text(dict.caveatsHdr);
  doc.moveDown(0.2);
  doc.font(body).fontSize(9).fillColor("#4b5563");
  const seen = new Set<string>();
  const caveats: string[] = [];
  for (const r of artifact.results) {
    for (const c of r.caveats) {
      if (!seen.has(c)) {
        seen.add(c);
        caveats.push(c);
      }
    }
  }
  for (const c of caveats.slice(0, 8)) doc.text(`•  ${c}`, { width: pageWidth });
  doc.moveDown(0.5);

  // Footer: exact titles + source.
  doc.font(body).fontSize(8).fillColor("#9ca3af");
  const titles = artifact.resolved
    .map((a) => `${a.language}: ${a.title ?? "—"}${a.method !== "wikidata" && a.method !== "override" ? ` (${a.method})` : ""}`)
    .join("  |  ");
  doc.text(`${dict.articles}: ${titles}`, { width: pageWidth });
  doc.text(dict.source, { width: pageWidth });

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}
