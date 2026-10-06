import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSquad, playerSchema } from "../../src/schemas/player";

const squad = JSON.parse(
  readFileSync(
    new URL("../fixtures/squad-sample.json", import.meta.url),
    "utf8",
  ),
);
describe("import réel", () => {
  it.each([squad, { players: squad }, { data: { players: squad } }])(
    "accepte les trois enveloppes JSON",
    (input) => {
      const result = parseSquad(input);
      expect(result.players).toHaveLength(53);
      expect(result.warnings).toEqual([]);
      expect(result.players[0]).toMatchObject({
        name: "Liam Moretti",
        preferredFoot: "right",
        wage: 8550,
        contractEnd: "2031-08-28",
        attributes: { pac: 61, subs: { acceleration: 63, shortPassing: 66 } },
      });
    },
  );
  it("préserve une absence et produit un avertissement", () => {
    const raw = structuredClone(squad[0]);
    delete raw.attributes.acceleration;
    const result = parseSquad([raw]);
    expect(result.players[0].attributes.subs.acceleration).toBeUndefined();
    expect(result.warnings[0].missing).toEqual(["acceleration"]);
  });
  it("normalise une forme numérique ou composée de chaînes", () => {
    expect(playerSchema.parse({ ...squad[0], form: 4.5 }).form).toEqual([4.5]);
    expect(playerSchema.parse({ ...squad[0], form: [7, "6.3"] }).form).toEqual([
      7, 6.3,
    ]);
  });
  it("gère les alias de salaire et de contrat", () => {
    const raw = {
      ...squad[0],
      wage: null,
      salary: 10000,
      contract_end: null,
      contract: { end: "2027-01-01" },
    };
    expect(playerSchema.parse(raw)).toMatchObject({
      wage: 10000,
      contractEnd: "2027-01-01",
    });
  });
  it("refuse un joueur sans identité et les identifiants dupliqués", () => {
    expect(() => parseSquad([{ ...squad[0], id: undefined }])).toThrow();
    expect(() => parseSquad([squad[0], squad[0]])).toThrow("dupliqué");
  });
  it("élimine les données hors modèle, dont contributor et manager", () => {
    const player = playerSchema.parse({
      ...squad[0],
      contributor: "secret",
      manager: "privé",
      install_id: "privé",
    });
    expect(player).not.toHaveProperty("contributor");
    expect(player).not.toHaveProperty("manager");
    expect(player).not.toHaveProperty("install_id");
  });
  it("refuse les sous-attributs invalides au lieu de les convertir en zéro", () => {
    expect(() =>
      parseSquad([
        {
          ...squad[0],
          attributes: { ...squad[0].attributes, acceleration: "oops" },
        },
      ]),
    ).toThrow();
  });
  it("réimporte le modèle normalisé sans perdre les sous-attributs", () => {
    const imported = parseSquad(squad);
    const restored = parseSquad(JSON.parse(JSON.stringify(imported.players)));
    expect(restored).toEqual(imported);
  });
});
