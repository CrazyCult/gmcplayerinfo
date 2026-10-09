import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getClub } from "@/data/gmc-index";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("GMC_SITE_TOKEN", "fixture");
  vi.stubEnv("GMC_INDEX_URL", "https://index.test");
  fetchMock
    .mockReset()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          teamId: "club",
          name: "Club",
          fetchedAt: Date.now(),
          requestedAt: null,
          players: [],
        }),
      ),
    );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("reuses club data briefly for navigation with an individual club cache tag", async () => {
  await getClub("club");
  expect(fetchMock.mock.calls[0][1]).toMatchObject({
    next: { revalidate: 30, tags: ["club:club"] },
  });
  expect(fetchMock.mock.calls[0][1].cache).toBeUndefined();
});
it("an explicit refresh bypasses the navigation cache", async () => {
  await getClub("club", { fresh: true });
  expect(fetchMock.mock.calls[0][1].cache).toBe("no-store");
  expect(fetchMock.mock.calls[0][1].next).toBeUndefined();
});
