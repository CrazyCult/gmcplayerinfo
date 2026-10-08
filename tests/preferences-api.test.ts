import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock("@/lib/session", () => ({
  authEnabled: () => true,
  getSession: mocks.getSession,
  accountKey: async (sub: string) => "hashed-" + sub,
}));
vi.mock("@/data/gmc-index", () => ({
  getAccountAppearance: mocks.get,
  setAccountAppearance: mocks.set,
}));
import { GET, PUT } from "../src/app/api/preferences/appearance/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ sub: "account-a" });
  mocks.get.mockResolvedValue("manga");
  mocks.set.mockImplementation(async (_key, value) => value);
});
const req = (body: unknown, origin = "http://localhost:3211") =>
  new Request("http://localhost:3211/api/preferences/appearance", {
    method: "PUT",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
describe("account appearance endpoint", () => {
  it("does not read account preferences anonymously", async () => {
    mocks.getSession.mockResolvedValue(null);
    const r = await GET();
    expect(await r.json()).toEqual({ authenticated: false, appearance: null });
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("reads only the signed session key and prevents shared caching", async () => {
    const r = await GET();
    expect(await r.json()).toEqual({
      authenticated: true,
      appearance: "manga",
    });
    expect(mocks.get).toHaveBeenCalledWith("hashed-account-a");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });
  it("rejects foreign-origin writes", async () => {
    expect(
      (await PUT(req({ appearance: "manga" }, "https://foreign.test"))).status,
    ).toBe(403);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("rejects anonymous writes", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await PUT(req({ appearance: "manga" }))).status).toBe(401);
  });
  it.each(["light", "dark", "manga", null])(
    "saves a valid appearance",
    async (appearance) => {
      expect(
        (await PUT(req({ appearance, accountKey: "some-other-account" })))
          .status,
      ).toBe(200);
      expect(mocks.set).toHaveBeenCalledWith("hashed-account-a", appearance);
    },
  );
  it.each([{}, null, { appearance: "script" }, { appearance: 3 }])(
    "rejects invalid data",
    async (body) => {
      expect((await PUT(req(body))).status).toBe(400);
      expect(mocks.set).not.toHaveBeenCalled();
    },
  );
  it("reports persistence failure instead of pretending it saved", async () => {
    mocks.set.mockRejectedValue(Error("offline"));
    expect((await PUT(req({ appearance: "manga" }))).status).toBe(503);
  });
});
