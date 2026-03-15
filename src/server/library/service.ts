import { readdir } from "node:fs/promises";
import path from "node:path";
import type { LibraryEntry, LibraryEpisode, LibraryScanResult } from "@/lib/types";
import { getAppStore } from "@/server/persistence/app-state";

const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".avi", ".m4v", ".mov", ".wmv", ".flv"]);

function cleanTitle(raw: string) {
  return raw
    .replace(/[._]/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\([^\)]+\)/g, "")
    .replace(/[-_\s]+$/g, "")
    .trim();
}

export function parseEpisodeMetadata(fileName: string): {
  detectedTitle: string;
  seasonLabel?: string;
  episode?: LibraryEpisode;
} {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  const withoutFansub = base.replace(/^\[[^\]]+\]\s*/, "");

  const seasonEpisodeMatch = withoutFansub.match(/^(.*?)[\s._-]+S(\d{1,2})[\s._-]*E(\d{1,3})(?:\D|$)/i);
  if (seasonEpisodeMatch) {
    return {
      detectedTitle: cleanTitle(seasonEpisodeMatch[1]),
      seasonLabel: `S${Number(seasonEpisodeMatch[2])}`,
      episode: {
        rawLabel: `E${Number(seasonEpisodeMatch[3])}`,
        episodeNumber: Number(seasonEpisodeMatch[3])
      }
    };
  }

  const episodeDashMatch = withoutFansub.match(/^(.*?)[\s._-]+-\s*(\d{1,3})(?:\D|$)/);
  if (episodeDashMatch) {
    return {
      detectedTitle: cleanTitle(episodeDashMatch[1]),
      episode: {
        rawLabel: episodeDashMatch[2],
        episodeNumber: Number(episodeDashMatch[2])
      }
    };
  }

  const episodeSimpleMatch = withoutFansub.match(/^(.*?)[\s._-]+E(\d{1,3})(?:\D|$)/i);
  if (episodeSimpleMatch) {
    return {
      detectedTitle: cleanTitle(episodeSimpleMatch[1]),
      episode: {
        rawLabel: `E${Number(episodeSimpleMatch[2])}`,
        episodeNumber: Number(episodeSimpleMatch[2])
      }
    };
  }

  return {
    detectedTitle: cleanTitle(withoutFansub),
    episode: undefined
  };
}

async function walkFiles(root: string, collector: string[]) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, collector);
      continue;
    }
    collector.push(fullPath);
  }
}

function buildMissingEpisodeHints(entries: LibraryEntry[]) {
  const byTitle = new Map<string, number[]>();
  for (const entry of entries) {
    if (!entry.episode?.episodeNumber) {
      continue;
    }
    const key = entry.detectedTitle.toLowerCase();
    const list = byTitle.get(key) ?? [];
    list.push(entry.episode.episodeNumber);
    byTitle.set(key, list);
  }

  const hints: Array<{ title: string; missingEpisodes: number[] }> = [];

  for (const [title, episodes] of byTitle.entries()) {
    const uniq = [...new Set(episodes)].sort((a, b) => a - b);
    if (uniq.length < 3) {
      continue;
    }
    const missing: number[] = [];
    for (let n = uniq[0]; n <= uniq[uniq.length - 1]; n += 1) {
      if (!uniq.includes(n)) {
        missing.push(n);
      }
    }
    if (missing.length > 0) {
      hints.push({ title, missingEpisodes: missing.slice(0, 12) });
    }
  }

  return hints;
}

export async function scanLibrary(rootPaths?: Array<{ label: string; path: string }>): Promise<LibraryScanResult> {
  const store = getAppStore();
  const roots = rootPaths && rootPaths.length > 0 ? rootPaths : store.settings.libraryRoots;

  const files: string[] = [];
  for (const root of roots) {
    try {
      await walkFiles(root.path, files);
    } catch {
      // Ignore inaccessible roots to keep scan resilient.
    }
  }

  const entries: LibraryEntry[] = [];
  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const extension = path.extname(fileName).toLowerCase();
    if (!VIDEO_EXTENSIONS.has(extension)) {
      continue;
    }

    const parsed = parseEpisodeMetadata(fileName);
    entries.push({
      filePath,
      fileName,
      extension,
      detectedTitle: parsed.detectedTitle,
      seasonLabel: parsed.seasonLabel,
      episode: parsed.episode
    });
  }

  const result: LibraryScanResult = {
    rootPath: roots.map((root) => root.path).join("; "),
    scannedAt: new Date().toISOString(),
    entries,
    missingEpisodeHints: buildMissingEpisodeHints(entries)
  };

  store.lastLibraryScan = result;
  return result;
}

export async function getLastLibraryScan() {
  return getAppStore().lastLibraryScan;
}
