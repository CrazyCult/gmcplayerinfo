import { expect, it } from "vitest";
import { nationSignature, signatureLabel } from "@/lib/nationSignature";

it("gives the game's signature stat for a country", () => {
  // Table du jeu.
  expect(nationSignature("France")).toBe("pace");
  expect(nationSignature("  ITALY ")).toBe("defending");
  expect(nationSignature("Ivory Coast")).toBe("physical");
  // Hors table : empreinte du nom, vérifiée dans le jeu (Vietnam → dribble).
  expect(nationSignature("Vietnam")).toBe("dribbling");
  expect(nationSignature("Slovakia")).toBe("shooting");
  expect(nationSignature("Bosnia and Herzegovina")).toBe("dribbling");
  expect(signatureLabel("Vietnam")).toBe("dribble");
  expect(nationSignature("")).toBeNull();
  expect(nationSignature(undefined)).toBeNull();
});
