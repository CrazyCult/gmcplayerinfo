import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getClub: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/session", () => ({ accountKey: vi.fn(), getSession: vi.fn() }));
vi.mock("@/data/gmc-index", () => ({
  getClub: mocks.getClub,
  playerTag: (id: string) => `player:${id}`,
  clubTag: (id: string) => `club:${id}`,
  setAccountClub: vi.fn(),
}));
import { refreshSyncedClub } from "@/app/squad/actions";
beforeEach(() => vi.clearAllMocks());
it("verifies the uploaded club and expires cards for starters, bench and reserves", async () => {
  const fetchedAt = Date.now();
  mocks.getClub.mockResolvedValue({
    fetchedAt,
    players: ["xi", "bench", "reserve"].map((id) => ({
      player: { id },
      light: false,
    })),
  });
  await refreshSyncedClub("test-club", fetchedAt);
  expect(mocks.getClub).toHaveBeenCalledWith("test-club", { fresh: true });
  expect(mocks.revalidateTag.mock.calls).toEqual([
    ...["xi", "bench", "reserve"].map((id) => [`player:${id}`, { expire: 0 }]),
    ["club:test-club", { expire: 0 }],
  ]);
});
it("does not claim success or invalidate cards for stale or light snapshots", async () => {
  const fetchedAt = Date.now();
  for (const club of [
    { fetchedAt: fetchedAt - 1, players: [] },
    { fetchedAt, players: [{ player: { id: "a" }, light: true }] },
  ]) {
    mocks.getClub.mockResolvedValue(club);
    await expect(refreshSyncedClub("test-club", fetchedAt)).rejects.toThrow(
      /pas encore reçu/,
    );
  }
  expect(mocks.revalidateTag).not.toHaveBeenCalled();
});
it("rejects invalid or expired requests before consulting the worker", async () => {
  await expect(refreshSyncedClub("../other", Date.now())).rejects.toThrow(
    /non reconnue/,
  );
  await expect(
    refreshSyncedClub("test", Date.now() - 31 * 60_000),
  ).rejects.toThrow(/non reconnue/);
  expect(mocks.getClub).not.toHaveBeenCalled();
});
