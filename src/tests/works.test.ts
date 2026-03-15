import { describe, expect, it } from "vitest";
import { askWork } from "@/server/works/service";

describe("askWork", () => {
  it("finds alias matches for anime", async () => {
    const result = await askWork("葬送的芙莉莲", "ANIME");
    expect(result.status).toBe("found");
    if (result.status !== "found") {
      throw new Error("Expected found result");
    }
    expect(result.match.title).toContain("Frieren");
  });

  it("returns price information for games", async () => {
    const result = await askWork("P5R", "GAME");
    expect(result.status).toBe("found");
    if (result.status !== "found") {
      throw new Error("Expected found result");
    }
    expect(result.match.currentPrice).toBeGreaterThan(0);
  });
});
