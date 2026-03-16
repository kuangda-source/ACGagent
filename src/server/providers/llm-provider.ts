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

const DEFAULT_BUDGET_MS = 90_000;
const LLM_CHUNK_SIZE = 8;
const LLM_ATTEMPT_TIMEOUTS = [20_000];
const LLM_TEXT_ATTEMPT_TIMEOUTS = [12_000];

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

function chineseRatio(text: string) {
  if (!text) {
    return 0;
  }

  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return chineseChars / text.length;
}

function hasEnoughChinese(text: string) {
  return hasChinese(text) && chineseRatio(text) >= 0.2;
}

function englishRatio(text: string) {
  if (!text) {
    return 0;
  }

  const englishChars = (text.match(/[A-Za-z]/g) ?? []).length;
  return englishChars / text.length;
}

function needsChineseTitleTranslation(text: string) {
  if (!hasEnoughChinese(text)) {
    return true;
  }
  return englishRatio(text) > 0.55;
}

function needsChineseSummaryTranslation(text: string) {
  if (!hasEnoughChinese(text)) {
    return true;
  }
  return englishRatio(text) > 0.6;
}

function sanitizeInput(text: string, maxLength = 200) {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function heuristicTranslateEnglish(text: string) {
  let output = ` ${text} `;
  const replacements: Array<[RegExp, string]> = [
    [/\bwe compare\b/gi, "我们对比"],
    [/\bcompared with\b/gi, "并与"],
    [/\bcompare\b/gi, "对比"],
    [/\bversion\b/gi, "版本"],
    [/\blaunches\b/gi, "上线"],
    [/\blaunch\b/gi, "发布"],
    [/\bannounced\b/gi, "已公布"],
    [/\bannounce\b/gi, "公布"],
    [/\bupdate\b/gi, "更新"],
    [/\bevent\b/gi, "活动"],
    [/\bfrom\b/gi, "来自"],
    [/\bfor\b/gi, "面向"],
    [/\bon\b/gi, "在"],
    [/\bto\b/gi, "以便"],
    [/\bwith\b/gi, "与"],
    [/\band\b/gi, "和"],
    [/\bthe\b/gi, ""]
  ];

  for (const [pattern, replacement] of replacements) {
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

function stripNewsPrefix(text: string) {
  return text.replace(/^(动漫|漫画|游戏|业界|活动|资讯)快讯[：:]\s*/g, "").trim();
}

function buildChineseTitle(item: NewsArticleSummary, translatedTitle: string) {
  const normalizedInput = stripNewsPrefix(sanitizeInput(translatedTitle, 80));
  if (hasEnoughChinese(normalizedInput) && englishRatio(normalizedInput) <= 0.7) {
    return normalizedInput;
  }

  const heuristic = stripNewsPrefix(sanitizeInput(heuristicTranslateEnglish(normalizedInput || item.title), 80));
  if (hasEnoughChinese(heuristic) && englishRatio(heuristic) <= 0.7) {
    return heuristic;
  }

  const categoryLabel = CATEGORY_LABEL_MAP[item.category] ?? "资讯";
  return `${categoryLabel}快讯：该条资讯正在同步翻译，详情请查看来源`;
}

function buildChineseSummary(item: NewsArticleSummary, zhTitle: string, translatedBody?: string) {
  const categoryLabel = CATEGORY_LABEL_MAP[item.category] ?? "资讯";
  const title = hasChinese(zhTitle) ? zhTitle : `这条${categoryLabel}新闻`;
  const body =
    translatedBody && hasEnoughChinese(translatedBody)
      ? sanitizeInput(translatedBody, 220)
      : sanitizeInput(heuristicTranslateEnglish(item.originalSummary ?? item.summary), 220);

  if (hasEnoughChinese(body) && englishRatio(body) <= 0.7) {
    return `来源：${item.sourceName}。${body}`;
  }

  return `来源：${item.sourceName}。${title}，当前翻译结果尚不完整，建议查看原文获取全部细节。`;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>) {
  const safeLimit = Math.max(1, Math.min(limit, items.length || 1));
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: safeLimit }, () => worker()));
  return results;
}

function ensureChineseFallback(items: NewsArticleSummary[]) {
  return items.map((item) => {
    const titleNeedsTranslation = needsChineseTitleTranslation(item.title);
    const summaryNeedsTranslation = needsChineseSummaryTranslation(item.summary);
    if (!titleNeedsTranslation && !summaryNeedsTranslation) {
      return item;
    }

    const title = titleNeedsTranslation ? buildChineseTitle(item, heuristicTranslateEnglish(item.title)) : stripNewsPrefix(item.title);
    const summary = summaryNeedsTranslation ? buildChineseSummary(item, title, heuristicTranslateEnglish(item.originalSummary ?? item.summary)) : item.summary;

    return {
      ...item,
      title,
      summary,
      originalTitle: item.originalTitle ?? item.title,
      originalSummary: item.originalSummary ?? item.summary
    };
  });
}

