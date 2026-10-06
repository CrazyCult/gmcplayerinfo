import { describe, expect, it } from "vitest";
import { countryFr } from "../src/lib/countries";

describe("pays en français", () => {
  it("traduit depuis le nom anglais, le code ou la liste manuelle", () => {
    expect(countryFr("Argentina")).toBe("Argentine");
    expect(countryFr("Slovakia")).toBe("Slovaquie");
    expect(countryFr("Jamaica")).toBe("Jamaïque");
    expect(countryFr("Spain", "ES")).toBe("Espagne");
    expect(countryFr("England", "GB")).toBe("Angleterre");
    expect(countryFr("Ivory Coast")).toBe("Côte d’Ivoire");
    expect(countryFr("Atlantide")).toBe("Atlantide");
    expect(countryFr(undefined)).toBeUndefined();
  });
});
