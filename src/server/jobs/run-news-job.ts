import { ensureServerEnv } from "@/server/env";
import { warmNewsBriefCache } from "@/server/news/brief-service";
import { refreshDailyDigest } from "@/server/news/service";

async function main() {
  ensureServerEnv();
  const digest = await refreshDailyDigest();
  await warmNewsBriefCache(digest.highlights);
  console.log(`Digest refreshed: ${digest.digestDate}, highlights=${digest.highlights.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});