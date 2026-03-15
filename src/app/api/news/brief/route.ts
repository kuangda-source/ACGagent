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
  originalSummary: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const payload = payloadSchema.parse(await request.json());
    const result = await summarizeNewsArticle(payload);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "新闻摘要请求参数不合法。" }, { status: 400 });
  }
}
