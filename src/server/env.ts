import { loadEnvConfig } from "@next/env";

let loaded = false;

export function ensureServerEnv() {
  if (!loaded) {
    loadEnvConfig(process.cwd());
    loaded = true;
  }
}
