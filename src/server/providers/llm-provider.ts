import { fetch } from "undici";
import type { Dispatcher } from "undici";
import type { AppSettings, NewsArticleSummary } from "@/lib/types";

interface TranslateItem {
  id: string;
  title: string;
  summary: string;
  category: string;
}

interface TranslateResponse {
  items: Array<{
    id: string;
    title?: string;
    summary?: string;
    category?: string;
  }>;
}

const CATEGORY_LABEL_MAP: Record<string, string> = {
  anime: "动漫",
  comic: "漫画",
  game: "游戏",
  industry: "业界",
  event: "活动",
  other: "资讯"
};

const DEFAULT_BUDGET_MS = 65_000;
const LLM_CHUNK_SIZE = 8;
const LLM_ATTEMPT_TIMEOUTS = [18_000, 25_000];

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
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

  return "";
}

function extractJsonString(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Empty LLM response");
  }

  const cleaned = trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start < 0 || end <= start) {
    throw new Error("No JSON object found in LLM response");
  }

  return cleaned.slice(start, end + 1);
}

function normalizeCategory(category: string) {
  const normalized = category.trim().toLowerCase();
  if (["anime", "comic", "game", "industry", "event", "other"].includes(normalized)) {
    return normalized;
  }
  return "other";
}

function hasChinese(text: string) {
  return /[\u4e00-\u9fff]/.test(text);
}

