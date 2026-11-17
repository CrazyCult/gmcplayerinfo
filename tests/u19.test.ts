import { expect, test } from "vitest";
import { playerSchema } from "@/schemas/player";
import { publicPlayer } from "../worker.d1.js";

const base = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Aliou Kourouma",
  position: "ST",
  age: 16,
  overall: 98,
  potential: 114,
  attributes: { pac: 99, sho: 99, pas: 90, dri: 98, def: 50, phy: 90 },
};

test("le onze U19 du jeu (u19_lineup) arrive sur la fiche du site", () => {
  expect(playerSchema.parse({ ...base, u19_lineup: true }).u19Lineup).toBe(
    true,
  );
  expect(playerSchema.parse({ ...base, u19_lineup: false }).u19Lineup).toBe(
    false,
  );
  expect(playerSchema.parse(base).u19Lineup).toBeUndefined();
});

test("le serveur laisse passer u19_lineup dans les fiches publiques", () => {
  const out = publicPlayer({
    data: JSON.stringify({ ...base, u19_lineup: true, secret: 1 }),
  });
  expect(out.u19_lineup).toBe(true);
  expect(out.secret).toBeUndefined();
});
