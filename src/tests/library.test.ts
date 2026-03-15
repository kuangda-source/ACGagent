import { describe, expect, it } from "vitest";
import { parseEpisodeMetadata } from "@/server/library/service";

describe("parseEpisodeMetadata", () => {
  it("extracts title and episode from common anime naming", () => {
    const parsed = parseEpisodeMetadata("[SubsPlease] Sousou no Frieren - 03 (1080p).mkv");
    expect(parsed.detectedTitle.toLowerCase()).toContain("sousou no frieren");
    expect(parsed.episode?.episodeNumber).toBe(3);
  });

  it("keeps season hints when present", () => {
    const parsed = parseEpisodeMetadata("Bocchi_the_Rock_S2_E01.mp4");
    expect(parsed.seasonLabel).toBe("S2");
    expect(parsed.episode?.episodeNumber).toBe(1);
  });
});
