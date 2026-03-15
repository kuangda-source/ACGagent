import Parser from "rss-parser";
import { fetch } from "undici";
import type { DailyDigestView, NewsArticleSummary } from "@/lib/types";
import { getAppStore } from "@/server/persistence/app-state";
import { getSettings } from "@/server/settings/service";
import { translateNewsBatch } from "@/server/providers/llm-provider";
import { closeDispatcher, createRequestDispatcher } from "@/server/providers/shared";

interface Source {
  id: string;
  name: string;
  url: string;
  homepage: string;
  kind: "anime" | "comic" | "game" | "industry" | "mixed";
}

type NewsCategory = "anime" | "comic" | "game" | "industry" | "event" | "other";

const sources: Source[] = [
  {
    id: "myanimelist",
    name: "MyAnimeList News",
    url: "https://myanimelist.net/rss/news.xml",
    homepage: "https://myanimelist.net/news",
    kind: "mixed"
  },
  {
    id: "otakuusa",
    name: "Otaku USA",
    url: "https://otakuusamagazine.com/feed/",
    homepage: "https://otakuusamagazine.com",
    kind: "mixed"
  },
  {
    id: "gamespot",
    name: "GameSpot",
    url: "https://www.gamespot.com/feeds/mashup/",
    homepage: "https://www.gamespot.com",
    kind: "game"
  },
  {
    id: "ign",
    name: "IGN",
    url: "https://www.ign.com/articles?output=xml",
    homepage: "https://www.ign.com",
    kind: "game"
  },
  {
    id: "rpgsite",
    name: "RPG Site",
    url: "https://www.rpgsite.net/feed",
    homepage: "https://www.rpgsite.net",
    kind: "game"
  },
  {
    id: "gcores",
    name: "机核 GCORES",
    url: "https://www.gcores.com/rss",
    homepage: "https://www.gcores.com",
    kind: "mixed"
  },
  {
    id: "ithome",
    name: "IT之家",
    url: "https://www.ithome.com/rss/",
    homepage: "https://www.ithome.com",
    kind: "industry"
  },
  {
    id: "4gamers",
    name: "4Gamers",
    url: "https://www.4gamers.com.tw/rss/latest-news",
    homepage: "https://www.4gamers.com.tw",
    kind: "mixed"
  }
];

const parser = new Parser<Record<string, unknown>, Record<string, unknown>>();

function stripHtml(value: string) {
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }
  const cleaned = stripHtml(value);
  return cleaned || fallback;
}

function safeIsoDate(value: unknown) {
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return new Date().toISOString();
}

