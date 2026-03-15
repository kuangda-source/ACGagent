import { z } from "zod";
import type { AppSettings } from "@/lib/types";
import { getAppStore } from "@/server/persistence/app-state";

const rootSchema = z.object({
  label: z.string().min(1),
  path: z.string().min(1)
});

const settingsSchema = z.object({
  displayName: z.string().min(1),
  timezone: z.string().min(1),
  newsDigestTime: z.string().regex(/^\d{2}:\d{2}$/),
  preferredTags: z.array(z.string()),
  excludedTags: z.array(z.string()),
  preferredPlatforms: z.array(z.string()),
  apiKeys: z.record(z.string()),
  proxyEnabled: z.boolean(),
  proxyUrl: z.string(),
  llmEnabled: z.boolean(),
  llmBaseUrl: z.string(),
  llmModel: z.string(),
  llmTranslateNews: z.boolean(),
  llmSummarizeNews: z.boolean(),
  libraryRoots: z.array(rootSchema)
});

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function getSettings(): Promise<AppSettings> {
  return clone(getAppStore().settings);
}

export async function saveSettings(input: unknown): Promise<AppSettings> {
  const next = settingsSchema.parse(input);
  const store = getAppStore();
  store.settings = next;
  return clone(store.settings);
}
