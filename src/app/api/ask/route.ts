import { NextResponse } from "next/server";
import { z } from "zod";
import { askWork } from "@/server/works/service";

const payloadSchema = z.object({
  query: z.string().min(1),
  type: z.enum(["ANIME", "GAME"]).default("ANIME")
});

export async function POST(request: Request) {
  let payload: z.infer<typeof payloadSchema>;

  try {
    payload = payloadSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "请求参数不合法。" }, { status: 400 });
  }

  try {
    const result = await askWork(payload.query, payload.type);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "查询失败，请稍后重试。" }, { status: 500 });
  }
}
