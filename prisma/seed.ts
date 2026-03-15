import { demoAnimeCatalog, demoGameCatalog } from "@/server/data/catalog";

async function main() {
  console.log(`Demo seed ready: ${demoAnimeCatalog.length} anime entries, ${demoGameCatalog.length} game entries.`);
  console.log("Run prisma migrate/generate first, then replace this file with real upserts if you want DB persistence.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
