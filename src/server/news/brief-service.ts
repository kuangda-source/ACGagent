import { fetch } from "undici";
import type { Dispatcher } from "undici";
import type { NewsArticleSummary, NewsBriefView } from "@/lib/types";
import { getSettings } from "@/server/settings/service";
import { closeDispatcher, createRequestDispatcher } from "@/server/providers/shared";

interface BriefResponse {
  brief?: string;
  keyPoints?: string[];
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function sanitizeInput(text: string, maxLength = 500) {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
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

function buildFallbackBrief(article: NewsArticleSummary): NewsBriefView {
  const summary = sanitizeInput(article.summary || article.originalSummary || "暂无摘要", 160);
  const brief = summary || "该新闻暂未提供完整摘要，请查看来源了解详情。";

  return {
    articleId: article.id,
    headline: article.title,
    brief,
    keyPoints: [
      `来源：${article.sourceName}`,
      `类别：${categoryLabel(article.category)}`,
      `发布时间：${new Date(article.publishedAt).toLocaleString("zh-CN")}`
    ],
    sourceName: article.sourceName,
    category: article.category,
    publishedAt: article.publishedAt,
    url: article.url
  };
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
    max_tokens: 600,
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
          "你是 ACG 新闻编辑。将新闻浓缩为简体中文摘要卡。只返回 JSON：{\"brief\":string,\"keyPoints\":string[]}。keyPoints 输出 3-5 条，每条不超过 32 个中文字符。"
      },
      {
        role: "user",
        content: JSON.stringify({
          title: sanitizeInput(article.originalTitle ?? article.title, 220),
          translatedTitle: sanitizeInput(article.title, 220),
          summary: sanitizeInput(article.originalSummary ?? article.summary, 500),
          translatedSummary: sanitizeInput(article.summary, 500),
          sourceName: article.sourceName,
          category: categoryLabel(article.category),
          publishedAt: article.publishedAt
        })
      }
    ]
  };

  for (const timeoutMs of [10_000, 16_000]) {
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

      const brief = sanitizeInput(parsed.brief ?? "", 220);
      const keyPoints = Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map((item) => sanitizeInput(String(item), 60)).filter(Boolean).slice(0, 5) : [];

      if (!brief) {
        continue;
      }

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
    } catch {
      // Continue retry.
    }
  }

  return null;
}

export async function summarizeNewsArticle(article: NewsArticleSummary): Promise<NewsBriefView> {
  const settings = await getSettings();
  const dispatcher = createRequestDispatcher(settings);

  try {
    const llmBrief = await requestLlmBrief(article, settings, dispatcher);
    return llmBrief ?? buildFallbackBrief(article);
  } finally {
    await closeDispatcher(dispatcher);
  }
}
