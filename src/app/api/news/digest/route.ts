import { NextResponse } from "next/server";
import { getLatestDigest, refreshDailyDigest } from "@/server/news/service";

export async function GET() {
  return NextResponse.json(await getLatestDigest());
}

export async function POST() {
  return NextResponse.json(await refreshDailyDigest());
}
