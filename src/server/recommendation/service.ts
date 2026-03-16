import { fetch } from "undici";
import type { RecommendationInput, RecommendationResult, WorkDetail } from "@/lib/types";
import { demoGameCatalog } from "@/server/data/catalog";
import { getAppStore } from "@/server/persistence/app-state";
import { getSettings } from "@/server/settings/service";
import { closeDispatcher, createRequestDispatcher } from "@/server/providers/shared";

interface SteamFeaturedItem {
  id: number;
  name: string;
  discount_percent: number;
  original_price: number;
  final_price: number;
  currency: string;
  mac_available?: boolean;
  linux_available?: boolean;
  windows_available?: boolean;
}

interface SteamFeaturedResponse {
  specials?: {
    items?: SteamFeaturedItem[];
  };
  top_sellers?: {
    items?: SteamFeaturedItem[];
  };
}

interface SteamAppDetailData {
  name?: string;
  genres?: Array<{ id: string; description: string }>;
  platforms?: {
    windows?: boolean;
    mac?: boolean;
    linux?: boolean;
  };
  price_overview?: {
    currency?: string;
    initial?: number;
    final?: number;
    discount_percent?: number;
  };
}

interface SteamAppDetailResponse {
  success: boolean;
  data?: SteamAppDetailData;
}

interface CheapSharkDeal {
  title: string;
  dealID: string;
  gameID: string;
  steamAppID?: string;
  salePrice: string;
  normalPrice: string;
  savings: string;
  steamRatingPercent?: string;
  metacriticScore?: string;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function matchesExcluded(genres: string[], excludedTags: string[]) {
  const normalizedGenres = genres.map(normalize);
  return excludedTags.some((tag) => normalizedGenres.includes(normalize(tag)));
}

function includeTagScore(genres: string[], preferredTags: string[]) {
  const normalizedGenres = genres.map(normalize);
  return preferredTags.reduce((score, tag) => (normalizedGenres.includes(normalize(tag)) ? score + 1 : score), 0);
}

function buildStoreUrl(appId: number) {
  return `https://store.steampowered.com/app/${appId}/`;
}

function parsePlatforms(detail?: SteamAppDetailData, featured?: SteamFeaturedItem) {
  const platforms: string[] = ["Steam"];
  const windows = detail?.platforms?.windows ?? featured?.windows_available;
  const mac = detail?.platforms?.mac ?? featured?.mac_available;
  const linux = detail?.platforms?.linux ?? featured?.linux_available;

  if (windows) {
    platforms.push("Windows");
  }
  if (mac) {
    platforms.push("macOS");
  }
  if (linux) {
    platforms.push("Linux");
  }

  return platforms;
}

function formatPriceLabel(currency: string, initial: number, final: number, discountPercent: number) {
  const initialPrice = initial / 100;
  const finalPrice = final / 100;

  try {
    const formatter = new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: currency || "CNY"
    });
    return `${formatter.format(finalPrice)}（-${discountPercent}% / 原价 ${formatter.format(initialPrice)}）`;
  } catch {
    return `${finalPrice.toFixed(2)} ${currency}（-${discountPercent}% / 原价 ${initialPrice.toFixed(2)}）`;
  }
}

function platformPreferenceScore(platforms: string[], requestedPlatform: string) {
  if (!requestedPlatform.trim()) {
    return 0;
  }

  const normalized = normalize(requestedPlatform);
  if (normalized.includes("steam")) {
    return 0.4;
  }

  return platforms.some((platform) => normalize(platform).includes(normalized)) ? 0.6 : -0.4;
}

function likedTitleBoost(title: string, likedTitles: string[]) {
  const normalizedTitle = normalize(title);
  return likedTitles.some((liked) => normalizedTitle.includes(normalize(liked))) ? 0.5 : 0;
}

function toFallbackRecommendation(game: WorkDetail, score: number): RecommendationResult {
  const storeUrl = game.officialResources.find((resource) => resource.type === "store")?.url;

  return {
    id: game.id,
    title: game.title,
    score,
    genres: game.genres,
    platforms: game.platforms,
    priceLabel: game.currentPrice == null ? "暂无价格" : `¥${game.currentPrice} / 史低 ¥${game.lowestPrice ?? game.currentPrice}`,
    rationale: "Steam 实时数据不可用，已回退到本地样本推荐。",
    storeUrl,
    discountPercent: game.currentPrice && game.originalPrice ? Math.max(0, Math.round((1 - game.currentPrice / game.originalPrice) * 100)) : undefined
  };
}