function safeUrl(value: unknown, fallback: string) {
  if (typeof value === "string") {
    try {
      const parsed = new URL(value);
      return parsed.toString();
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function normalizeCategory(category: string): NewsCategory {
  const normalized = category.toLowerCase().trim();
  if (["anime", "comic", "game", "industry", "event", "other"].includes(normalized)) {
    return normalized as NewsCategory;
  }
  return "other";
}

function isAcgRelevant(title: string, summary: string, categories: string[], source: Source) {
  if (source.kind === "game") {
    return true;
  }

  const text = `${title} ${summary} ${categories.join(" ")}`.toLowerCase();
  return /(anime|animation|manga|comic|acg|otaku|jrpg|rpg|steam|playstation|xbox|switch|nintendo|gacha|visual novel|hoyoverse|mihoyo|动漫|动画|番剧|漫画|国漫|二次元|游戏|主机|手游|网游|steam|米哈游|声优|剧场版|漫展|cosplay|coser)/.test(
    text
  );
}

function detectCategory(title: string, summary: string, source: Source, categories: string[]): NewsCategory {
  const text = `${title} ${summary} ${categories.join(" ")}`.toLowerCase();

  if (/(manga|comic|manhwa|webtoon|serialization|serialized|tankobon|graphic novel|漫画|漫改|连载|单行本|国漫|条漫|少年ジャンプ|周刊少年)/.test(text)) {
    return "comic";
  }

  if (/(steam|ps5|ps4|xbox|switch|sale|discount|demo|patch|jrpg|dlc|gameplay|game awards|游戏|主机|电竞|手游|网游|发售|更新|补丁|试玩|折扣|上架)/.test(text)) {
    return "game";
  }

  if (/(anime|animation|animator|voice actor|new season|动漫|动画|番剧|剧场版|声优|新番)/.test(text)) {
    return "anime";
  }

  if (/(industry|studio|publisher|earnings|acquire|investment|业界|工作室|厂商|财报|融资|收购|合作|发布会)/.test(text)) {
    return "industry";
  }

  if (/(event|concert|live|festival|convention|expo|stage|活动|展会|漫展|嘉年华|演唱会|赛事)/.test(text)) {
    return "event";
  }

  if (source.kind === "comic") {
    return "comic";
  }

  if (source.kind === "game") {
    return "game";
  }

  if (source.kind === "industry") {
    return "industry";
  }

  if (source.id === "myanimelist") {
    return "anime";
  }

  return "other";
}

function buildArticleId(sourceId: string, url: string, title: string) {
  const raw = `${sourceId}-${url || title}`.toLowerCase();
  return raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) || `${sourceId}-item`;
}

function toDateKeyInTimezone(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function yesterdayDateKey(timezone: string, now = new Date()) {
  const localNow = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  localNow.setDate(localNow.getDate() - 1);
  return `${localNow.getFullYear()}-${`${localNow.getMonth() + 1}`.padStart(2, "0")}-${`${localNow.getDate()}`.padStart(2, "0")}`;
}

function dedupeArticles(items: NewsArticleSummary[]) {
  const map = new Map<string, NewsArticleSummary>();

  for (const item of items) {
    const key = `${item.url.toLowerCase()}::${item.title.toLowerCase()}`;
    const existing = map.get(key);

    if (!existing || new Date(item.publishedAt).getTime() > new Date(existing.publishedAt).getTime()) {
      map.set(key, item);
    }
  }

  return [...map.values()];
}

function balanceHighlights(items: NewsArticleSummary[], maxCount: number) {
  const sourceCap = 4;
  const sourceCount = new Map<string, number>();

  const byCategory = new Map<NewsCategory, NewsArticleSummary[]>([
    ["anime", []],
    ["comic", []],
    ["game", []],
    ["industry", []],
    ["event", []],
    ["other", []]
  ]);

  for (const item of items.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt))) {
    const key = normalizeCategory(item.category);
    byCategory.get(key)?.push(item);
  }

  const result: NewsArticleSummary[] = [];

  const rounds: Array<Array<NewsCategory>> = [
    ["anime", "comic", "game"],
    ["anime", "comic", "game"],
    ["anime", "game", "comic"],
    ["industry", "event", "other"]
  ];

  for (const order of rounds) {
    for (const category of order) {
      if (result.length >= maxCount) {
        return result;
      }

      const list = byCategory.get(category) ?? [];
      while (list.length > 0) {
        const candidate = list.shift();
        if (!candidate) {
          break;
        }

        const count = sourceCount.get(candidate.sourceName) ?? 0;
        if (count >= sourceCap) {
          continue;
        }

        sourceCount.set(candidate.sourceName, count + 1);
        result.push(candidate);
        break;
      }
    }
  }

  if (result.length >= maxCount) {
    return result.slice(0, maxCount);
  }

  const leftovers = [...byCategory.values()].flat();
  for (const item of leftovers) {
    if (result.length >= maxCount) {
      break;
    }

    const count = sourceCount.get(item.sourceName) ?? 0;
    if (count >= sourceCap) {
      continue;
    }

    sourceCount.set(item.sourceName, count + 1);
    result.push(item);
  }

  return result;
}

function pickHighlights(all: NewsArticleSummary[], timezone: string, dateKey: string) {
  const yesterday = all.filter((item) => toDateKeyInTimezone(new Date(item.publishedAt), timezone) === dateKey);

  const pool =
    yesterday.length >= 6
      ? yesterday
      : all.filter((item) => Date.now() - new Date(item.publishedAt).getTime() <= 72 * 60 * 60 * 1000);

  return balanceHighlights(pool, 12);
}

function buildNoDataHighlights(dateKey: string): NewsArticleSummary[] {
  return sources.slice(0, 3).map((source, index) => ({
    id: `no-data-${source.id}-${dateKey}`,
    sourceId: source.id,
    title: `${source.name} 暂无可用条目`,
    url: source.homepage,
    summary: `未抓取到 ${dateKey} 的可用新闻，请检查网络或代理设置后重试。`,
    category: source.kind === "game" ? "game" : source.kind === "comic" ? "comic" : "anime",
    sourceName: source.name,
    publishedAt: new Date(Date.now() - index * 60_000).toISOString()
  }));
}

function categoryLabel(category: string) {
  switch (category) {
    case "anime":
      return "动漫";
    case "comic":
      return "漫画";
    case "game":
      return "游戏";
    case "industry":
      return "业界";
    case "event":
      return "活动";
    default:
      return "其他";
  }
}
function summarizeDigest(highlights: NewsArticleSummary[], dateKey: string) {
  const categoryCount = new Map<string, number>();

  for (const item of highlights) {
    categoryCount.set(item.category, (categoryCount.get(item.category) ?? 0) + 1);
  }

  const summary = [...categoryCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => `${categoryLabel(category)} ${count} 条`)
    .join("，");

  return `${dateKey} 共整理 ${highlights.length} 条 ACG 新闻，分类分布：${summary || "暂无"}。`;
}

async function fetchSourceArticles(source: Source, dispatcher?: import("undici").Dispatcher): Promise<NewsArticleSummary[]> {
  try {
    const response = await fetch(source.url, {
      dispatcher,
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8",
        "User-Agent": "ACGagent/0.1 (+https://local.acgagent)"
      },
      signal: AbortSignal.timeout(15_000)
    });

    if (!response.ok) {
      return [];
    }

    const xml = await response.text();
    const feed = await parser.parseString(xml);
    const items = (feed.items ?? []).slice(0, 30);

    return items
      .map((item, index) => {
      const title = normalizeText(item.title, `Untitled ${index + 1}`);
      const originalSummary = normalizeText(item.contentSnippet ?? item.content ?? item.summary, "暂无摘要");
      const summary = originalSummary.slice(0, 220);
      const publishedAt = safeIsoDate(item.isoDate ?? item.pubDate);
      const url = safeUrl(item.link, source.homepage);
      const categories = Array.isArray(item.categories) ? item.categories.map((c) => String(c)) : [];
      const category = detectCategory(title, summary, source, categories);

      return {
        id: buildArticleId(source.id, url, title),
        sourceId: source.id,
        title,
        originalTitle: title,
        url,
        summary,
        originalSummary,
        category,
        keywords: categories,
        sourceName: source.name,
        publishedAt
      } satisfies NewsArticleSummary;
      })
      .filter((item) => isAcgRelevant(item.title, item.summary, item.keywords ?? [], source));
  } catch {
    return [];
  }
}

