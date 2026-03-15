import type { AppSettings } from "@/lib/types";
import { ProxyAgent } from "undici";
import type { Dispatcher } from "undici";

export function createRequestDispatcher(settings: Pick<AppSettings, "proxyEnabled" | "proxyUrl">): Dispatcher | undefined {
  if (!settings.proxyEnabled) {
    return undefined;
  }

  const proxyUrl = settings.proxyUrl.trim();
  if (!proxyUrl) {
    return undefined;
  }

  try {
    const parsed = new URL(proxyUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return new ProxyAgent(parsed.toString());
  } catch {
    return undefined;
  }
}

export async function closeDispatcher(dispatcher?: Dispatcher) {
  if (!dispatcher) {
    return;
  }

  try {
    await dispatcher.close();
  } catch {
    // Ignore close errors.
  }
}
