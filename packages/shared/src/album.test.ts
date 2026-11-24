import { describe, expect, it } from "vitest";
import { albumMediaInput, createAlbumInput, albumNameInput, chunk } from "./album";

describe("albumNameInput", () => {
  it("rejects empty, whitespace-only and over-long names", () => {
    expect(albumNameInput.safeParse("").success).toBe(false);
    expect(albumNameInput.safeParse("   ").success).toBe(false);
    expect(albumNameInput.safeParse("a".repeat(101)).success).toBe(false);
  });
  it("trims and accepts valid names", () => {
    expect(albumNameInput.parse("  Lisbon 2024 ")).toBe("Lisbon 2024");
    expect(albumNameInput.safeParse("a".repeat(100)).success).toBe(true);
  });
});

describe("albumMediaInput", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `m${i}`);
  it("rejects empty and >200 ids, accepts 200", () => {
    expect(albumMediaInput.safeParse({ mediaIds: [] }).success).toBe(false);
    expect(albumMediaInput.safeParse({ mediaIds: ids(201) }).success).toBe(false);
    expect(albumMediaInput.safeParse({ mediaIds: ids(200) }).success).toBe(true);
  });
});

describe("media id length", () => {
  it("accepts a 36-char UUID and rejects a 65-char id", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(albumMediaInput.safeParse({ mediaIds: [uuid] }).success).toBe(true);
    expect(createAlbumInput.safeParse({ name: "a", mediaIds: [uuid] }).success).toBe(true);
    const long = "a".repeat(65);
    expect(albumMediaInput.safeParse({ mediaIds: [long] }).success).toBe(false);
    expect(createAlbumInput.safeParse({ name: "a", mediaIds: [long] }).success).toBe(false);
  });
});

describe("chunk", () => {
  it("splits into sized chunks", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
