import { describe, expect, it, vi, afterEach } from "vitest";
import { runInNewContext } from "node:vm";
import {
  APPEARANCE_BOOTSTRAP,
  appearanceStorage,
  isAppearance,
  resolveAppearance,
} from "../src/lib/appearance";
import {
  applyAppearance,
  appearanceRevision,
  currentAppearance,
} from "../src/lib/appearance-store";
afterEach(() => vi.unstubAllGlobals());
describe("three appearances", () => {
  it.each([
    [null, null, true, "light"],
    [null, null, false, "dark"],
    ["light", null, false, "light"],
    ["dark", null, true, "dark"],
    ["light", "manga", true, "manga"],
    ["dark", "manga", false, "manga"],
    ["invalid", "invalid", false, "dark"],
  ])("resolves saved and system choices", (theme, skin, system, result) => {
    expect(
      resolveAppearance(
        theme as string | null,
        skin as string | null,
        system as boolean,
      ),
    ).toBe(result);
  });
  it("preserves the last classic theme when selecting manga", () => {
    expect(appearanceStorage("manga")).toEqual({ "gmc-skin": "manga" });
    expect(appearanceStorage("light")).toEqual({
      "gmc-skin": "classic",
      "gmc-theme": "light",
    });
  });
  it.each(["light", "dark", "manga"])("validates %s", (value) =>
    expect(isAppearance(value)).toBe(true),
  );
  it.each(["classic", "evil", null, {}, 1])("rejects invalid values", (value) =>
    expect(isAppearance(value)).toBe(false),
  );
  it.each(["light", "dark"])("sets manga before paint over %s", (theme) => {
    const document = {
      documentElement: { dataset: {} as Record<string, string> },
    };
    runInNewContext(APPEARANCE_BOOTSTRAP, {
      document,
      localStorage: {
        getItem: (k: string) => (k === "gmc-skin" ? "manga" : theme),
      },
    });
    expect(document.documentElement.dataset).toEqual({
      skin: "manga",
      theme: "dark",
    });
  });
  it("bootstrap tolerates disabled storage", () => {
    const document = {
      documentElement: { dataset: {} as Record<string, string> },
    };
    expect(() =>
      runInNewContext(APPEARANCE_BOOTSTRAP, {
        document,
        localStorage: {
          getItem: () => {
            throw Error("disabled");
          },
        },
      }),
    ).not.toThrow();
    expect(document.documentElement.dataset.skin).toBe("classic");
  });
  it("switches without storage and tracks interaction for pending account reads", () => {
    const dataset: Record<string, string> = { theme: "light", skin: "classic" };
    vi.stubGlobal("document", { documentElement: { dataset } });
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn(),
      matchMedia: () => ({ matches: true }),
    });
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw Error("disabled");
      },
    });
    const before = appearanceRevision();
    applyAppearance("manga");
    expect(currentAppearance()).toBe("manga");
    expect(appearanceRevision()).toBe(before + 1);
    applyAppearance("dark", false);
    expect(appearanceRevision()).toBe(before + 1);
    expect(currentAppearance()).toBe("dark");
  });
});
