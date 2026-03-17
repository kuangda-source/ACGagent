import type { AppSettings, DailyDigestView, LibraryScanResult, RecommendationResult, WorkDetail, WorkType } from "@/lib/types";
import { ensureServerEnv } from "@/server/env";

interface AskCachedResult {
  status: "found" | "not_found";
  match?: WorkDetail;
  suggestions?: string[];
}

interface AppStore {
  settings: AppSettings;
  recentQueries: Array<{
    query: string;
    type: WorkType;
    answeredAt: string;
  }>;
  askResultCache: Array<{
    key: string;
    query: string;
    type: WorkType;
    result: AskCachedResult;
    cachedAt: string;
  }>;
  latestDigest?: DailyDigestView;
  recommendationHistory: RecommendationResult[];
  lastLibraryScan?: LibraryScanResult;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value == null) {
    return fallback;
  }
  return value.toLowerCase() !== "false";
}

function parseLibraryRoots(value: string | undefined) {
  if (!value) {
    return [{ label: "Anime", path: "E:/Media/Anime" }];
  }

  return value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [label, path] = entry.split("|");
      return {
        label: (label ?? "Library").trim() || "Library",
        path: (path ?? label ?? "").trim()
      };
    })
    .filter((entry) => entry.path);
}

function defaultSettings(): AppSettings {
  return {
    displayName: "Gao",
    timezone: "Asia/Shanghai",
    newsDigestTime: "09:00",
    preferredTags: ["jrpg", "character drama"],
    excludedTags: ["horror"],
    preferredPlatforms: ["Steam", "PC"],
    apiKeys: {
      omdb: process.env.ACGAGENT_OMDB_API_KEY ?? "",
      llm: process.env.ACGAGENT_LLM_API_KEY ?? ""
    },
    proxyEnabled: parseBoolean(process.env.ACGAGENT_PROXY_ENABLED, false),
    proxyUrl: process.env.ACGAGENT_PROXY_URL ?? "http://127.0.0.1:7897",
    llmEnabled: parseBoolean(process.env.ACGAGENT_LLM_ENABLED, true),
    llmBaseUrl: process.env.ACGAGENT_LLM_BASE_URL ?? "https://coding.dashscope.aliyuncs.com/v1",
    llmModel: process.env.ACGAGENT_LLM_MODEL ?? "qwen3.5-plus",
    llmTranslateNews: parseBoolean(process.env.ACGAGENT_LLM_TRANSLATE_NEWS, true),
    llmSummarizeNews: parseBoolean(process.env.ACGAGENT_LLM_SUMMARIZE_NEWS, true),
    libraryRoots: parseLibraryRoots(process.env.ACGAGENT_LIBRARY_ROOTS)
  };
}

declare global {
  var acgAgentStore: AppStore | undefined;
}

export function getAppStore(): AppStore {
  ensureServerEnv();

  if (!global.acgAgentStore) {
    global.acgAgentStore = {
      settings: defaultSettings(),
      recentQueries: [],
      askResultCache: [],
      recommendationHistory: []
    };
  }

  return global.acgAgentStore;
}
