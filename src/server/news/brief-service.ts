import { fetch } from "undici";
import type { Dispatcher } from "undici";
import type { NewsArticleSummary, NewsBriefView } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/server/settings/service";
import { closeDispatcher, createRequestDispatcher } from "@/server/providers/shared";

interface BriefResponse {
  brief?: string;
  keyPoints?: string[];
}

interface SummarizeOptions {
  forceRefresh?: boolean;
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function sanitizeInput(text: string, maxLength = 700) {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function chineseRatio(text: string) {
  if (!text) {
    return 0;
  }

  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return chineseChars / text.length;
}

function hasEnoughChinese(text: string) {
  if (!text) {
    return false;
  }

  return chineseRatio(text) >= 0.2;
}

function isWeakBrief(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return true;
  }

  if (normalized.length < 140) {
    return true;
  }

  return normalized.includes("目前可获取的信息显示") || normalized.includes("建议点击原文查看完整背景");
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

function categoryLabel(category: string) {
  switch (category) {
    case "anime":
      return "动漫";
    case "comic":
      return "漫画";
    case "game":
      return "游戏";
    case "industry":
      return "业界";
    case "event":
      return "活动";
    default:
      return "其他";
  }
}

function parseKeyPoints(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as string[];
    }

    return parsed.map((item) => sanitizeInput(String(item), 80)).filter(Boolean).slice(0, 6);
  } catch {
    return [] as string[];
  }
}

function sourceIdFromArticle(article: NewsArticleSummary) {
  const provided = (article.sourceId ?? "").trim();
  if (provided) {
    return provided;
  }

  const normalized = article.sourceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `source-${normalized || "unknown"}`;
}

function sourceHomepage(article: NewsArticleSummary) {
  try {
    return new URL(article.url).origin;
  } catch {
    return "https://local.acgagent";
  }
}

function toBriefView(article: NewsArticleSummary, brief: string, keyPoints: string[]): NewsBriefView {
  return {
    articleId: article.id,
    headline: article.title,
    brief,
    keyPoints,
    sourceName: article.sourceName,
    category: article.category,
    publishedAt: article.publishedAt,
    url: article.url
  };
}

function buildFallbackBrief(article: NewsArticleSummary): NewsBriefView {
  const merged = [article.summary, article.originalSummary]
    .map((item) => sanitizeInput(item ?? "", 360))
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .join(" ");

  const title = hasEnoughChinese(article.title) ? article.title : `这条${categoryLabel(article.category)}新闻`;
  const brief = hasEnoughChinese(merged)
    ? merged.slice(0, 320)
    : `来源 ${article.sourceName} 的${categoryLabel(article.category)}新闻《${title}》。目前可获取的信息显示，该内容已进入今日聚合列表，包含发布时间、来源与核心事件描述。建议点击原文查看完整背景、时间线、涉及角色与后续影响。`;

  return toBriefView(article, brief, [
    `来源：${article.sourceName}`,
    `类别：${categoryLabel(article.category)}`,
    `发布时间：${new Date(article.publishedAt).toLocaleString("zh-CN")}`,
    `标题：${sanitizeInput(article.title, 70)}`
  ]);
}

function heuristicTranslateEnglish(text: string) {
  let output = ` ${text} `;
  const replacements: Array<[RegExp, string]> = [
    [/\bwe compare\b/gi, "我们对比"],
    [/\bcompared with\b/gi, "并与"],
    [/\bcompare\b/gi, "对比"],
    [/\bversion\b/gi, "版本"],
    [/\bversions\b/gi, "多个版本"],
    [/\blaunches\b/gi, "上线"],
    [/\blaunch\b/gi, "发布"],
    [/\bannounced\b/gi, "已公布"],
    [/\bannounce\b/gi, "公布"],
    [/\bupdate\b/gi, "更新"],
    [/\bcompetition\b/gi, "活动竞争"],
    [/\bevent\b/gi, "活动"],
    [/\bwith\b/gi, "与"],
    [/\bfrom\b/gi, "来自"],
    [/\bfor\b/gi, "面向"],
    [/\bon\b/gi, "在"],
    [/\bto\b/gi, "以便"],
    [/\bhelp you find\b/gi, "帮助你找到"],
    [/\bbest\b/gi, "最佳"],
    [/\boriginal\b/gi, "原版"],
    [/\brelease\b/gi, "版本发售"],
    [/\band\b/gi, "和"],
    [/\bthe\b/gi, ""]
  ];

  for (const [pattern, replacement] of replacements) {
    output = output.replace(pattern, replacement);
  }

  output = output
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, "。")
    .replace(/\./g, "。")
    .replace(/\?/g, "？")
    .trim();

  return output;
}

