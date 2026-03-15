import { describe, expect, it } from "vitest";
import { recommendGames } from "@/server/recommendation/service";

describe("recommendGames", () => {
  it("filters excluded tags and returns explainable results", async () => {
    const results = await recommendGames({
      likedTitles: ["Frieren", "Bocchi the Rock!"],
      preferredTags: ["journey", "healing"],
      excludedTags: ["horror"],
      platform: "Steam"
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].rationale.length).toBeGreaterThan(0);
    expect(results.every((item) => !item.genres.includes("horror"))).toBe(true);
  });
});
