import { NextResponse } from "next/server";
import { z } from "zod";
import { recommendGames } from "@/server/recommendation/service";

const payloadSchema = z.object({
  likedTitles: z.array(z.string()).default([]),
  preferredTags: z.array(z.string()).default([]),
  excludedTags: z.array(z.string()).default([]),
  platform: z.string().default("Steam")
});

export async function POST(request: Request) {
  try {
    const payload = payloadSchema.parse(await request.json());
    const items = await recommendGames(payload);
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: "请求参数不合法。" }, { status: 400 });
  }
}
