import { fetch } from "undici";
import type { Dispatcher } from "undici";
import type { AppSettings, RatingSummary, WorkDetail, WorkType } from "@/lib/types";
import { demoAnimeCatalog, demoGameCatalog } from "@/server/data/catalog";
import { getAppStore } from "@/server/persistence/app-state";
import { closeDispatcher, createRequestDispatcher } from "@/server/providers/shared";
import { getSettings } from "@/server/settings/service";

export type AskWorkResult = { status: "found"; match: WorkDetail } | { status: "not_found"; suggestions: string[] };

type LlmSettings = Pick<AppSettings, "llmEnabled" | "llmBaseUrl" | "llmModel" | "apiKeys">;

interface AniListMediaTitle {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
}

interface AniListMediaStudio {
  name: string;
  isAnimationStudio: boolean;
}

interface AniListExternalLink {
  site?: string | null;
  url?: string | null;
}

interface AniListMedia {
  id: number;
  idMal?: number | null;
  title: AniListMediaTitle;
  synonyms?: string[] | null;
  description?: string | null;
  episodes?: number | null;
  seasonYear?: number | null;
  genres?: string[] | null;
  meanScore?: number | null;
  averageScore?: number | null;
  popularity?: number | null;
  siteUrl?: string | null;
  studios?: {
    nodes?: AniListMediaStudio[] | null;
  } | null;
  externalLinks?: AniListExternalLink[] | null;
}

interface AniListResponse {
  data?: {
    Page?: {
      media?: AniListMedia[] | null;
    };
  };
}

interface BilibiliMediaScore {
  score?: number | string;
  user_count?: number | string;
}

interface BilibiliRawItem {
  media_id?: number;
  season_id?: number;
  title?: string;
  org_title?: string;
  url?: string;
  goto_url?: string;
  desc?: string;
  styles?: string;
  pubtime?: number;
  index_show?: string;
  media_score?: BilibiliMediaScore;
}

interface BilibiliSearchResponse {
  code?: number;
  data?: {
    result?: BilibiliRawItem[];
  };
}

interface BilibiliBangumiResult {
  id: string;
  title: string;
  originalTitle: string;
  url: string;
  description: string;
  styles: string[];
  releaseYear?: number;
  episodeCount?: number;
  score?: number;
  votes?: number;
}

interface SteamStoreSearchItem {
  id: number;
  name: string;
  price?: {
    currency?: string;
    initial?: number;
    final?: number;
  };
  windows?: boolean;
  mac?: boolean;
  linux?: boolean;
}

interface SteamStoreSearchResponse {
  items?: SteamStoreSearchItem[];
}

interface SteamAppDetailsData {
  name?: string;
  short_description?: string;
  release_date?: {
    date?: string;
  };
  developers?: string[];
  publishers?: string[];
  genres?: Array<{ id: string; description: string }>;
  website?: string;
  platforms?: {
    windows?: boolean;
    mac?: boolean;
    linux?: boolean;
  };
  price_overview?: {
    currency?: string;
    initial?: number;
    final?: number;
  };
}

interface SteamAppDetailsPayload {
  success: boolean;
  data?: SteamAppDetailsData;
}

interface CheapSharkSearchItem {
  steamAppID?: string;
  cheapest?: string;
  steamRatingPercent?: string;
}

const BILIBILI_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Referer: "https://search.bilibili.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
};

const CHINESE_VARIANT_MAP: Array<[RegExp, string]> = [
  [/\u8207/g, "\u4e0e"],
  [/\u88cf/g, "\u91cc"],
  [/\u59b3/g, "\u4f60"],
  [/\u7962/g, "\u4f60"],
  [/\u00b7/g, " "],
  [/\u2014/g, "-"],
  [/\uff0c/g, ","],
  [/\u3002/g, "."]
];

const TEXT_FALLBACK_MAP: Array<[RegExp, string]> = [
  [/\breview\b/gi, "\u8bc4\u6d4b"],
  [/\boverview\b/gi, "\u6982\u89c8"],
  [/\bcompare\b/gi, "\u5bf9\u6bd4"],
  [/\bversion\b/gi, "\u7248\u672c"],
  [/\blaunch\b/gi, "\u4e0a\u7ebf"],
  [/\bannounced\b/gi, "\u5df2\u516c\u5e03"],
  [/\bannouncement\b/gi, "\u516c\u544a"],
  [/\bnews\b/gi, "\u8d44\u8baf"],
  [/\bguide\b/gi, "\u6307\u5357"],
  [/\baction\b/gi, "\u52a8\u4f5c"],
  [/\badventure\b/gi, "\u5192\u9669"],
  [/\bfantasy\b/gi, "\u5947\u5e7b"],
  [/\bsimulation\b/gi, "\u6a21\u62df"],
  [/\bstrategy\b/gi, "\u7b56\u7565"],
  [/\bturn-based\b/gi, "\u56de\u5408\u5236"],
  [/\brole-playing\b/gi, "\u89d2\u8272\u626e\u6f14"],
  [/\brpg\b/gi, "\u89d2\u8272\u626e\u6f14"],
  [/\bplatformer\b/gi, "\u5e73\u53f0\u8df3\u8dc3"],
  [/\banime\b/gi, "\u52a8\u6f2b"],
  [/\bcomic\b/gi, "\u6f2b\u753b"],
  [/\bgame\b/gi, "\u6e38\u620f"],
  [/\bwith\b/gi, "\u4e0e"],
  [/\band\b/gi, "\u548c"],
  [/\bfor\b/gi, "\u9762\u5411"]
];

