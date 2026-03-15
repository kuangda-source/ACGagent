import { ensureServerEnv } from "@/server/env";
import { scanLibrary } from "@/server/library/service";

async function main() {
  ensureServerEnv();
  const result = await scanLibrary();
  console.log(`Library scanned: entries=${result.entries.length}, roots=${result.rootPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
