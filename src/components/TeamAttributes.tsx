"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { statLabels, subLabels } from "@/lib/i18n";
import { exerciseAccess } from "@/engine/training";
import {
  EXERCISES,
  FIELD_GROUPS,
  GK_GROUPS,
  type Coach,
  type CoachLevels,
} from "@/engine/tables";
import {
  FIELD_SUBS,
  GK_SUBS,
  type FieldStat,
  type GkStat,
  type Player,
  type SubKey,
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

/** Un code couleur par entraîneur du jeu (le nom est toujours écrit à côté). */
const COACH: Record<Coach, { label: string; color: string }> = {
  att: { label: "Attaque", color: "#ff8a5b" },
  mid: { label: "Milieu", color: "#4ade80" },
  def: { label: "Défense", color: "#38bdf8" },
  gk: { label: "Gardien", color: "#facc15" },
  physio: { label: "Physio", color: "#c084fc" },
};
/** Page Entraînement du jeu, avec le joueur et l’exercice en paramètres. */
const trainingUrl = (playerId: string, sub?: SubKey) =>
  `https://gamechase.io/gamev2/training?playerId=${encodeURIComponent(playerId)}${sub ? `&drill=${sub}` : ""}`;
const EXERCISE_NAME = new Map(EXERCISES.map((e) => [e.key, e.name]));
const PARENT = new Map<SubKey, string>();
for (const [stat, subs] of Object.entries({ ...FIELD_GROUPS, ...GK_GROUPS }))
  for (const sub of subs) PARENT.set(sub, stat);
const COACH_ORDER: Coach[] = ["att", "mid", "def", "gk", "physio"];
const FULL: CoachLevels = { att: 5, mid: 5, def: 5, gk: 5, physio: 5 };
/** Entraîneurs qui font travailler ce sous-attribut (tous postes confondus). */
const coachesOf = (sub: SubKey) =>
  COACH_ORDER.filter((coach) =>
    (["CM", "ST", "CB", "GK"] as const).some((pos) =>
      exerciseAccess(pos, sub, FULL).some((a) => a.coach === coach),
    ),
  );

function CoachChip({
  coach,
  level,
  locked,
}: {
  coach: Coach;
  level: number;
  locked?: boolean;
}) {
  const { label, color } = COACH[coach];
  return (
    <span
      className={locked ? "ta-chip locked" : "ta-chip"}
      style={{ borderColor: color, color }}
      title={locked ? "Entraîneur pas encore à ce niveau" : undefined}
    >
      <i style={{ background: color }} aria-hidden="true" />
      {label} · niv. {level}
      {locked ? " 🔒" : ""}
    </span>
  );
}

export default function TeamAttributes({
  players,
  lineup,
  lightIds,
  hrefPrefix,
  coaches,
}: {
  players: Player[];
  lineup?: { xi: string[]; bench: string[] } | null;
  lightIds?: string[];
  hrefPrefix: string;
  /** Niveaux des entraîneurs du club (connus seulement pour ton club). */
  coaches?: CoachLevels | null;
}) {
  const [full, setFull] = useState(false);
  const [subs, setSubs] = useState(false);
  const light = useMemo(() => new Set(lightIds ?? []), [lightIds]);
  const team = useMemo(() => pick(players, lineup), [players, lineup]);
  if (!team.xi.length) return null;

  const xiField = team.xi.filter((p) => p.position !== "GK");
  const level = xiField.length
    ? Math.round(xiField.reduce((s, p) => s + p.overall, 0) / xiField.length)
    : 0;
  const weakBelow = level - WEAK_GAP;
  const strongFrom = level + STRONG_GAP;
  const benchIds = new Set(team.bench.map((p) => p.id));

  const kindOfValue = (v: number | undefined, isKey: boolean): Kind =>
    v == null || !isKey
      ? "minor"
      : v < weakBelow
        ? "weak"
        : v >= strongFrom
          ? "strong"
          : "key";
  const statKind = (p: Player, stat: FieldStat): Kind =>
    kindOfValue(p.attributes[stat], Boolean(KEY[p.position]?.includes(stat)));

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

  // À travailler : pour chaque joueur du 11, ses stats clés faibles, avec les
  // sous-attributs qui les composent et l’exercice du jeu qui les fait monter.
  const todo = xiField
    .map((p) => {
      const items = (KEY[p.position] ?? []).flatMap((stat) => {
        const value = p.attributes[stat];
        if (value == null || value >= weakBelow) return [];
        const rows = (FIELD_GROUPS[stat] ?? [])
          .map((sub) => {
            const v = p.attributes.subs?.[sub];
            const access = exerciseAccess(
              p.position,
              sub,
              coaches ?? FULL,
            ).sort((a, b) => a.level - b.level);
            return { sub, v, access };
          })
          .sort((a, b) => (a.v ?? 999) - (b.v ?? 999));
        return [{ stat, value, gap: weakBelow - value, rows }];
      });
      return { p, items, gap: Math.max(0, ...items.map((i) => i.gap)) };
    })
    .filter((x) => x.items.length)
    .sort((a, b) => b.gap - a.gap);
  const shownTodo = todo.slice(0, 6);

  const shown = full ? [...team.xi, ...team.bench] : team.xi;
  const order = (a: Player, b: Player, fieldOrder: boolean) =>
    (benchIds.has(a.id) ? 1 : 0) - (benchIds.has(b.id) ? 1 : 0) ||
    (fieldOrder ? byPosition(a, b) : b.overall - a.overall);
  const field = shown
    .filter((p) => p.position !== "GK")
    .sort((a, b) => order(a, b, true));
  const keepers = shown
    .filter((p) => p.position === "GK")
    .sort((a, b) => order(a, b, false));

  const meta = (p: Player) =>
    `${benchIds.has(p.id) ? "Banc" : "Titulaire"} · ${p.age} ans${light.has(p.id) ? " · fiche légère" : ""}`;
  const link = (p: Player) => (
    <Link href={`${hrefPrefix}${encodeURIComponent(p.id)}`} prefetch={false}>
      {p.name}
    </Link>
  );
  const subHeads = (list: readonly SubKey[]) =>
    list.map((sub) => (
      <th
        key={sub}
        className="ta-sub"
        title={EXERCISE_NAME.get(sub) ?? subLabels[sub]}
      >
        {subLabels[sub]}
        <span className="ta-dots" aria-hidden="true">
          {coachesOf(sub).map((c) => (
            <i key={c} style={{ background: COACH[c].color }} />
          ))}
        </span>
      </th>
    ));
  const subCell = (p: Player, sub: SubKey) => {
    const parent = PARENT.get(sub) as FieldStat | undefined;
    const isKey =
      p.position === "GK"
        ? true
        : Boolean(parent && KEY[p.position]?.includes(parent));
    const v = p.attributes.subs?.[sub];
    const kind = kindOfValue(v, isKey);
    return (
      <td key={sub} className={cls(kind === "key" ? "minor" : kind)}>
        {kind === "weak" ? "▼ " : ""}
        {v ?? "–"}
      </td>
    );
  };

  return (
    <section className="card team-attrs" aria-label="Équipe complète">
      <div className="ta-head">
        <div>
          <h2>Équipe complète · points faibles</h2>
          <p className="muted">
            {team.source === "game"
              ? "Le 11 et le banc de la composition du jeu."
              : "Les 11 meilleurs (1 gardien et 10 joueurs de champ) : la composition du jeu n’est pas connue."}
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
          <div className="ta-switch" role="group" aria-label="Sous-attributs">
            <button
              type="button"
              aria-pressed={!subs}
              onClick={() => setSubs(false)}
            >
              Stats
            </button>
            <button
              type="button"
              aria-pressed={subs}
              onClick={() => setSubs(true)}
            >
              + Sous-attributs
            </button>
          </div>
        </div>
      </div>

      <div className="ta-scale">
        <span>
          Niveau du 11 : <b>{level}</b>
        </span>
        <span className="ta-key weak">▼ faible : sous {weakBelow}</span>
        <span className="ta-key strong">fort : {strongFrom} et plus</span>
        <span className="ta-key minor">
          gris : stat secondaire pour le poste
        </span>
      </div>

      <div className="ta-lines">
        {lines.map((line) => (
          <div className="ta-line" key={line.name}>
            <strong>{line.name}</strong>
            {line.stats.map((stat, i) => {
              const v = line.avgs[i];
              const low = v != null && v === line.low;
              return (
                <div className={low ? "ta-avg low" : "ta-avg"} key={stat}>
                  <span>{statLabels[stat]}</span>
                  <b>{v ?? "–"}</b>
                  {low && <em>▼ le plus bas</em>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <h3 className="ta-title">
        À travailler{" "}
        <small className="muted">
          {todo.length
            ? `${todo.length} joueur${todo.length > 1 ? "s" : ""} du 11 · les plus en retard d’abord`
            : ""}
        </small>
      </h3>
      {shownTodo.length ? (
        <>
          <div className="ta-legend-coaches" aria-label="Entraîneurs du jeu">
            {COACH_ORDER.map((c) => (
              <span
                key={c}
                className="ta-chip"
                style={{ borderColor: COACH[c].color, color: COACH[c].color }}
              >
                <i style={{ background: COACH[c].color }} aria-hidden="true" />
                {COACH[c].label}
              </span>
            ))}
            <small className="muted">
              Chaque exercice se fait chez l’entraîneur de cette couleur, au
              niveau indiqué.
            </small>
          </div>
          <div className="ta-todo">
            {shownTodo.map(({ p, items }) => (
              <article className="ta-card" key={p.id}>
                <header>
                  <div>
                    {link(p)} <span className="muted">{p.position}</span>
                  </div>
                  <span className="ta-card-right">
                    <a
                      className="ta-go"
                      href={trainingUrl(p.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ouvrir l’entraînement ↗
                    </a>
                    <b>{p.overall}</b>
                  </span>
                </header>
                {items.map((item) => (
                  <div className="ta-block" key={item.stat}>
                    <div className="ta-block-title">
                      <span>▼ {statLabels[item.stat]}</span>
                      <b>{item.value}</b>
                      <small>
                        il manque {item.gap + 1} pour atteindre {weakBelow}
                      </small>
                    </div>
                    {item.rows.map((row) => (
                      <div className="ta-sub-row" key={row.sub}>
                        <span className="ta-sub-name">
                          {subLabels[row.sub]}
                        </span>
                        <span className="ta-bar" aria-hidden="true">
                          <i
                            style={{
                              width: `${Math.min(100, ((row.v ?? 0) / (level + 10)) * 100)}%`,
                            }}
                          />
                        </span>
                        <b className="ta-sub-val">{row.v ?? "–"}</b>
                        <span className="ta-exo">
                          {row.access.length ? (
                            <a
                              className="ta-go"
                              href={trainingUrl(p.id, row.sub)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Ouvrir cet exercice dans le jeu"
                            >
                              {EXERCISE_NAME.get(row.sub) ?? "—"} ↗
                            </a>
                          ) : (
                            (EXERCISE_NAME.get(row.sub) ?? "—")
                          )}
                          <span className="ta-chips">
                            {row.access.length ? (
                              row.access.map((a) => (
                                <CoachChip
                                  key={a.coach}
                                  coach={a.coach}
                                  level={a.level}
                                  locked={coaches ? !a.available : false}
                                />
                              ))
                            ) : (
                              <small className="muted">
                                pas d’exercice pour ce poste
                              </small>
                            )}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
                {light.has(p.id) && (
                  <small className="muted">
                    Fiche légère : sous-attributs inconnus tant que la fiche
                    complète n’est pas lue.
                  </small>
                )}
              </article>
            ))}
          </div>
          {todo.length > shownTodo.length && (
            <p className="muted ta-more">
              + {todo.length - shownTodo.length} autre
              {todo.length - shownTodo.length > 1 ? "s" : ""} joueur
              {todo.length - shownTodo.length > 1 ? "s" : ""} avec un point
              faible, visibles dans le tableau.
            </p>
          )}
        </>
      ) : (
        <p className="ta-ok">Aucun point faible dans ce 11.</p>
      )}

      <h3 className="ta-title">Toutes les stats</h3>
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
              {subs && subHeads(FIELD_SUBS)}
            </tr>
          </thead>
          <tbody>
            {field.map((p) => (
              <tr key={p.id} className={benchIds.has(p.id) ? "ta-bench" : ""}>
                <td className="name">
                  {link(p)}
                  <small className="muted">{meta(p)}</small>
                </td>
                <td>{p.position}</td>
                <td>
                  <b>{p.overall}</b>
                </td>
                {FIELD.map((stat) => {
                  const kind = statKind(p, stat);
                  return (
                    <td key={stat} className={cls(kind)}>
                      {kind === "weak" ? "▼ " : ""}
                      {p.attributes[stat] ?? "–"}
                    </td>
                  );
                })}
                {subs && FIELD_SUBS.map((sub) => subCell(p, sub))}
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
                {subs && subHeads(GK_SUBS)}
              </tr>
            </thead>
            <tbody>
              {keepers.map((p) => (
                <tr key={p.id} className={benchIds.has(p.id) ? "ta-bench" : ""}>
                  <td className="name">
                    {link(p)}
                    <small className="muted">{meta(p)}</small>
                  </td>
                  <td>GK</td>
                  <td>
                    <b>{p.overall}</b>
                  </td>
                  {GK.map((stat) => {
                    const kind = kindOfValue(p.attributes[stat], true);
                    return (
                      <td key={stat} className={cls(kind)}>
                        {kind === "weak" ? "▼ " : ""}
                        {p.attributes[stat] ?? "–"}
                      </td>
                    );
                  })}
                  {subs && GK_SUBS.map((sub) => subCell(p, sub))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {subs && (
        <p className="muted ta-more">
          Les points de couleur sous chaque sous-attribut montrent les
          entraîneurs qui le font travailler. Un « – » veut dire que la fiche
          complète du joueur n’a pas encore été lue.
        </p>
      )}
    </section>
  );
}