function formatUsdPriceLabel(normalPrice: number, salePrice: number, discountPercent: number) {
  return `$${salePrice.toFixed(2)}（-${discountPercent}% / 原价 $${normalPrice.toFixed(2)}）`;
}

function buildFallbackRecommendations(input: RecommendationInput) {
  const excludedTags = input.excludedTags.filter(Boolean);

  return demoGameCatalog
    .filter((game) => !matchesExcluded(game.genres, excludedTags))
    .slice(0, 6)
    .map((game, index) => toFallbackRecommendation(game, Number((8 - index * 0.2).toFixed(1))));
}

async function fetchFeaturedDiscounts(dispatcher?: import("undici").Dispatcher): Promise<SteamFeaturedItem[]> {
  const response = await fetch("https://store.steampowered.com/api/featuredcategories?cc=cn&l=schinese", {
    dispatcher,
    signal: AbortSignal.timeout(12_000)
  });

  if (!response.ok) {
    throw new Error(`Steam featured categories error: ${response.status}`);
  }

  const body = (await response.json()) as SteamFeaturedResponse;
  const specials = body.specials?.items ?? [];
  const topSellers = body.top_sellers?.items ?? [];

  const combined = [...specials, ...topSellers].filter((item) => item.discount_percent > 0 && item.id > 0);
  const map = new Map<number, SteamFeaturedItem>();
  for (const item of combined) {
    const existing = map.get(item.id);
    if (!existing || item.discount_percent > existing.discount_percent) {
      map.set(item.id, item);
    }
  }

  return [...map.values()].sort((a, b) => b.discount_percent - a.discount_percent);
}