async function translateTextToChinese(
  text: string,
  settings: {
    llmEnabled: boolean;
    llmBaseUrl: string;
    llmModel: string;
    apiKeys: Record<string, string>;
  },
  dispatcher?: Dispatcher
) {
  const input = sanitizeInput(text, 1200);
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
    temperature: 0.1,
    max_tokens: 350,
    max_completion_tokens: 350,
    extra_body: {
      enable_thinking: false
    },
    messages: [
      {
        role: "system",
        content: "将输入文本翻译为完整、自然的简体中文，保留专有名词。只输出翻译结果，不要解释。"
      },
      {
        role: "user",
        content: input
      }
    ]
  };

  for (const timeoutMs of [55_000]) {
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
      const translated = sanitizeInput(extractTextContent(body.choices?.[0]?.message?.content), 1200);
      if (hasEnoughChinese(translated)) {
        return translated;
      }
    } catch {
      // Continue retry.
    }
  }

  return "";
}

async function buildEnhancedFallbackBrief(
  article: NewsArticleSummary,
  settings: {
    llmEnabled: boolean;
    llmBaseUrl: string;
    llmModel: string;
    apiKeys: Record<string, string>;
  },
  dispatcher?: Dispatcher
) {
  const rawSummary = sanitizeInput(article.originalSummary ?? article.summary, 1200);
  const translatedSummary = (await translateTextToChinese(rawSummary, settings, dispatcher)) || heuristicTranslateEnglish(rawSummary);

  if (!translatedSummary) {
    return buildFallbackBrief(article);
  }

  const brief = sanitizeInput(
    `据 ${article.sourceName} 报道，${translatedSummary} 以上为该条资讯可获取的核心内容整理，建议结合原文查看完整上下文与细节。`,
    360
  );

  const pointCandidates = translatedSummary
    .split(/[。！？；]/)
    .map((item) => sanitizeInput(item, 70))
    .filter((item) => item.length >= 10)
    .slice(0, 4);

  const keyPoints = [
    `来源：${article.sourceName}`,
    `类别：${categoryLabel(article.category)}`,
    `发布时间：${new Date(article.publishedAt).toLocaleString("zh-CN")}`,
    `标题：${sanitizeInput(article.title, 60)}`,
    ...pointCandidates
  ].slice(0, 6);

  return toBriefView(article, brief, keyPoints);
}

async function ensureArticleRecord(article: NewsArticleSummary) {
  const sourceId = sourceIdFromArticle(article);

  await prisma.newsSource.upsert({
    where: { id: sourceId },
    update: {
      name: article.sourceName,
      url: sourceHomepage(article),
      kind: "rss",
      enabled: true
    },
    create: {
      id: sourceId,
      name: article.sourceName,
      url: sourceHomepage(article),
      kind: "rss",
      enabled: true
    }
  });

  return prisma.newsArticle.upsert({
    where: { url: article.url },
    update: {
      sourceId,
      externalId: article.id,
      title: article.title,
      originalTitle: article.originalTitle,
      summary: article.summary,
      originalSummary: article.originalSummary,
      category: article.category,
      keywords: JSON.stringify(article.keywords ?? []),
      publishedAt: new Date(article.publishedAt)
    },
    create: {
      sourceId,
      externalId: article.id,
      title: article.title,
      originalTitle: article.originalTitle,
      url: article.url,
      summary: article.summary,
      originalSummary: article.originalSummary,
      category: article.category,
      keywords: JSON.stringify(article.keywords ?? []),
      publishedAt: new Date(article.publishedAt)
    }
  });
}

async function getPersistedBrief(article: NewsArticleSummary): Promise<NewsBriefView | null> {
  const record = await prisma.newsArticle.findUnique({
    where: { url: article.url },
    include: {
      brief: true
    }
  });

  if (!record?.brief) {
    return null;
  }

  const keyPoints = parseKeyPoints(record.brief.keyPoints);
  if (!record.brief.brief.trim()) {
    return null;
  }

  return {
    articleId: article.id,
    headline: article.title,
    brief: record.brief.brief,
    keyPoints,
    sourceName: article.sourceName,
    category: article.category,
    publishedAt: article.publishedAt,
    url: article.url
  };
}

