"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { statLabels, subLabels } from "@/lib/i18n";
import {
  FIELD_SUBS,
  GK_SUBS,
  type FieldStat,
  type GkStat,
  type Player,
} from "@/types";

/**
 * L’équipe entière avec tous ses attributs : le 11 (ou le 16), les 6 stats de
 * chaque joueur, les sous-attributs en option, et les points faibles repérés.
 * Une stat « clé » du poste est faible quand elle passe sous le niveau moyen
 * du 11 moins WEAK_GAP, forte quand elle le dépasse de STRONG_GAP.
 */
const WEAK_GAP = 6;
const STRONG_GAP = 6;
const FIELD: FieldStat[] = ["pac", "sho", "pas", "dri", "def", "phy"];
const GK: GkStat[] = ["div", "han", "kic", "ref", "pos", "spe"];
const SHORT: Record<string, string> = {
  pac: "PAC",
  sho: "SHO",
  pas: "PAS",
  dri: "DRI",
  def: "DEF",
  phy: "PHY",
  div: "DIV",
  han: "HAN",
  kic: "KIC",
  ref: "REF",
  pos: "POS",
  spe: "SPE",
};
const ORDER = [
  "GK",
  "LB",
  "LWB",
  "CB",
  "RB",
  "RWB",
  "CDM",
  "LM",
  "CM",
  "RM",
  "CAM",
  "LW",
  "CF",
  "ST",
  "RW",
];
const LINE: Record<string, string> = {
  LB: "Défense",
  LWB: "Défense",
  CB: "Défense",
  RB: "Défense",
  RWB: "Défense",
  CDM: "Milieu",
  LM: "Milieu",
  CM: "Milieu",
  RM: "Milieu",
  CAM: "Milieu",
  LW: "Attaque",
  RW: "Attaque",
  CF: "Attaque",
  ST: "Attaque",
};
/** Les stats qui comptent pour chaque poste (les autres sont en gris). */
const KEY: Record<string, FieldStat[]> = {
  LB: ["pac", "def", "pas"],
  RB: ["pac", "def", "pas"],
  LWB: ["pac", "def", "pas"],
  RWB: ["pac", "def", "pas"],
  CB: ["def", "phy", "pac"],
  CDM: ["def", "pas", "phy"],
  CM: ["pas", "dri", "def"],
  LM: ["pac", "dri", "pas"],
  RM: ["pac", "dri", "pas"],
  CAM: ["pas", "dri", "sho"],
  LW: ["pac", "dri", "sho"],
  RW: ["pac", "dri", "sho"],
  CF: ["sho", "dri", "pac"],
  ST: ["sho", "pac", "phy"],
};
const LINES: { name: string; stats: FieldStat[] }[] = [
  { name: "Défense", stats: ["pac", "def", "phy"] },
  { name: "Milieu", stats: ["pas", "dri", "def"] },
  { name: "Attaque", stats: ["sho", "pac", "dri"] },
];
const rank = (p: Player) => {
  const i = ORDER.indexOf(p.position);
  return i < 0 ? ORDER.length : i;
};
const byPosition = (a: Player, b: Player) =>
  rank(a) - rank(b) || b.overall - a.overall;
const byOverall = (a: Player, b: Player) => b.overall - a.overall;

type Kind = "weak" | "strong" | "key" | "minor";
const cls = (kind: Kind) => `ta-cell ${kind}`;

function pick(
  players: Player[],
  lineup?: { xi: string[]; bench: string[] } | null,
) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const fromGame = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((p): p is Player => Boolean(p));
  const gameXi = fromGame(lineup?.xi ?? []);
  if (gameXi.length >= 11) {
    const used = new Set(gameXi.map((p) => p.id));
    const gameBench = fromGame(lineup?.bench ?? []).filter(
      (p) => !used.has(p.id),
    );
    return { xi: gameXi, bench: gameBench, source: "game" as const };
  }
  // Sinon : le meilleur gardien et les 10 meilleurs joueurs de champ.
  const sorted = [...players].sort(byOverall);
  const keeper = sorted.find((p) => p.position === "GK");
  const field = sorted.filter((p) => p.position !== "GK");
  const xi = [...(keeper ? [keeper] : []), ...field.slice(0, keeper ? 10 : 11)];
  const used = new Set(xi.map((p) => p.id));
  const rest = sorted.filter((p) => !used.has(p.id));
  const benchKeeper = rest.find((p) => p.position === "GK");
  const benchField = rest.filter((p) => p.position !== "GK").slice(0, 4);
  return {
    xi,
    bench: [...(benchKeeper ? [benchKeeper] : []), ...benchField],
    source: "best" as const,
  };
}

