import { NextResponse } from "next/server";
import { getAppStore } from "@/server/persistence/app-state";

export async function DELETE() {
  const store = getAppStore();
  store.recentQueries = [];
  store.askResultCache = [];
  return NextResponse.json({ ok: true });
}