async function translateWithMymemory(text: string, dispatcher?: Dispatcher, maxLength = 220) {
  const input = sanitizeInput(text, maxLength);
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

async function translateTextWithLlm(
  text: string,
  settings: Pick<AppSettings, "llmEnabled" | "llmBaseUrl" | "llmModel" | "apiKeys">,
  dispatcher?: Dispatcher
) {
  const input = sanitizeInput(text, 900);
  if (!input || hasEnoughChinese(input) || !settings.llmEnabled) {
    return input;
  }

  const apiKey = (settings.apiKeys.llm ?? "").trim();
  const model = settings.llmModel.trim();
  const baseUrl = normalizeBaseUrl(settings.llmBaseUrl);

  if (!apiKey || !model || !baseUrl) {
    return "";
  }

  const prompt = {
    model,
    temperature: 0,
    max_tokens: 500,
    max_completion_tokens: 500,
    extra_body: {
      enable_thinking: false
    },
    messages: [
      {
        role: "system",
        content: "你是翻译器。你必须只输出简体中文译文，不要解释，不要添加背景。除作品名、人名、品牌名外，禁止英文单词。"
      },
      {
        role: "user",
        content: `请翻译为简体中文：\n${input}`
      }
    ]
  };

  for (const timeoutMs of LLM_TEXT_ATTEMPT_TIMEOUTS) {
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

      const translated = sanitizeInput(extractTextContent(body.choices?.[0]?.message?.content), 900);
      if (hasEnoughChinese(translated)) {
        return translated;
      }
    } catch {
      // Continue retry.
    }
  }

  return "";
}

async function translateArticleWithLlm(
  title: string,
  summary: string,
  settings: Pick<AppSettings, "llmEnabled" | "llmBaseUrl" | "llmModel" | "apiKeys">,
  dispatcher?: Dispatcher
) {
  if (!settings.llmEnabled) {
    return { title: "", summary: "" };
  }

  const apiKey = (settings.apiKeys.llm ?? "").trim();
  const model = settings.llmModel.trim();
  const baseUrl = normalizeBaseUrl(settings.llmBaseUrl);
  if (!apiKey || !model || !baseUrl) {
    return { title: "", summary: "" };
  }

  const payload = {
    title: sanitizeInput(title, 240),
    summary: sanitizeInput(summary, 900)
  };

  const prompt = {
    model,
    temperature: 0,
    max_tokens: 800,
    max_completion_tokens: 800,
    extra_body: {
      enable_thinking: false
    },
    messages: [
      {
        role: "system",
        content: "你是翻译器。把输入的新闻标题和摘要翻译为简体中文，忠实原文，不编造信息。只返回 JSON：{\"title\":string,\"summary\":string}。"
      },
      {
        role: "user",
        content: JSON.stringify(payload)
      }
    ]
  };

  for (const timeoutMs of LLM_TEXT_ATTEMPT_TIMEOUTS) {
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
      const raw = extractTextContent(body.choices?.[0]?.message?.content);
      const parsed = JSON.parse(extractJsonString(raw)) as { title?: string; summary?: string };

      return {
        title: sanitizeInput(parsed.title ?? "", 120),
        summary: sanitizeInput(parsed.summary ?? "", 320)
      };
    } catch {
      // Continue retry.
    }
  }

  return { title: "", summary: "" };
}

async function fallbackTranslateBatch(
  items: NewsArticleSummary[],
  settings: Pick<AppSettings, "llmEnabled" | "llmBaseUrl" | "llmModel" | "apiKeys">,
  dispatcher?: Dispatcher
): Promise<NewsArticleSummary[]> {
  const translatedItems = await mapWithConcurrency(items, 3, async (item) => {
      const titleNeedsTranslation = needsChineseTitleTranslation(item.title);
      const summaryNeedsTranslation = needsChineseSummaryTranslation(item.summary);

      if (!titleNeedsTranslation && !summaryNeedsTranslation) {
        return item;
      }

      const sourceTitle = item.originalTitle ?? item.title;
      const sourceSummary = item.originalSummary ?? item.summary;

      const pair = await translateArticleWithLlm(sourceTitle, sourceSummary, settings, dispatcher);
      let maybeZhTitle = titleNeedsTranslation ? pair.title : item.title;
      if (titleNeedsTranslation && (!hasEnoughChinese(maybeZhTitle) || englishRatio(maybeZhTitle) > 0.7)) {
        maybeZhTitle = await translateWithMymemory(sourceTitle, dispatcher, 220);
      }
      const finalTitle = buildChineseTitle(item, maybeZhTitle || sourceTitle);

      let translatedSummaryBody = "";
      if (summaryNeedsTranslation) {
        translatedSummaryBody = pair.summary;
        if (!hasEnoughChinese(translatedSummaryBody) || englishRatio(translatedSummaryBody) > 0.7) {
          translatedSummaryBody = await translateWithMymemory(sourceSummary, dispatcher, 500);
        }
      }
      const finalSummary = summaryNeedsTranslation ? buildChineseSummary(item, finalTitle, translatedSummaryBody) : item.summary;

      return {
        ...item,
        title: finalTitle,
        summary: finalSummary,
        originalTitle: item.originalTitle ?? item.title,
        originalSummary: item.originalSummary ?? item.summary
      };
    });

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
    temperature: 0,
    max_tokens: 1200,
    max_completion_tokens: 1200,
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
          "你是 ACG 新闻编辑。请把每条 title/summary 翻译成自然简体中文，尽量不使用英文，保留作品名与专有名词。summary 需覆盖原文关键信息，不少于 50 字。只返回 JSON：{\"items\":[{\"id\":string,\"title\":string,\"summary\":string,\"category\":\"anime|comic|game|industry|event|other\"}]}"
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

  const input = items;

  try {
    const translated = await fallbackTranslateBatch(input, settings, dispatcher);
    return ensureChineseFallback(translated);
  } catch {
    return ensureChineseFallback(input);
  }
}



