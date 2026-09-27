// Minimal localization for generated reports. Static labels + direction/confidence words are
// translated for the languages used in the examples; everything else falls back to English.

export type Dict = {
  titleDefault: string;
  window: string;
  generated: string;
  source: string;
  chartCaption: string;
  findings: string;
  confidenceHdr: string;
  caveatsHdr: string;
  articles: string;
  rising: string;
  falling: string;
  flat: string;
  popLabel: string; // "recent vs previous"
  cagrLabel: string;
  confHigh: string;
  confMedium: string;
  confLow: string;
  noData: string;
};

const EN: Dict = {
  titleDefault: "Wikipedia interest trends",
  window: "Window",
  generated: "Generated",
  source: "Source: Wikimedia Pageviews API (agent=user)",
  chartCaption: "Monthly pageviews",
  findings: "Key findings",
  confidenceHdr: "Confidence",
  caveatsHdr: "Assumptions & limitations",
  articles: "Articles analyzed",
  rising: "rising",
  falling: "falling",
  flat: "no clear trend",
  popLabel: "recent vs previous period",
  cagrLabel: "CAGR",
  confHigh: "high",
  confMedium: "medium",
  confLow: "low",
  noData: "no data",
};

const DICTS: Record<string, Dict> = {
  en: EN,
  uk: {
    titleDefault: "Динаміка інтересу у Wikipedia",
    window: "Період",
    generated: "Згенеровано",
    source: "Джерело: Wikimedia Pageviews API (agent=user)",
    chartCaption: "Перегляди за місяць",
    findings: "Ключові висновки",
    confidenceHdr: "Довіра",
    caveatsHdr: "Припущення та обмеження",
    articles: "Проаналізовані статті",
    rising: "зростає",
    falling: "спадає",
    flat: "без чіткого тренду",
    popLabel: "останній період проти попереднього",
    cagrLabel: "CAGR",
    confHigh: "висока",
    confMedium: "середня",
    confLow: "низька",
    noData: "немає даних",
  },
  pl: {
    titleDefault: "Trendy zainteresowania w Wikipedii",
    window: "Okres",
    generated: "Wygenerowano",
    source: "Źródło: Wikimedia Pageviews API (agent=user)",
    chartCaption: "Miesięczne wyświetlenia",
    findings: "Kluczowe wnioski",
    confidenceHdr: "Zaufanie",
    caveatsHdr: "Założenia i ograniczenia",
    articles: "Analizowane artykuły",
    rising: "rośnie",
    falling: "spada",
    flat: "brak wyraźnego trendu",
    popLabel: "ostatni vs poprzedni okres",
    cagrLabel: "CAGR",
    confHigh: "wysokie",
    confMedium: "średnie",
    confLow: "niskie",
    noData: "brak danych",
  },
  cs: {
    titleDefault: "Trendy zájmu na Wikipedii",
    window: "Období",
    generated: "Vygenerováno",
    source: "Zdroj: Wikimedia Pageviews API (agent=user)",
    chartCaption: "Měsíční zobrazení",
    findings: "Klíčová zjištění",
    confidenceHdr: "Důvěra",
    caveatsHdr: "Předpoklady a omezení",
    articles: "Analyzované články",
    rising: "roste",
    falling: "klesá",
    flat: "bez jasného trendu",
    popLabel: "poslední vs předchozí období",
    cagrLabel: "CAGR",
    confHigh: "vysoká",
    confMedium: "střední",
    confLow: "nízká",
    noData: "žádná data",
  },
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  uk: "Ukrainian",
  pl: "Polish",
  cs: "Czech",
  de: "German",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ru: "Russian",
  ja: "Japanese",
  zh: "Chinese",
  tr: "Turkish",
  sv: "Swedish",
  ro: "Romanian",
  hu: "Hungarian",
  fi: "Finnish",
};

export function dictFor(lang: string): Dict {
  return DICTS[lang] ?? EN;
}

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ? `${LANGUAGE_NAMES[code]} (${code})` : code;
}
