import { NextResponse } from "next/server";
import { z } from "zod";
import { summarizeNewsArticle } from "@/server/news/brief-service";

const payloadSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().optional(),
  title: z.string().min(1),
  url: z.string().url(),
  summary: z.string().min(1),
  category: z.string().min(1),
  sourceName: z.string().min(1),
  publishedAt: z.string().min(1),
  originalTitle: z.string().optional(),
  originalSummary: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  forceRefresh: z.boolean().optional()
});

export async function POST(request: Request) {
  try {
    const payload = payloadSchema.parse(await request.json());
    const result = await summarizeNewsArticle(
      {
        id: payload.id,
        sourceId: payload.sourceId,
        title: payload.title,
        url: payload.url,
        summary: payload.summary,
        category: payload.category,
        sourceName: payload.sourceName,
        publishedAt: payload.publishedAt,
        originalTitle: payload.originalTitle,
        originalSummary: payload.originalSummary,
        keywords: payload.keywords
      },
      {
        forceRefresh: payload.forceRefresh
      }
    );

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "新闻摘要请求参数不合法。" }, { status: 400 });
  }
}
