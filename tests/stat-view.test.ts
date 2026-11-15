import { expect, test } from "vitest";
import {
  exerciseFor,
  statKind,
  statsOf,
  subKind,
  subsOf,
} from "@/lib/statView";
import type { Player, Position } from "@/types";

const make = (position: Position, overall: number, attrs: object): Player =>
  ({
    id: "p",
    name: "Test",
    position,
    age: 25,
    overall,
    potential: overall,
    attributes: { subs: {}, ...attrs },
    traits: [],
  }) as unknown as Player;

test("stat clé faible ou forte selon l’OVR du joueur, secondaire en gris", () => {
  const cb = make("CB", 100, {
    pac: 90,
    sho: 60,
    pas: 80,
    dri: 75,
    def: 108,
    phy: 101,
    subs: { acceleration: 88, sprintSpeed: 99 },
  });
  expect(statKind(cb, "pac")).toBe("weak");
  expect(statKind(cb, "def")).toBe("strong");
  expect(statKind(cb, "phy")).toBe("key");
  expect(statKind(cb, "sho")).toBe("minor");
  expect(subKind(cb, "pac", "acceleration")).toBe("weak");
  expect(subKind(cb, "pac", "sprintSpeed")).toBe("key");
  expect(subsOf("pac")).toEqual(["acceleration", "sprintSpeed"]);
});

test("un gardien a ses propres stats", () => {
  const gk = make("GK", 100, {
    div: 90,
    han: 100,
    kic: 80,
    ref: 107,
    pos: 100,
    spe: 70,
  });
  expect(statsOf(gk)).toEqual(["div", "han", "kic", "ref", "pos", "spe"]);
  expect(statKind(gk, "div")).toBe("weak");
  expect(statKind(gk, "kic")).toBe("minor");
});

test("exercice du jeu, coach et niveau ; cadenas seulement si les niveaux sont connus", () => {
  const unknown = exerciseFor("CB", "sprintSpeed");
  expect(unknown.name).toBe("Top Speed Training");
  expect(unknown.coaches).toEqual([
    expect.objectContaining({ coach: "physio", level: 2, locked: null }),
  ]);
  const low = exerciseFor("CB", "sprintSpeed", {
    att: 1,
    mid: 1,
    def: 1,
    gk: 1,
    physio: 1,
  });
  expect(low.coaches[0].locked).toBe(true);
  // Un défenseur n’a pas d’entraîneur pour « Attacking Positioning ».
  expect(exerciseFor("CB", "attackingPositioning").coaches).toEqual([]);
});