async function fetchCheapSharkDeals(): Promise<CheapSharkDeal[]> {
  const response = await fetch("https://www.cheapshark.com/api/1.0/deals?storeID=1&pageSize=30&sortBy=Deal%20Rating&desc=1", {
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    throw new Error(`CheapShark deals error: ${response.status}`);
  }

  const body = (await response.json()) as CheapSharkDeal[];
  return Array.isArray(body) ? body : [];
}

async function fetchAppDetail(appId: number, dispatcher?: import("undici").Dispatcher): Promise<SteamAppDetailData | undefined> {
  try {
    const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&cc=cn&l=schinese`, {
      dispatcher,
      signal: AbortSignal.timeout(6_000)
    });

    if (!response.ok) {
      return undefined;
    }

    const body = (await response.json()) as Record<string, SteamAppDetailResponse>;
    const payload = body[String(appId)];
    if (!payload?.success) {
      return undefined;
    }

    return payload.data;
  } catch {
    return undefined;
  }
}

function isTestEnvironment() {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

function mapCheapSharkDealToRecommendation(deal: CheapSharkDeal, input: RecommendationInput): RecommendationResult | null {
  const salePrice = Number.parseFloat(deal.salePrice);
  const normalPrice = Number.parseFloat(deal.normalPrice);
  const savings = Number.parseFloat(deal.savings);

  if (!Number.isFinite(salePrice) || !Number.isFinite(normalPrice) || !Number.isFinite(savings) || normalPrice <= 0 || salePrice <= 0) {
    return null;
  }

  const discountPercent = Math.max(0, Math.round(savings));
  if (discountPercent <= 0) {
    return null;
  }

  const storeUrl = deal.steamAppID ? buildStoreUrl(Number(deal.steamAppID)) : `https://www.cheapshark.com/redirect?dealID=${deal.dealID}`;
  const genres = ["steam-deal"];
  const platforms = ["Steam", "Windows"];
  const ratingPercent = Number.parseFloat(deal.steamRatingPercent ?? "");
  const ratingBoost = Number.isFinite(ratingPercent) ? Math.min(ratingPercent / 50, 1.8) : 0.5;

  const score =
    6 +
    Math.min(discountPercent / 12, 2.4) +
    ratingBoost +
    platformPreferenceScore(platforms, input.platform) +
    likedTitleBoost(deal.title, input.likedTitles);

  const rationaleParts = [`折扣 ${discountPercent}%`, `综合得分 ${score.toFixed(1)}`, "来源：Steam 折扣镜像（实时）"];
  if (Number.isFinite(ratingPercent)) {
    rationaleParts.unshift(`Steam 好评率 ${Math.round(ratingPercent)}%`);
  }

  return {
    id: `steam-cheapshark-${deal.dealID}`,
    title: deal.title,
    score: Number(score.toFixed(1)),
    genres,
    platforms,
    priceLabel: formatUsdPriceLabel(normalPrice, salePrice, discountPercent),
    rationale: rationaleParts.join("；"),
    storeUrl,
    discountPercent
  };
}

export async function recommendGames(input: RecommendationInput): Promise<RecommendationResult[]> {
  if (isTestEnvironment()) {
    const fallback = buildFallbackRecommendations(input);
    getAppStore().recommendationHistory = fallback;
    return fallback;
  }

  const preferredTags = input.preferredTags.filter(Boolean);
  const excludedTags = input.excludedTags.filter(Boolean);
  const settings = await getSettings();
  const dispatcher = createRequestDispatcher(settings);

  try {
    let featured: SteamFeaturedItem[] = [];
    try {
      featured = await fetchFeaturedDiscounts(dispatcher);
    } catch {
      featured = [];
    }

    const candidates = featured.slice(0, 12);
    const details = await Promise.all(candidates.map((item) => fetchAppDetail(item.id, dispatcher)));

    const results: RecommendationResult[] = [];

    for (let index = 0; index < candidates.length; index += 1) {
      const item = candidates[index];
      const detail = details[index];
      const title = detail?.name ?? item.name;
      const genres = (detail?.genres ?? []).map((genre) => genre.description).filter(Boolean);

      if (genres.length > 0 && matchesExcluded(genres, excludedTags)) {
        continue;
      }

      const discountPercent = detail?.price_overview?.discount_percent ?? item.discount_percent;
      const initial = detail?.price_overview?.initial ?? item.original_price;
      const final = detail?.price_overview?.final ?? item.final_price;

      if (!initial || !final || discountPercent <= 0) {
        continue;
      }

      const currency = detail?.price_overview?.currency ?? item.currency ?? "CNY";
      const platforms = parsePlatforms(detail, item);
      const tagScore = includeTagScore(genres, preferredTags);
      const score =
        6 +
        Math.min(discountPercent / 12, 2.2) +
        tagScore * 0.8 +
        platformPreferenceScore(platforms, input.platform) +
        likedTitleBoost(title, input.likedTitles);

      const rationaleParts = [`折扣 ${discountPercent}%`, `综合得分 ${score.toFixed(1)}`];
      if (tagScore > 0) {
        const matched = genres.filter((genre) => preferredTags.map(normalize).includes(normalize(genre)));
        if (matched.length > 0) {
          rationaleParts.unshift(`命中偏好标签：${matched.join("、")}`);
        }
      }

      results.push({
        id: `steam-${item.id}`,
        title,
        score: Number(score.toFixed(1)),
        genres: genres.length > 0 ? genres : ["game"],
        platforms,
        priceLabel: formatPriceLabel(currency, initial, final, discountPercent),
        rationale: rationaleParts.join("；"),
        storeUrl: buildStoreUrl(item.id),
        discountPercent
      });
    }

    const ranked = results
      .filter((result) => !matchesExcluded(result.genres, excludedTags))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    if (ranked.length > 0) {
      getAppStore().recommendationHistory = ranked;
      return ranked;
    }
  } catch {
    // CheapShark fallback handled below.
  } finally {
    await closeDispatcher(dispatcher);
  }

  try {
    const cheapSharkDeals = await fetchCheapSharkDeals();
    const cheapSharkResults = cheapSharkDeals
      .map((deal) => mapCheapSharkDealToRecommendation(deal, input))
      .filter((item): item is RecommendationResult => Boolean(item))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    if (cheapSharkResults.length > 0) {
      getAppStore().recommendationHistory = cheapSharkResults;
      return cheapSharkResults;
    }
  } catch {
    // Final fallback handled below.
  }

  const fallback = buildFallbackRecommendations(input);
  getAppStore().recommendationHistory = fallback;
  return fallback;
}
