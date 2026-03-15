import type { DashboardSnapshot } from "@/lib/types";
import { getLatestDigest } from "@/server/news/service";
import { getAppStore } from "@/server/persistence/app-state";
import { recommendGames } from "@/server/recommendation/service";

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const store = getAppStore();
  const digest = await getLatestDigest();

  const recommendationHighlights =
    store.recommendationHistory.length > 0
      ? store.recommendationHistory.slice(0, 3)
      : await recommendGames({
          likedTitles: ["Frieren", "Bocchi the Rock!"],
          preferredTags: store.settings.preferredTags,
          excludedTags: store.settings.excludedTags,
          platform: store.settings.preferredPlatforms[0] ?? "Steam"
        });

  const lastScan = store.lastLibraryScan;

  return {
    digest,
    recentQueries: store.recentQueries.slice(0, 6),
    recommendationHighlights: recommendationHighlights.slice(0, 3),
    librarySummary: {
      totalFiles: lastScan?.entries.length ?? 0,
      trackedSeries: new Set(lastScan?.entries.map((entry) => entry.detectedTitle.toLowerCase()) ?? []).size,
      lastScanLabel: lastScan ? new Date(lastScan.scannedAt).toLocaleString("zh-CN") : "尚未扫描"
    }
  };
}