function normalize(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizeQuery(value: string) {
  let result = value.trim();
  for (const [pattern, replacement] of CHINESE_VARIANT_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/\s+/g, " ");
}

function normalizeLoose(value: string) {
  return normalizeQuery(value).toLowerCase().replace(/[\s\-_~!?,.:;'"`()[\]{}<>\\/|]+/g, "");
}

function hasChinese(text: string) {
  return /[\u4e00-\u9fff]/.test(text);
}

function chineseRatio(text: string) {
  if (!text) {
    return 0;
  }
  const count = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return count / text.length;
}

function englishRatio(text: string) {
  if (!text) {
    return 0;
  }
  const count = (text.match(/[A-Za-z]/g) ?? []).length;
  return count / text.length;
}

function shouldTranslate(text: string, threshold = 0.55) {
  if (!text.trim()) {
    return false;
  }
  if (!hasChinese(text)) {
    return true;
  }
  if (chineseRatio(text) < 0.2) {
    return true;
  }
  return englishRatio(text) > threshold;
}

function scoreTextMatch(query: string, text: string) {
  const q = normalizeLoose(query);
  const t = normalizeLoose(text);
  if (!q || !t) {
    return 0;
  }
  if (q === t) {
    return 100;
  }
  if (t.includes(q) || q.includes(t)) {
    return 80;
  }
  if (t.startsWith(q) || q.startsWith(t)) {
    return 70;
  }
  return 0;
}

function scoreMatch(query: string, item: WorkDetail) {
  const titleScore = scoreTextMatch(query, item.title);
  if (titleScore >= 100) {
    return titleScore;
  }
  let aliasScore = 0;
  for (const alias of item.aliases) {
    aliasScore = Math.max(aliasScore, scoreTextMatch(query, alias));
  }
  return Math.max(titleScore, aliasScore);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function stripHtml(value: string) {
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeInput(text: string, maxLength = 240) {
  return stripHtml(text).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function toShortDescription(value: string | null | undefined, fallback: string) {
  const cleaned = value ? sanitizeInput(value, 1000) : "";
  if (!cleaned) {
    return fallback;
  }
  return cleaned.slice(0, 320);
}

function parseReleaseYear(value?: string | null) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : undefined;
}

function parseSteamStorePrice(price?: { currency?: string; initial?: number; final?: number }) {
  if (!price || price.final == null || price.initial == null) {
    return { currency: "CNY", currentPrice: undefined, originalPrice: undefined };
  }
  return {
    currency: price.currency ?? "CNY",
    currentPrice: price.final / 100,
    originalPrice: price.initial / 100
  };
}

function parseEpisodeCount(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/(\d+)\s*(话|集)/);
  return match ? Number(match[1]) : undefined;
}

function parseNumberish(value: number | string | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseBilibiliUrl(url?: string, fallbackSeasonId?: string) {
  const fallback = fallbackSeasonId ? `https://www.bilibili.com/bangumi/play/ss${fallbackSeasonId}` : "https://www.bilibili.com";
  if (!url) {
    return fallback;
  }
  if (url.startsWith("//")) {
    return `https:${url}`;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (url.startsWith("/")) {
    return `https://www.bilibili.com${url}`;
  }
  return fallback;
}

function chooseCatalog(type: WorkType) {
  return type === "ANIME" ? demoAnimeCatalog : demoGameCatalog;
}

function isTestEnvironment() {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

function toSteamUrl(appId: number) {
  return `https://store.steampowered.com/app/${appId}/`;
}

function toBilibiliSearchUrl(query: string) {
  return `https://search.bilibili.com/bangumi?keyword=${encodeURIComponent(query)}`;
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (part && typeof part === "object" && "text" in part) {
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      }
      return "";
    })
    .join("\n");
}

function extractJsonString(raw: string) {
  const trimmed = raw.trim();
  const cleaned = trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("No JSON object found in LLM response");
  }
  return cleaned.slice(start, end + 1);
}

function translateByHeuristic(text: string) {
  let output = ` ${text} `;
  for (const [pattern, replacement] of TEXT_FALLBACK_MAP) {
    output = output.replace(pattern, replacement);
  }
  return output
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, "。")
    .replace(/\./g, "。")
    .replace(/\?/g, "？")
    .trim();
}

function localizeListByHeuristic(values: string[]) {
  return values.map((value) => (shouldTranslate(value, 0.7) ? translateByHeuristic(value) : value));
}

function normalizeRecentQuery(query: string) {
  return normalizeQuery(query).toLowerCase();
}

function buildRecentQueryKey(query: string, type: WorkType) {
  return `${type}:${normalizeRecentQuery(query)}`;
}

function cloneAskResult(result: AskWorkResult): AskWorkResult {
  return JSON.parse(JSON.stringify(result)) as AskWorkResult;
}

function readCachedAskResult(query: string, type: WorkType): AskWorkResult | undefined {
  const store = getAppStore();
  const key = buildRecentQueryKey(query, type);
  const index = store.askResultCache.findIndex((item) => item.key === key);
  if (index < 0) {
    return undefined;
  }

  const hit = store.askResultCache[index];
  if (index > 0) {
    store.askResultCache.splice(index, 1);
    store.askResultCache.unshift(hit);
  }
  return cloneAskResult(hit.result as AskWorkResult);
}

function saveCachedAskResult(query: string, type: WorkType, result: AskWorkResult) {
  const store = getAppStore();
  const key = buildRecentQueryKey(query, type);
  const nextEntry = {
    key,
    query,
    type,
    result: cloneAskResult(result),
    cachedAt: new Date().toISOString()
  };
  store.askResultCache = [nextEntry, ...store.askResultCache.filter((item) => item.key !== key)].slice(0, 30);
}

function pushQueryHistory(query: string, type: WorkType) {
  // Ignore non-informative inputs like "???" generated by terminal encoding issues.
  if (!/[\u4e00-\u9fffA-Za-z0-9\u3040-\u30ff]/.test(query)) {
    return;
  }

  const store = getAppStore();
  const key = buildRecentQueryKey(query, type);
  const deduped = store.recentQueries.filter((item) => buildRecentQueryKey(item.query, item.type) !== key);
  store.recentQueries = [
    {
      query,
      type,
      answeredAt: new Date().toISOString()
    },
    ...deduped
  ].slice(0, 30);
}

function finalizeAskResult(query: string, type: WorkType, result: AskWorkResult): AskWorkResult {
  saveCachedAskResult(query, type, result);
  return cloneAskResult(result);
}

function pushAndCacheFromResult(query: string, type: WorkType, result: AskWorkResult): AskWorkResult {
  pushQueryHistory(query, type);
  return finalizeAskResult(query, type, result);
}

function pushCachedHit(query: string, type: WorkType, cached: AskWorkResult): AskWorkResult {
  pushQueryHistory(query, type);
  return cloneAskResult(cached);
}

function fallbackFromCatalog(query: string, type: WorkType): AskWorkResult {
  const catalog = chooseCatalog(type);
  const ranked = catalog
    .map((item) => ({ item, score: scoreMatch(query, item) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (best && best.score >= 60) {
    return { status: "found", match: best.item };
  }

  return {
    status: "not_found",
    suggestions: catalog.slice(0, 6).map((item) => item.title)
  };
}

async function searchAniList(query: string, dispatcher?: Dispatcher) {
  const gql = `
    query SearchAnime($search: String!) {
      Page(page: 1, perPage: 8) {
        media(search: $search, type: ANIME, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
          id
          idMal
          title {
            romaji
            english
            native
          }
          synonyms
          description(asHtml: false)
          episodes
          seasonYear
          genres
          meanScore
          averageScore
          popularity
          siteUrl
          studios(isMain: true) {
            nodes {
              name
              isAnimationStudio
            }
          }
          externalLinks {
            site
            url
          }
        }
      }
    }
  `;

  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    dispatcher,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ query: gql, variables: { search: query } }),
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    throw new Error(`AniList search error: ${response.status}`);
  }
  const body = (await response.json()) as AniListResponse;
  return body.data?.Page?.media ?? [];
}

function mapAniListMediaToWork(media: AniListMedia, query: string): WorkDetail {
  const title = media.title.native ?? media.title.romaji ?? media.title.english ?? query;
  const aliases = uniqueStrings([media.title.native, media.title.romaji, media.title.english, ...(media.synonyms ?? []), query]);
  const genres = (media.genres ?? []).map((item) => item.toLowerCase()).slice(0, 8);
  const description = toShortDescription(media.description, "暂无简介，请查看官方条目。");

  const mainStudio =
    media.studios?.nodes?.find((studio) => studio.isAnimationStudio && studio.name?.trim())?.name ??
    media.studios?.nodes?.find((studio) => studio.name?.trim())?.name;

  const ratingRaw = media.meanScore ?? media.averageScore;
  const ratings: RatingSummary[] = [];
  if (ratingRaw && ratingRaw > 0) {
    ratings.push({
      source: "ANILIST",
      value: Number((ratingRaw / 10).toFixed(1)),
      scale: 10,
      votes: media.popularity ?? undefined,
      url: media.siteUrl ?? `https://anilist.co/anime/${media.id}`
    });
  }

  const resources: WorkDetail["officialResources"] = [
    {
      label: "AniList",
      url: media.siteUrl ?? `https://anilist.co/anime/${media.id}`,
      type: "encyclopedia"
    }
  ];

  if (media.idMal) {
    resources.push({
      label: "MyAnimeList",
      url: `https://myanimelist.net/anime/${media.idMal}`,
      type: "encyclopedia"
    });
  }

  for (const link of media.externalLinks ?? []) {
    if (!link.url) {
      continue;
    }
    if (resources.some((item) => item.url === link.url)) {
      continue;
    }
    resources.push({
      label: link.site?.trim() || "瀹樻柟缃戠珯",
      url: link.url,
      type: "official"
    });
    if (resources.length >= 8) {
      break;
    }
  }

  return {
    id: `anilist-${media.id}`,
    type: "ANIME",
    title,
    description,
    releaseYear: media.seasonYear ?? undefined,
    episodeCount: media.episodes ?? undefined,
    creator: mainStudio,
    publisher: mainStudio,
    genres: genres.length > 0 ? genres : ["anime"],
    platforms: ["AniList"],
    aliases,
    ratings,
    officialResources: resources
  };
}

async function searchBilibiliBangumi(query: string, dispatcher?: Dispatcher) {
  const endpoint = new URL("https://api.bilibili.com/x/web-interface/search/type");
  endpoint.searchParams.set("search_type", "media_bangumi");
  endpoint.searchParams.set("keyword", query);
  endpoint.searchParams.set("page", "1");
  endpoint.searchParams.set("page_size", "8");

  const response = await fetch(endpoint.toString(), {
    dispatcher,
    headers: BILIBILI_HEADERS,
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    throw new Error(`Bilibili search error: ${response.status}`);
  }

  const body = (await response.json()) as BilibiliSearchResponse;
  if (body.code !== 0) {
    return [];
  }

  const items = body.data?.result ?? [];
  const mapped: Array<BilibiliBangumiResult | undefined> = items.map((item) => {
    const seasonId = item.season_id != null ? String(item.season_id) : undefined;
    const mediaId = item.media_id != null ? String(item.media_id) : undefined;
    const id = seasonId || mediaId;
    const title = sanitizeInput(item.title ?? "", 120);
    if (!id || !title) {
      return undefined;
    }

    const originalTitle = sanitizeInput(item.org_title ?? "", 120);
    const styles = uniqueStrings((item.styles ?? "").split(/[\\/|,，]/g).map((part) => part.trim()));
    const releaseYear =
      typeof item.pubtime === "number" && Number.isFinite(item.pubtime) ? new Date(item.pubtime * 1000).getFullYear() : undefined;
    const score = parseNumberish(item.media_score?.score);
    const votes = parseNumberish(item.media_score?.user_count);

    const result: BilibiliBangumiResult = {
      id,
      title,
      originalTitle,
      url: parseBilibiliUrl(item.url ?? item.goto_url, seasonId),
      description: toShortDescription(item.desc ?? "", `${title} 的简介暂不可用，请前往 B 站查看。`),
      styles
    };

    const normalizedYear = releaseYear && releaseYear >= 1970 ? releaseYear : undefined;
    if (normalizedYear) {
      result.releaseYear = normalizedYear;
    }
    const episodeCount = parseEpisodeCount(item.index_show);
    if (episodeCount) {
      result.episodeCount = episodeCount;
    }
    if (score !== undefined) {
      result.score = score;
    }
    if (votes !== undefined) {
      result.votes = votes;
    }

    return result;
  });

  return mapped.filter((item): item is BilibiliBangumiResult => item !== undefined);
}

function mapBilibiliToWork(query: string, item: BilibiliBangumiResult): WorkDetail {
  const aliases = uniqueStrings([item.title, item.originalTitle, query]);
  const genres = item.styles.length > 0 ? item.styles : ["动漫"];
  const reviewSummary =
    item.score && item.score > 0
      ? `B 站评分 ${item.score.toFixed(1)}${item.votes ? `（${Math.round(item.votes).toLocaleString()} 人评分）` : ""}。`
      : undefined;

  return {
    id: `bilibili-${item.id}`,
    type: "ANIME",
    title: item.title,
    description: item.description,
    releaseYear: item.releaseYear,
    episodeCount: item.episodeCount,
    genres,
    platforms: ["哔哩哔哩"],
    aliases,
    ratings: [],
    officialResources: [
      {
        label: "哔哩哔哩",
        url: item.url,
        type: "official"
      }
    ],
    reviewSummary
  };
}

function rankBilibiliCandidate(query: string, item: BilibiliBangumiResult) {
  const titleScore = scoreTextMatch(query, item.title);
  const originalScore = scoreTextMatch(query, item.originalTitle);
  const ratingBonus = item.score ? Math.min(8, item.score) : 0;
  return Math.max(titleScore, originalScore) + ratingBonus;
}

function chooseBestBilibiliResult(query: string, items: BilibiliBangumiResult[]) {
  return [...items].sort((a, b) => rankBilibiliCandidate(query, b) - rankBilibiliCandidate(query, a))[0];
}

function rankAniListCandidate(query: string, item: AniListMedia) {
  const textPool = [item.title.native, item.title.romaji, item.title.english, ...(item.synonyms ?? [])].filter(
    (value): value is string => Boolean(value?.trim())
  );
  const baseScore = textPool.reduce((best, text) => Math.max(best, scoreTextMatch(query, text)), 0);
  const popularityBonus = item.popularity ? Math.min(10, item.popularity / 10_000) : 0;
  return baseScore + popularityBonus;
}

function uniqueByUrl(resources: WorkDetail["officialResources"]) {
  const result: WorkDetail["officialResources"] = [];
  const seen = new Set<string>();
  for (const item of resources) {
    const key = item.url.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

function mergeAnimeWorkFromBilibili(base: WorkDetail, bili: BilibiliBangumiResult, query: string): WorkDetail {
  const mergedResources = uniqueByUrl([
    {
      label: "哔哩哔哩",
      url: bili.url,
      type: "official" as const
    },
    ...base.officialResources
  ]);

  const prefersBiliTitle = hasChinese(bili.title) && (shouldTranslate(base.title, 0.7) || scoreTextMatch(query, bili.title) >= 80);
  const title = prefersBiliTitle ? bili.title : base.title;
  const description = hasChinese(bili.description) && shouldTranslate(base.description, 0.65) ? bili.description : base.description;
  const reviewSummary = base.reviewSummary ?? (bili.score ? `B 站评分 ${bili.score.toFixed(1)}。` : undefined);

  return {
    ...base,
    title,
    description,
    releaseYear: base.releaseYear ?? bili.releaseYear,
    episodeCount: base.episodeCount ?? bili.episodeCount,
    genres: uniqueStrings([...base.genres, ...bili.styles]),
    platforms: uniqueStrings([...base.platforms, "哔哩哔哩"]),
    aliases: uniqueStrings([...base.aliases, bili.title, bili.originalTitle, query]),
    officialResources: mergedResources,
    reviewSummary
  };
}

function ensureBilibiliResource(work: WorkDetail, query: string, directUrl?: string) {
  const resources = uniqueByUrl([
    directUrl ? { label: "哔哩哔哩", url: directUrl, type: "official" as const } : undefined,
    { label: "B站搜索", url: toBilibiliSearchUrl(query), type: "official" as const },
    ...work.officialResources
  ].filter((item): item is NonNullable<typeof item> => Boolean(item)));

  const platforms = directUrl ? uniqueStrings([...work.platforms, "哔哩哔哩"]) : work.platforms;
  return {
    ...work,
    platforms,
    officialResources: resources
  };
}

function buildAnimeSearchKeywords(query: string) {
  const normalized = normalizeQuery(query);
  const variants = uniqueStrings([
    query.trim(),
    normalized,
    normalized.replace(/与/g, "和"),
    normalized.replace(/和/g, "与")
  ]);
  return variants.slice(0, 4);
}

function dedupeAniListMedia(items: AniListMedia[]) {
  const map = new Map<number, AniListMedia>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return [...map.values()];
}

function dedupeBilibiliItems(items: BilibiliBangumiResult[]) {
  const map = new Map<string, BilibiliBangumiResult>();
  for (const item of items) {
    if (!map.has(item.id)) {
      map.set(item.id, item);
      continue;
    }
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
      continue;
    }
    if (rankBilibiliCandidate(item.title, item) > rankBilibiliCandidate(existing.title, existing)) {
      map.set(item.id, item);
    }
  }
  return [...map.values()];
}

async function searchSteamStore(query: string, dispatcher?: Dispatcher) {
  const response = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=schinese&cc=cn`, {
    dispatcher,
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    throw new Error(`Steam store search error: ${response.status}`);
  }

  const body = (await response.json()) as SteamStoreSearchResponse;
  return body.items ?? [];
}

async function fetchSteamAppDetails(appId: number, dispatcher?: Dispatcher) {
  const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&cc=cn&l=schinese`, {
    dispatcher,
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    throw new Error(`Steam app details error: ${response.status}`);
  }

  const body = (await response.json()) as Record<string, SteamAppDetailsPayload>;
  const payload = body[String(appId)];
  if (!payload?.success || !payload.data) {
    return undefined;
  }
  return payload.data;
}

async function searchCheapShark(query: string, dispatcher?: Dispatcher) {
  const response = await fetch(`https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(query)}&limit=8`, {
    dispatcher,
    signal: AbortSignal.timeout(8_000)
  });

  if (!response.ok) {
    throw new Error(`CheapShark search error: ${response.status}`);
  }

  const body = (await response.json()) as CheapSharkSearchItem[];
  return Array.isArray(body) ? body : [];
}

function mapSteamToWork(query: string, storeItem: SteamStoreSearchItem, details?: SteamAppDetailsData, cheapSharkMatch?: CheapSharkSearchItem) {
  const appId = storeItem.id;
  const storeUrl = toSteamUrl(appId);
  const detailGenres = (details?.genres ?? []).map((item) => item.description?.toLowerCase().trim()).filter(Boolean) as string[];
  const genres = detailGenres.length > 0 ? detailGenres : ["game"];
  const aliases = uniqueStrings([storeItem.name, details?.name, query]);

  const detailPrice = details?.price_overview
    ? {
        currency: details.price_overview.currency ?? "CNY",
        currentPrice: details.price_overview.final != null ? details.price_overview.final / 100 : undefined,
        originalPrice: details.price_overview.initial != null ? details.price_overview.initial / 100 : undefined
      }
    : undefined;
  const storePrice = parseSteamStorePrice(storeItem.price);
  const priceSource = detailPrice ?? storePrice;

  const cheapPrice = cheapSharkMatch?.cheapest ? Number.parseFloat(cheapSharkMatch.cheapest) : undefined;
  const ratingPercent = cheapSharkMatch?.steamRatingPercent ? Number.parseFloat(cheapSharkMatch.steamRatingPercent) : undefined;
  const hasRatingPercent = ratingPercent !== undefined && Number.isFinite(ratingPercent) && ratingPercent > 0;

  const ratings: RatingSummary[] = [];
  if (hasRatingPercent && ratingPercent !== undefined) {
    ratings.push({
      source: "STEAM",
      value: Number((ratingPercent / 10).toFixed(1)),
      scale: 10,
      label: `濂借瘎鐜?${Math.round(ratingPercent)}%`,
      url: storeUrl
    });
  }

  const platforms: string[] = ["Steam"];
  const windows = details?.platforms?.windows ?? storeItem.windows;
  const mac = details?.platforms?.mac ?? storeItem.mac;
  const linux = details?.platforms?.linux ?? storeItem.linux;
  if (windows) {
    platforms.push("Windows");
  }
  if (mac) {
    platforms.push("macOS");
  }
  if (linux) {
    platforms.push("Linux");
  }

  const releaseYear = parseReleaseYear(details?.release_date?.date);
  const description = toShortDescription(details?.short_description, `${storeItem.name} 的详细介绍暂不可用，请查看 Steam 商店页。`);

  const resources: WorkDetail["officialResources"] = [{ label: "Steam 商店", url: storeUrl, type: "store" }];
  if (details?.website) {
    resources.push({ label: "官方网站", url: details.website, type: "official" });
  }

  const lowestPrice = priceSource.currency === "USD" && Number.isFinite(cheapPrice) ? cheapPrice : undefined;

  return {
    id: `steam-${appId}`,
    type: "GAME" as const,
    title: details?.name ?? storeItem.name,
    description,
    releaseYear,
    creator: details?.developers?.[0],
    publisher: details?.publishers?.[0],
    genres,
    platforms,
    aliases,
    ratings,
    officialResources: resources,
    currentPrice: priceSource.currentPrice,
    originalPrice: priceSource.originalPrice,
    lowestPrice,
    currency: priceSource.currency,
    reviewSummary:
      hasRatingPercent && ratingPercent !== undefined
        ? `Steam 好评率约 ${Math.round(ratingPercent)}%，可在商店页查看最新用户评价。`
        : undefined
  };
}

async function translateWorkWithLlm(work: WorkDetail, settings: LlmSettings, dispatcher?: Dispatcher) {
  if (!settings.llmEnabled) {
    return null;
  }

  const apiKey = (settings.apiKeys.llm ?? "").trim();
  const model = settings.llmModel.trim();
  const baseUrl = normalizeBaseUrl(settings.llmBaseUrl);
  if (!apiKey || !model || !baseUrl) {
    return null;
  }

  const payload = {
    title: sanitizeInput(work.title, 120),
    description: sanitizeInput(work.description, 480),
    genres: work.genres.slice(0, 12).map((item) => sanitizeInput(item, 40)),
    platforms: work.platforms.slice(0, 10).map((item) => sanitizeInput(item, 40)),
    creator: sanitizeInput(work.creator ?? "", 80),
    publisher: sanitizeInput(work.publisher ?? "", 80),
    reviewSummary: sanitizeInput(work.reviewSummary ?? "", 200),
    aliases: work.aliases.slice(0, 16).map((item) => sanitizeInput(item, 80))
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    dispatcher,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 900,
      max_completion_tokens: 900,
      extra_body: { enable_thinking: false },
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是 ACG 内容本地化助手。把输入字段翻译为简体中文并保持原意，不编造。专有名词、作品名、人名可保留原文。只输出 JSON：{\"title\":string,\"description\":string,\"genres\":string[],\"platforms\":string[],\"creator\":string,\"publisher\":string,\"reviewSummary\":string,\"aliases\":string[]}。"
        },
        {
          role: "user",
          content: JSON.stringify(payload)
        }
      ]
    }),
    signal: AbortSignal.timeout(12_000)
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const raw = extractTextContent(body.choices?.[0]?.message?.content);
  const json = JSON.parse(extractJsonString(raw)) as {
    title?: string;
    description?: string;
    genres?: string[];
    platforms?: string[];
    creator?: string;
    publisher?: string;
    reviewSummary?: string;
    aliases?: string[];
  };

  return {
    title: sanitizeInput(json.title ?? "", 120),
    description: sanitizeInput(json.description ?? "", 480),
    genres: Array.isArray(json.genres) ? json.genres.map((item) => sanitizeInput(String(item), 40)).filter(Boolean).slice(0, 12) : [],
    platforms: Array.isArray(json.platforms)
      ? json.platforms.map((item) => sanitizeInput(String(item), 40)).filter(Boolean).slice(0, 10)
      : [],
    creator: sanitizeInput(json.creator ?? "", 80),
    publisher: sanitizeInput(json.publisher ?? "", 80),
    reviewSummary: sanitizeInput(json.reviewSummary ?? "", 220),
    aliases: Array.isArray(json.aliases) ? json.aliases.map((item) => sanitizeInput(String(item), 80)).filter(Boolean).slice(0, 16) : []
  };
}

async function localizeWorkDetail(work: WorkDetail, settings: LlmSettings, dispatcher?: Dispatcher) {
  const needsTranslation =
    shouldTranslate(work.title) ||
    shouldTranslate(work.description, 0.6) ||
    work.genres.some((item) => shouldTranslate(item, 0.8)) ||
    (work.reviewSummary ? shouldTranslate(work.reviewSummary, 0.7) : false);

  if (!needsTranslation) {
    return work;
  }

  try {
    const translated = await translateWorkWithLlm(work, settings, dispatcher);
    if (translated) {
      return {
        ...work,
        title: translated.title || work.title,
        description: translated.description || work.description,
        genres: translated.genres.length > 0 ? translated.genres : work.genres,
        platforms: translated.platforms.length > 0 ? translated.platforms : work.platforms,
        creator: translated.creator || work.creator,
        publisher: translated.publisher || work.publisher,
        reviewSummary: translated.reviewSummary || work.reviewSummary,
        aliases: uniqueStrings([...translated.aliases, ...work.aliases])
      };
    }
  } catch {
    // Fall back to heuristic localization.
  }

  return {
    ...work,
    title: shouldTranslate(work.title) ? translateByHeuristic(work.title) : work.title,
    description: shouldTranslate(work.description, 0.6) ? translateByHeuristic(work.description) : work.description,
    genres: localizeListByHeuristic(work.genres),
    reviewSummary: work.reviewSummary ? (shouldTranslate(work.reviewSummary, 0.7) ? translateByHeuristic(work.reviewSummary) : work.reviewSummary) : undefined
  };
}

function mergeSuggestions(primary: string[], fallback: string[]) {
  return uniqueStrings([...primary, ...fallback]).slice(0, 8);
}

async function tryFindAnimeWork(
  query: string,
  settings: LlmSettings,
  dispatcher?: Dispatcher
): Promise<{ match?: WorkDetail; suggestions: string[] }> {
  const keywords = buildAnimeSearchKeywords(query);

  const bilibiliBuckets = await Promise.all(
    keywords.map(async (keyword) => {
      try {
        return await searchBilibiliBangumi(keyword, dispatcher);
      } catch {
        return [] as BilibiliBangumiResult[];
      }
    })
  );

  const bilibiliCandidates = dedupeBilibiliItems(bilibiliBuckets.flat());
  const bestBilibili = chooseBestBilibiliResult(query, bilibiliCandidates);

  const aniQueries = uniqueStrings([query, ...keywords, bestBilibili?.originalTitle, bestBilibili?.title]).slice(0, 5);
  const aniBuckets = await Promise.all(
    aniQueries.map(async (keyword) => {
      try {
        return await searchAniList(keyword, dispatcher);
      } catch {
        return [] as AniListMedia[];
      }
    })
  );

  const aniCandidates = dedupeAniListMedia(aniBuckets.flat());
  const bestAni = [...aniCandidates].sort((a, b) => rankAniListCandidate(query, b) - rankAniListCandidate(query, a))[0];

  let match: WorkDetail | undefined;
  if (bestAni) {
    match = mapAniListMediaToWork(bestAni, query);
    if (bestBilibili) {
      match = mergeAnimeWorkFromBilibili(match, bestBilibili, query);
    }
  } else if (bestBilibili) {
    match = mapBilibiliToWork(query, bestBilibili);
  }

  const suggestions = uniqueStrings([
    ...bilibiliCandidates.map((item) => item.title),
    ...aniCandidates.map((item) => item.title.native ?? item.title.romaji ?? item.title.english ?? "")
  ]).slice(0, 8);

  if (!match) {
    return { suggestions };
  }

  const withBilibili = ensureBilibiliResource(match, query, bestBilibili?.url);
  return { match: await localizeWorkDetail(withBilibili, settings, dispatcher), suggestions };
}

async function tryFindGameWork(
  query: string,
  settings: LlmSettings,
  dispatcher?: Dispatcher
): Promise<{ match?: WorkDetail; suggestions: string[] }> {
  const steamItems = await searchSteamStore(query, dispatcher);
  if (steamItems.length === 0) {
    return { suggestions: [] };
  }

  const suggestions = steamItems.map((item) => item.name).filter(Boolean).slice(0, 8);
  const top = steamItems[0];
  const cheapShark = await searchCheapShark(query, dispatcher).catch(() => []);
  const cheapMatch = cheapShark.find((item) => Number(item.steamAppID ?? "0") === top.id) ?? cheapShark[0];
  const details = await fetchSteamAppDetails(top.id, dispatcher).catch(() => undefined);

  const match = mapSteamToWork(query, top, details, cheapMatch);
  return { match: await localizeWorkDetail(match, settings, dispatcher), suggestions };
}

export async function askWork(query: string, type: WorkType): Promise<AskWorkResult> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return { status: "not_found", suggestions: [] };
  }

  const cached = readCachedAskResult(trimmedQuery, type);
  if (cached) {
    return pushCachedHit(trimmedQuery, type, cached);
  }

  if (isTestEnvironment()) {
    return pushAndCacheFromResult(trimmedQuery, type, fallbackFromCatalog(trimmedQuery, type));
  }

  const settings = await getSettings();
  const dispatcher = createRequestDispatcher(settings);
  const fallback = fallbackFromCatalog(trimmedQuery, type);

  try {
    if (type === "ANIME") {
      const result = await tryFindAnimeWork(trimmedQuery, settings, dispatcher);
      if (result.match) {
        return pushAndCacheFromResult(trimmedQuery, type, { status: "found", match: result.match });
      }
      if (fallback.status === "not_found") {
        return pushAndCacheFromResult(trimmedQuery, type, {
          status: "not_found",
          suggestions: mergeSuggestions(result.suggestions, fallback.suggestions)
        });
      }
      return pushAndCacheFromResult(trimmedQuery, type, fallback);
    }

    const result = await tryFindGameWork(trimmedQuery, settings, dispatcher);
    if (result.match) {
      return pushAndCacheFromResult(trimmedQuery, type, { status: "found", match: result.match });
    }
    if (fallback.status === "not_found") {
      return pushAndCacheFromResult(trimmedQuery, type, {
        status: "not_found",
        suggestions: mergeSuggestions(result.suggestions, fallback.suggestions)
      });
    }
    return pushAndCacheFromResult(trimmedQuery, type, fallback);
  } catch {
    return pushAndCacheFromResult(trimmedQuery, type, fallback);
  } finally {
    await closeDispatcher(dispatcher);
  }
}

