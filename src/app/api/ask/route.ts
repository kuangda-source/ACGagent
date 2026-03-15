import { NextResponse } from "next/server";
import { z } from "zod";
import { askWork } from "@/server/works/service";

const payloadSchema = z.object({
  query: z.string().min(1),
  type: z.enum(["ANIME", "GAME"]).default("ANIME")
});

export async function POST(request: Request) {
  try {
    const payload = payloadSchema.parse(await request.json());
    const result = await askWork(payload.query, payload.type);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "请求参数不合法。" }, { status: 400 });
  }
}
