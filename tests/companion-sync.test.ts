import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { requestCompanionSquad } from "@/lib/companion-sync";

let receive: (event: unknown) => void;
let request: { channel: string; requestId: string };
const page = {
  location: { origin: "https://gmcplayerinfo.vercel.app" },
  addEventListener: vi.fn((_type, fn) => {
    receive = fn;
  }),
  removeEventListener: vi.fn(),
  postMessage: vi.fn((message) => {
    request = message;
  }),
};
function response(
  data: object,
  origin = page.location.origin,
  source: unknown = page,
) {
  receive({ origin, source, data: { ...request, ...data } });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", page);
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("returns only the matching response from the current page and removes its listener", async () => {
  const result = requestCompanionSquad();
  response({ type: "result", ok: true, payload: "bad" }, "https://evil.test");
  response({ type: "result", requestId: "wrong", ok: true, payload: "bad" });
  response(
    { type: "result", ok: true, payload: "bad" },
    page.location.origin,
    {},
  );
  response({ type: "ack" });
  response({ type: "result", ok: true, payload: { players: ["fresh"] } });
  expect(await result).toEqual({ players: ["fresh"] });
  expect(page.removeEventListener).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it("explains missing extension rather than leaving an inert button", async () => {
  const result = expect(requestCompanionSquad()).rejects.toThrow(
    /2.38.7 requis/,
  );
  await vi.advanceTimersByTimeAsync(2000);
  await result;
  expect(vi.getTimerCount()).toBe(0);
});
it("acknowledgement waits for data, then times out and clears the listener", async () => {
  const result = expect(requestCompanionSquad()).rejects.toThrow(/expiré/);
  response({ type: "ack" });
  await vi.advanceTimersByTimeAsync(100000);
  await result;
  expect(page.removeEventListener).toHaveBeenCalled();
});
it("preserves the extension's actionable failure message", async () => {
  const result = expect(requestCompanionSquad()).rejects.toThrow(
    "Active le module",
  );
  response({ type: "result", ok: false, error: "Active le module" });
  await result;
});
