import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/server/settings/service";

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const nextSettings = await saveSettings(payload);
    return NextResponse.json(nextSettings);
  } catch {
    return NextResponse.json({ error: "设置格式不合法。" }, { status: 400 });
  }
}
