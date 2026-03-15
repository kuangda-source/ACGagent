import { NextResponse } from "next/server";
import { getLastLibraryScan, scanLibrary } from "@/server/library/service";

export async function GET() {
  const result = await getLastLibraryScan();
  return NextResponse.json({ result: result ?? null });
}

export async function POST() {
  try {
    const result = await scanLibrary();
    return NextResponse.json({ result });
  } catch {
    return NextResponse.json({ error: "扫描失败，请检查目录设置和读取权限。" }, { status: 500 });
  }
}
