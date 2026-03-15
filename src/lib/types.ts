export type WorkType = "ANIME" | "GAME";

export type RatingSource = "IMDB" | "ANILIST" | "MAL" | "STEAM";

export interface RatingSummary {
  source: RatingSource;
  value: number;
  scale: number;
  label?: string;
  votes?: number;
  url?: string;
}

export interface OfficialResource {
  label: string;
  url: string;
  type: "official" | "encyclopedia" | "store";
}

export interface WorkDetail {
  id: string;
  type: WorkType;
  title: string;
  description: string;
  releaseYear?: number;
  episodeCount?: number;
  creator?: string;
  publisher?: string;
  genres: string[];
  platforms: string[];
  aliases: string[];
  ratings: RatingSummary[];
  officialResources: OfficialResource[];
  currentPrice?: number | null;
  originalPrice?: number | null;
  lowestPrice?: number | null;
  currency?: string;
  reviewSummary?: string;
}

export interface NewsArticleSummary {
  id: string;
  sourceId?: string;
  title: string;
  url: string;
  summary: string;
  category: string;
  sourceName: string;
  publishedAt: string;
  originalTitle?: string;
  originalSummary?: string;
  keywords?: string[];
}

export interface DailyDigestView {
  id: string;
  title: string;
  digestDate: string;
  summary: string;
  highlights: NewsArticleSummary[];
}

export interface NewsBriefView {
  articleId: string;
  headline: string;
  brief: string;
  keyPoints: string[];
  sourceName: string;
  category: string;
  publishedAt: string;
  url: string;
}

export interface RecommendationInput {
  likedTitles: string[];
  preferredTags: string[];
  excludedTags: string[];
  platform: string;
}

export interface RecommendationResult {
  id: string;
  title: string;
  score: number;
  genres: string[];
  platforms: string[];
  priceLabel: string;
  rationale: string;
  storeUrl?: string;
  discountPercent?: number;
}

export interface LibraryEpisode {
  episodeNumber?: number;
  rawLabel: string;
}

export interface LibraryEntry {
  filePath: string;
  fileName: string;
  detectedTitle: string;
  seasonLabel?: string;
  extension: string;
  episode?: LibraryEpisode;
}

export interface LibraryScanResult {
  rootPath: string;
  scannedAt: string;
  entries: LibraryEntry[];
  missingEpisodeHints: Array<{
    title: string;
    missingEpisodes: number[];
  }>;
}

export interface AppSettings {
  displayName: string;
  timezone: string;
  newsDigestTime: string;
  preferredTags: string[];
  excludedTags: string[];
  preferredPlatforms: string[];
  apiKeys: Record<string, string>;
  proxyEnabled: boolean;
  proxyUrl: string;
  llmEnabled: boolean;
  llmBaseUrl: string;
  llmModel: string;
  llmTranslateNews: boolean;
  llmSummarizeNews: boolean;
  libraryRoots: Array<{
    label: string;
    path: string;
  }>;
}

export interface DashboardSnapshot {
  digest: DailyDigestView;
  recentQueries: Array<{
    query: string;
    type: WorkType;
    answeredAt: string;
  }>;
  recommendationHighlights: RecommendationResult[];
  librarySummary: {
    totalFiles: number;
    trackedSeries: number;
    lastScanLabel: string;
  };
}

