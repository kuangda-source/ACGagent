import type { WorkDetail, WorkType } from "@/lib/types";
import { demoAnimeCatalog, demoGameCatalog } from "@/server/data/catalog";
import { getAppStore } from "@/server/persistence/app-state";

export type AskWorkResult =
  | { status: "found"; match: WorkDetail }
  | { status: "not_found"; suggestions: string[] };

function normalize(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function scoreMatch(query: string, item: WorkDetail) {
  const q = normalize(query);
  const title = normalize(item.title);
  if (title === q) {
    return 100;
  }
  if (title.includes(q)) {
    return 70;
  }

  for (const alias of item.aliases) {
    const normalizedAlias = normalize(alias);
    if (normalizedAlias === q) {
      return 95;
    }
    if (normalizedAlias.includes(q) || q.includes(normalizedAlias)) {
      return 75;
    }
  }

  return 0;
}

function chooseCatalog(type: WorkType) {
  return type === "ANIME" ? demoAnimeCatalog : demoGameCatalog;
}

export async function askWork(query: string, type: WorkType): Promise<AskWorkResult> {
  const catalog = chooseCatalog(type);
  const best = catalog
    .map((item) => ({ item, score: scoreMatch(query, item) }))
    .sort((a, b) => b.score - a.score)[0];

  getAppStore().recentQueries.unshift({
    query,
    type,
    answeredAt: new Date().toISOString()
  });
  getAppStore().recentQueries = getAppStore().recentQueries.slice(0, 20);

  if (!best || best.score < 60) {
    return {
      status: "not_found",
      suggestions: catalog.slice(0, 5).map((item) => item.title)
    };
  }

  return {
    status: "found",
    match: best.item
  };
}
