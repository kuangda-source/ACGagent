import { NextResponse } from "next/server";
import { getDashboardSnapshot } from "@/server/dashboard/service";

export async function GET() {
  const snapshot = await getDashboardSnapshot();
  return NextResponse.json(snapshot);
}
