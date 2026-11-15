import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import TeamAttributes from "@/components/TeamAttributes";
import type { Player, Position } from "@/types";

const make = (
  i: number,
  position: Position,
  overall: number,
  pac: number,
): Player =>
  ({
    id: `id-${i}`,
    name: `Joueur ${i}`,
    position,
    age: 25,
    overall,
    potential: overall,
    attributes: { pac, sho: 80, pas: 80, dri: 80, def: 80, phy: 80, subs: {} },
    traits: [],
  }) as Player;

test("le 11 : meilleur gardien + 10 joueurs de champ, point faible repéré", () => {
  const positions: Position[] = [
    "GK",
    "LB",
    "CB",
    "CB",
    "RB",
    "CM",
    "CM",
    "CAM",
    "LW",
    "ST",
    "RW",
    "CB",
    "GK",
  ];
  const players = positions.map((pos, i) =>
    make(i, pos, 100 - i, pos === "CB" && i === 3 ? 60 : 100),
  );
  const html = renderToStaticMarkup(
    createElement(TeamAttributes, { players, hrefPrefix: "/player/" }),
  );
  expect(html).toContain("Équipe complète");
  expect(html).toContain("À travailler");
  expect(html).toContain("▼ Vitesse");
  // 11 titulaires seulement : le 12e joueur n'est pas dans le tableau.
  expect(html).not.toContain("Joueur 11");
  // L'exercice du jeu et son entraîneur sont indiqués pour le point faible.
  expect(html).toContain("Top Speed Training");
  expect(html).toContain("Physio");
  expect(html).toContain("https://gamechase.io/gamev2/training");
});