export default function TeamAttributes({
  players,
  lineup,
  lightIds,
  hrefPrefix,
}: {
  players: Player[];
  lineup?: { xi: string[]; bench: string[] } | null;
  lightIds?: string[];
  hrefPrefix: string;
}) {
  const [full, setFull] = useState(false);
  const [subs, setSubs] = useState(false);
  const light = useMemo(() => new Set(lightIds ?? []), [lightIds]);
  const team = useMemo(() => pick(players, lineup), [players, lineup]);

  const xiField = team.xi.filter((p) => p.position !== "GK");
  const level = xiField.length
    ? Math.round(xiField.reduce((s, p) => s + p.overall, 0) / xiField.length)
    : 0;
  const weakBelow = level - WEAK_GAP;
  const strongFrom = level + STRONG_GAP;

  const kindOf = (player: Player, stat: FieldStat): Kind => {
    const keys = KEY[player.position];
    const value = player.attributes[stat];
    if (!keys?.includes(stat) || value == null) return "minor";
    return value < weakBelow ? "weak" : value >= strongFrom ? "strong" : "key";
  };

  // Moyennes par ligne (11 titulaires) et points faibles regroupés.
  const lines = LINES.map(({ name, stats }) => {
    const group = xiField.filter((p) => LINE[p.position] === name);
    const avgs = stats.map((stat) => {
      const values = group
        .map((p) => p.attributes[stat])
        .filter((v): v is number => v != null);
      return values.length
        ? Math.round(values.reduce((s, v) => s + v, 0) / values.length)
        : null;
    });
    const known = avgs.filter((v): v is number => v != null);
    return {
      name,
      stats,
      avgs,
      low: known.length ? Math.min(...known) : null,
      count: group.length,
    };
  }).filter((line) => line.count > 0);

  const weak = (() => {
    const groups = new Map<string, { who: string; gap: number }[]>();
    for (const p of xiField) {
      for (const stat of KEY[p.position] ?? []) {
        const value = p.attributes[stat];
        if (value == null || value >= weakBelow) continue;
        const key = `${LINE[p.position]} · ${statLabels[stat].toLowerCase()}`;
        groups.set(key, [
          ...(groups.get(key) ?? []),
          { who: `${p.name} ${value}`, gap: weakBelow - value },
        ]);
      }
    }
    return [...groups.entries()]
      .map(([what, list]) => ({
        what,
        who: list
          .sort((a, b) => b.gap - a.gap)
          .map((x) => x.who)
          .join(" · "),
        gap: Math.max(...list.map((x) => x.gap)),
      }))
      .sort((a, b) => b.gap - a.gap);
  })();

  const shown = (full ? [...team.xi, ...team.bench] : team.xi).slice();
  const benchIds = new Set(team.bench.map((p) => p.id));
  const field = shown
    .filter((p) => p.position !== "GK")
    .sort((a, b) => {
      const ba = benchIds.has(a.id) ? 1 : 0,
        bb = benchIds.has(b.id) ? 1 : 0;
      return ba - bb || byPosition(a, b);
    });
  const keepers = shown
    .filter((p) => p.position === "GK")
    .sort((a, b) => {
      const ba = benchIds.has(a.id) ? 1 : 0,
        bb = benchIds.has(b.id) ? 1 : 0;
      return ba - bb || b.overall - a.overall;
    });
  if (!team.xi.length) return null;

  const value = (n: number | undefined) => (n == null ? "–" : n);
  const meta = (p: Player) =>
    `${benchIds.has(p.id) ? "Banc" : "Titulaire"} · ${p.age} ans${light.has(p.id) ? " · fiche légère" : ""}`;

  return (
    <section className="card team-attrs" aria-label="Équipe complète">
      <div className="section-head" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Équipe complète · points faibles</h2>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {team.source === "game"
              ? "Le 11 et le banc de la composition du jeu."
              : "Les 11 meilleurs (1 gardien et 10 joueurs de champ), composition du jeu inconnue."}{" "}
            Niveau du 11 : {level}. Stat clé faible : sous {weakBelow}.
          </p>
        </div>
        <div className="ta-controls">
          <div className="ta-switch" role="group" aria-label="Effectif affiché">
            <button
              type="button"
              aria-pressed={!full}
              onClick={() => setFull(false)}
            >
              Le 11
            </button>
            <button
              type="button"
              aria-pressed={full}
              onClick={() => setFull(true)}
              disabled={!team.bench.length}
            >
              Le 16
            </button>
          </div>
          <button
            type="button"
            className="button subtle"
            aria-pressed={subs}
            onClick={() => setSubs(!subs)}
          >
            Sous-attributs : {subs ? "affichés" : "masqués"}
          </button>
        </div>
      </div>

      <div className="ta-lines">
        {lines.map((line) => (
          <div className="ta-line" key={line.name}>
            <div className="ta-line-head">
              <strong>{line.name}</strong>
              <small className="muted">{line.count} joueurs</small>
            </div>
            <div className="ta-line-stats">
              {line.stats.map((stat, i) => {
                const low = line.avgs[i] != null && line.avgs[i] === line.low;
                return (
                  <div className={low ? "ta-stat low" : "ta-stat"} key={stat}>
                    <small>{statLabels[stat]}</small>
                    <b>{line.avgs[i] ?? "–"}</b>
                    <small>{low ? "▼ le plus bas" : " "}</small>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="ta-weak">
        <strong>
          {weak.length
            ? `Points faibles repérés (${weak.length})`
            : "Aucun point faible repéré dans ce 11."}
        </strong>
        {weak.map((w) => (
          <p key={w.what}>
            <span>▼ {w.what}</span> {w.who}
          </p>
        ))}
      </div>

      <p className="muted ta-legend">
        ▼ point faible du poste · bleu : point fort · gris : stat secondaire
        pour ce poste
      </p>
      <div className="table-wrap">
        <table className="ta-table">
          <thead>
            <tr>
              <th>Joueur</th>
              <th>Poste</th>
              <th>OVR</th>
              {FIELD.map((stat) => (
                <th key={stat} title={statLabels[stat]}>
                  {SHORT[stat]}
                </th>
              ))}
              {subs &&
                FIELD_SUBS.map((sub) => (
                  <th key={sub} className="ta-sub">
                    {subLabels[sub]}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {field.map((p) => (
              <tr key={p.id} className={benchIds.has(p.id) ? "ta-bench" : ""}>
                <td className="name">
                  <Link
                    href={`${hrefPrefix}${encodeURIComponent(p.id)}`}
                    prefetch={false}
                  >
                    {p.name}
                  </Link>
                  <small className="muted"> {meta(p)}</small>
                </td>
                <td>{p.position}</td>
                <td>
                  <b>{p.overall}</b>
                </td>
                {FIELD.map((stat) => {
                  const kind = kindOf(p, stat);
                  return (
                    <td key={stat} className={cls(kind)}>
                      {kind === "weak" ? "▼ " : ""}
                      {value(p.attributes[stat])}
                    </td>
                  );
                })}
                {subs &&
                  FIELD_SUBS.map((sub) => (
                    <td key={sub} className="ta-cell minor">
                      {value(p.attributes.subs?.[sub])}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {keepers.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="ta-table">
            <thead>
              <tr>
                <th>Gardien</th>
                <th>Poste</th>
                <th>OVR</th>
                {GK.map((stat) => (
                  <th key={stat} title={statLabels[stat]}>
                    {SHORT[stat]}
                  </th>
                ))}
                {subs &&
                  GK_SUBS.map((sub) => (
                    <th key={sub} className="ta-sub">
                      {subLabels[sub]}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {keepers.map((p) => (
                <tr key={p.id} className={benchIds.has(p.id) ? "ta-bench" : ""}>
                  <td className="name">
                    <Link
                      href={`${hrefPrefix}${encodeURIComponent(p.id)}`}
                      prefetch={false}
                    >
                      {p.name}
                    </Link>
                    <small className="muted"> {meta(p)}</small>
                  </td>
                  <td>GK</td>
                  <td>
                    <b>{p.overall}</b>
                  </td>
                  {GK.map((stat) => {
                    const v = p.attributes[stat];
                    const kind: Kind =
                      v == null
                        ? "minor"
                        : v < weakBelow
                          ? "weak"
                          : v >= strongFrom
                            ? "strong"
                            : "key";
                    return (
                      <td key={stat} className={cls(kind)}>
                        {kind === "weak" ? "▼ " : ""}
                        {value(v)}
                      </td>
                    );
                  })}
                  {subs &&
                    GK_SUBS.map((sub) => (
                      <td key={sub} className="ta-cell minor">
                        {value(p.attributes.subs?.[sub])}
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {subs && (
        <p className="muted ta-legend">
          Un « – » veut dire que la fiche complète du joueur n’a pas encore été
          lue : ses sous-attributs ne sont pas connus.
        </p>
      )}
    </section>
  );
}