export async function refreshDailyDigest(): Promise<DailyDigestView> {
  const store = getAppStore();
  const settings = await getSettings();
  const timezone = settings.timezone || "Asia/Shanghai";
  const dateKey = yesterdayDateKey(timezone);
  const dispatcher = createRequestDispatcher(settings);

  try {
    const fetched = (await Promise.all(sources.map((source) => fetchSourceArticles(source, dispatcher)))).flat();
    const realArticles = dedupeArticles(fetched).filter((item) => !item.url.includes("example.com"));

    let highlights = pickHighlights(realArticles, timezone, dateKey);
    highlights = await translateNewsBatch(highlights, settings, dispatcher);

    if (highlights.length === 0 && store.latestDigest?.highlights.length) {
      highlights = store.latestDigest.highlights.filter((item) => !item.url.includes("example.com")).slice(0, 12);
    }

    if (highlights.length === 0) {
      highlights = buildNoDataHighlights(dateKey);
    }

    const digest: DailyDigestView = {
      id: `digest-${dateKey}`,
      title: `${dateKey} ACG 雷达`,
      digestDate: dateKey,
      summary: summarizeDigest(highlights, dateKey),
      highlights
    };

    store.latestDigest = digest;
    return digest;
  } finally {
    await closeDispatcher(dispatcher);
  }
}

export async function getLatestDigest(): Promise<DailyDigestView> {
  const store = getAppStore();
  const settings = await getSettings();
  const dateKey = yesterdayDateKey(settings.timezone || "Asia/Shanghai");
  const latestDigest = store.latestDigest;

  const stale = !latestDigest || latestDigest.digestDate !== dateKey;
  const hasExampleLink = latestDigest?.highlights.some((item) => item.url.includes("example.com")) ?? false;
  const hasUntranslatedItem =
    latestDigest?.highlights.some((item) => !/[\u4e00-\u9fff]/.test(`${item.title} ${item.summary}`)) ?? false;

  if (stale || hasExampleLink || hasUntranslatedItem) {
    return refreshDailyDigest();
  }

  return latestDigest;
}