function sanitizeInput(text: string, maxLength = 200) {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function buildChineseTitle(item: NewsArticleSummary, translatedTitle: string) {
  if (hasChinese(translatedTitle)) {
    return translatedTitle;
  }

  const categoryLabel = CATEGORY_LABEL_MAP[item.category] ?? "资讯";
  return `${categoryLabel}快讯：${sanitizeInput(item.title, 64) || "请查看原文"}`;
}

function buildChineseSummary(item: NewsArticleSummary, zhTitle: string) {
  const categoryLabel = CATEGORY_LABEL_MAP[item.category] ?? "资讯";
  const title = hasChinese(zhTitle) ? zhTitle : `这条${categoryLabel}新闻`;
  return `来源：${item.sourceName}。${title}，详情请查看原文链接。`;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function ensureChineseFallback(items: NewsArticleSummary[]) {
  return items.map((item) => {
    const titleNeedsTranslation = !hasChinese(item.title);
    const summaryNeedsTranslation = !hasChinese(item.summary);
    if (!titleNeedsTranslation && !summaryNeedsTranslation) {
      return item;
    }

    const title = titleNeedsTranslation ? buildChineseTitle(item, item.title) : item.title;
    const summary = summaryNeedsTranslation ? buildChineseSummary(item, title) : item.summary;

    return {
      ...item,
      title,
      summary,
      originalTitle: item.originalTitle ?? item.title,
      originalSummary: item.originalSummary ?? item.summary
    };
  });
}

async function translateWithMymemory(text: string, dispatcher?: Dispatcher) {
  const input = sanitizeInput(text, 160);
  if (!input) {
    return text;
  }

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(input)}&langpair=en|zh-CN`;
    const response = await fetch(url, {
      dispatcher,
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return text;
    }

    const body = (await response.json()) as {
      responseData?: {
        translatedText?: string;
      };
    };

    const translated = (body.responseData?.translatedText ?? "").trim();
    if (!translated || translated.includes("MYMEMORY WARNING")) {
      return text;
    }

    return translated;
  } catch {
    return text;
  }
}

async function fallbackTranslateBatch(items: NewsArticleSummary[], dispatcher?: Dispatcher): Promise<NewsArticleSummary[]> {
  const translatedItems = await Promise.all(
    items.map(async (item) => {
      const titleNeedsTranslation = !hasChinese(item.title);
      const summaryNeedsTranslation = !hasChinese(item.summary);

      if (!titleNeedsTranslation && !summaryNeedsTranslation) {
        return item;
      }

      const maybeZhTitle = titleNeedsTranslation ? await translateWithMymemory(item.title, dispatcher) : item.title;
      const finalTitle = buildChineseTitle(item, maybeZhTitle);
      const finalSummary = summaryNeedsTranslation ? buildChineseSummary(item, finalTitle) : item.summary;

      return {
        ...item,
        title: finalTitle,
        summary: finalSummary,
        originalTitle: item.originalTitle ?? item.title,
        originalSummary: item.originalSummary ?? item.summary
      };
    })
  );

  return translatedItems;
}

async function llmTranslateChunk(
  items: NewsArticleSummary[],
  settings: Pick<AppSettings, "llmBaseUrl" | "llmModel" | "apiKeys">,
  dispatcher?: Dispatcher
): Promise<Map<string, { title: string; summary: string; category: string }>> {
  const apiKey = (settings.apiKeys.llm ?? "").trim();
  const model = settings.llmModel.trim();
  const baseUrl = normalizeBaseUrl(settings.llmBaseUrl);

  if (!apiKey || !model || !baseUrl || items.length === 0) {
    return new Map();
  }

  const payloadItems: TranslateItem[] = items.map((item) => ({
    id: item.id,
    title: sanitizeInput(item.title, 120),
    summary: sanitizeInput(item.summary, 160),
    category: item.category
  }));

  const prompt = {
    model,
    temperature: 0.1,
    max_tokens: 1000,
    extra_body: {
      enable_thinking: false
    },
    response_format: {
      type: "json_object"
    },
    messages: [
      {
        role: "system",
        content:
          "你是 ACG 新闻编辑。请翻译成自然简体中文，并只返回 JSON。格式：{\"items\":[{\"id\":string,\"title\":string,\"summary\":string,\"category\":\"anime|comic|game|industry|event|other\"}]}. 不要输出其他文字。"
      },
      {
        role: "user",
        content: JSON.stringify({ items: payloadItems })
      }
    ]
  };

  for (const timeoutMs of LLM_ATTEMPT_TIMEOUTS) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        dispatcher,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(prompt),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!response.ok) {
        continue;
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };

      const rawContent = extractTextContent(body.choices?.[0]?.message?.content);
      const json = extractJsonString(rawContent);
      const parsed = JSON.parse(json) as TranslateResponse;

      if (!Array.isArray(parsed.items)) {
        continue;
      }

      const map = new Map<string, { title: string; summary: string; category: string }>();
      for (const row of parsed.items) {
        if (!row.id) {
          continue;
        }

        const title = (row.title ?? "").trim();
        const summary = (row.summary ?? "").trim();
        if (!title && !summary) {
          continue;
        }

        map.set(row.id, {
          title,
          summary,
          category: normalizeCategory(row.category ?? "other")
        });
      }

      if (map.size > 0) {
        return map;
      }
    } catch {
      // Continue to next attempt timeout.
    }
  }

  return new Map();
}

async function llmTranslateBatch(
  items: NewsArticleSummary[],
  settings: Pick<AppSettings, "llmEnabled" | "llmTranslateNews" | "llmBaseUrl" | "llmModel" | "apiKeys">,
  dispatcher?: Dispatcher
): Promise<NewsArticleSummary[] | null> {
  if (!settings.llmEnabled || !settings.llmTranslateNews) {
    return null;
  }

  const translatedMap = new Map<string, { title: string; summary: string; category: string }>();
  const chunks = chunkArray(items, LLM_CHUNK_SIZE);
  const startedAt = Date.now();

  for (const chunk of chunks) {
    if (Date.now() - startedAt > DEFAULT_BUDGET_MS) {
      break;
    }

    const part = await llmTranslateChunk(chunk, settings, dispatcher);
    for (const [id, translated] of part.entries()) {
      translatedMap.set(id, translated);
    }
  }

  if (translatedMap.size === 0) {
    return null;
  }

  return items.map((item) => {
    const translated = translatedMap.get(item.id);
    if (!translated) {
      return item;
    }

    const title = translated.title || item.title;
    const summary = translated.summary || item.summary;

    return {
      ...item,
      title,
      summary,
      category: translated.category || item.category,
      originalTitle: item.originalTitle ?? item.title,
      originalSummary: item.originalSummary ?? item.summary
    };
  });
}

export async function translateNewsBatch(
  items: NewsArticleSummary[],
  settings: Pick<AppSettings, "llmEnabled" | "llmTranslateNews" | "llmBaseUrl" | "llmModel" | "apiKeys">,
  dispatcher?: Dispatcher
): Promise<NewsArticleSummary[]> {
  if (items.length === 0) {
    return items;
  }

  const startedAt = Date.now();
  const llmResult = await llmTranslateBatch(items, settings, dispatcher);
  const input = llmResult ?? items;
  const remainBudget = Math.max(2000, DEFAULT_BUDGET_MS - (Date.now() - startedAt));

  try {
    return await Promise.race([
      fallbackTranslateBatch(input, dispatcher),
      new Promise<NewsArticleSummary[]>((resolve) => {
        setTimeout(() => {
          resolve(ensureChineseFallback(input));
        }, remainBudget);
      })
    ]);
  } catch {
    return ensureChineseFallback(input);
  }
}