async function persistBrief(article: NewsArticleSummary, result: NewsBriefView) {
  const articleRecord = await ensureArticleRecord(article);

  await prisma.newsArticleBrief.upsert({
    where: { articleId: articleRecord.id },
    update: {
      brief: result.brief,
      keyPoints: JSON.stringify(result.keyPoints)
    },
    create: {
      articleId: articleRecord.id,
      brief: result.brief,
      keyPoints: JSON.stringify(result.keyPoints)
    }
  });
}

async function requestLlmBrief(
  article: NewsArticleSummary,
  settings: {
    llmEnabled: boolean;
    llmBaseUrl: string;
    llmModel: string;
    apiKeys: Record<string, string>;
  },
  dispatcher?: Dispatcher
): Promise<NewsBriefView | null> {
  if (!settings.llmEnabled) {
    return null;
  }

  const apiKey = (settings.apiKeys.llm ?? "").trim();
  const model = settings.llmModel.trim();
  const baseUrl = normalizeBaseUrl(settings.llmBaseUrl);

  if (!apiKey || !model || !baseUrl) {
    return null;
  }

  const prompt = {
    model,
    temperature: 0.2,
    max_tokens: 500,
    max_completion_tokens: 500,
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
          "你是 ACG 新闻编辑。请输出详细中文新闻卡片，尽量覆盖原文信息。仅返回 JSON：{\"brief\":string,\"keyPoints\":string[]}。要求：1) brief 为 140-320 字、至少 3 句，包含背景、核心事实、时间节点和影响/后续；2) keyPoints 输出 4-6 条，每条 16-48 字，不要重复。"
      },
      {
        role: "user",
        content: JSON.stringify({
          title: sanitizeInput(article.originalTitle ?? article.title, 260),
          translatedTitle: sanitizeInput(article.title, 260),
          summary: sanitizeInput(article.originalSummary ?? article.summary, 900),
          translatedSummary: sanitizeInput(article.summary, 900),
          sourceName: article.sourceName,
          category: categoryLabel(article.category),
          publishedAt: article.publishedAt,
          url: article.url
        })
      }
    ]
  };

  for (const timeoutMs of [20_000]) {
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
      const parsed = JSON.parse(json) as BriefResponse;

      const brief = sanitizeInput(parsed.brief ?? "", 360);
      const keyPoints = Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map((item) => sanitizeInput(String(item), 80)).filter(Boolean).slice(0, 6) : [];

      if (brief.length < 140 || !hasEnoughChinese(brief)) {
        continue;
      }

      const normalizedPoints = keyPoints.length >= 4 ? keyPoints : buildFallbackBrief(article).keyPoints;
      return toBriefView(article, brief, normalizedPoints);
    } catch {
      // Continue retry.
    }
  }

  return null;
}

export async function summarizeNewsArticle(article: NewsArticleSummary, options: SummarizeOptions = {}): Promise<NewsBriefView> {
  const { forceRefresh = false } = options;

  if (!forceRefresh) {
    const persisted = await getPersistedBrief(article);
    if (persisted) {
      return persisted;
    }
  }

  const settings = await getSettings();
  const dispatcher = createRequestDispatcher(settings);

  try {
    const llmBrief = await requestLlmBrief(article, settings, dispatcher);
    const result = llmBrief ?? (await buildEnhancedFallbackBrief(article, settings, dispatcher));
    await persistBrief(article, result);
    return result;
  } finally {
    await closeDispatcher(dispatcher);
  }
}

export async function warmNewsBriefCache(articles: NewsArticleSummary[]) {
  const deduped = [...new Map(articles.map((article) => [article.url, article])).values()];
  const concurrency = Math.min(3, deduped.length);
  if (concurrency === 0) {
    return;
  }

  let cursor = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < deduped.length) {
        const index = cursor;
        cursor += 1;
        const article = deduped[index];
        if (!article) {
          continue;
        }

        try {
          await summarizeNewsArticle(article);
        } catch {
          // Ignore individual failures to keep daily job resilient.
        }
      }
    })
  );
}
