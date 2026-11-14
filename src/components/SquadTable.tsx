"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { compact, money } from "@/lib/format";
import { ovrLevers, planTraining } from "@/engine/planner";
import { cardGain } from "@/engine/positionFit";
import { routeCards, routeLabel } from "@/engine/positionCards";
import { projectValue } from "@/engine/value";
import { MAX_COACHES } from "@/engine/tables";
import { coachSummary, useClubSettings } from "@/lib/trainingSettings";
import { POSITIONS, type Player } from "@/types";
import Rating from "./UI/Rating";
import { signatureLabel } from "@/lib/nationSignature";
import { nextBirthday } from "@/lib/birthday";

const birthdayDate = (t: number) =>
  new Date(t).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Paris",
  });

type SortKey =
  | "name"
  | "position"
  | "age"
  | "birthday"
  | "overall"
  | "potential"
  | "sessions"
  | "cost"
  | "posGain"
  | "plusOneCost"
  | "plusOneNet";

/** Tableau d’effectif : notes, écart au potentiel et plan d’entraînement. */
const POSITION_GROUPS: Record<string, string[]> = {
  Gardiens: ["GK"],
  Défenseurs: ["CB", "LB", "RB", "LWB", "RWB"],
  Milieux: ["CDM", "CM", "CAM", "LM", "RM"],
  Attaquants: ["LW", "RW", "ST", "CF"],
};
const RARITY_ORDER = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "galactico",
] as const;
const RARITY_LABELS: Record<string, string> = {
  common: "Commun",
  uncommon: "Peu commun",
  rare: "Rare",
  epic: "Épique",
  legendary: "Légendaire",
  galactico: "Galactico",
};
/** Tranche « min-max » (bornes incluses), celles du bonus d’entraînement. */
function inAgeBand(age: number, band: string) {
  const [min, max] = band.split("-").map(Number);
  return age >= min && age <= max;
}

/** « emprunté · X · 17.11 » (date de retour), ou « prêté » quand le prêteur est ce club. */
function loanLabel(
  loan: { until: number; lender: string | null } | undefined,
  clubName?: string | null,
) {
  if (!loan) return "en prêt";
  const until = new Date(loan.until).toLocaleDateString("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Zurich",
  });
  const borrowed = loan.lender && loan.lender !== clubName;
  return `${borrowed ? `emprunté · ${loan.lender}` : "prêté"} · ${until}`;
}

export default function SquadTable({
  players,
  hrefPrefix,
  lightIds,
  subtitle,
  action,
  premium = false,
  loans,
  clubName,
  settingsNote,
  lineup,
}: {
  players: Player[];
  /** Début du lien vers la fiche (« /player/ » ou « /player/local: »). */
  hrefPrefix: string;
  lightIds?: string[];
  subtitle?: string;
  action?: ReactNode;
  /** Modules réservés : meilleur poste, +1 OVR le moins cher, revente. */
  premium?: boolean;
  /** Prêts en cours lus dans le jeu par l’extension du manager. */
  loans?: { id: string; until: number; lender: string | null }[];
  /** Nom du club affiché : distingue « emprunté à » de « prêté ». */
  clubName?: string | null;
  /** Sous les réglages du club (origine des niveaux). */
  settingsNote?: ReactNode;
  /** Composition du jeu (le 11 et le banc), lue par l’extension du manager. */
  lineup?: { xi: string[]; bench: string[] } | null;
}) {
  const roleOf = useMemo(() => {
    const map = new Map<string, "xi" | "bench">();
    (lineup?.xi ?? []).forEach((id) => map.set(id, "xi"));
    (lineup?.bench ?? []).forEach((id) => map.set(id, "bench"));
    return map;
  }, [lineup]);
  const [group, setGroup] = useState("");
  const loanOf = useMemo(
    () => new Map((loans ?? []).map((loan) => [loan.id, loan])),
    [loans],
  );
  const light = useMemo(() => new Set(lightIds), [lightIds]);
  // Réglages du club s’ils sont enregistrés, sinon tout au niveau 5.
  const club = useClubSettings();
  const options = useMemo(
    () =>
      club.saved
        ? { coaches: club.coaches, center: club.center }
        : { coaches: MAX_COACHES, center: 5 },
    [club],
  );
  const settingsLabel = club.saved
    ? coachSummary(club)
    : "tous les coachs et le centre au niveau 5";
  const [filter, setFilter] = useState(""),
    [position, setPosition] = useState(""),
    [age, setAge] = useState(""),
    [rarity, setRarity] = useState(""),
    [nation, setNation] = useState(""),
    [status, setStatus] = useState(""),
    [ovrMin, setOvrMin] = useState(""),
    [potMin, setPotMin] = useState("");
  const rarities = useMemo(
    () =>
      RARITY_ORDER.filter((value) =>
        players.some((player) => player.rarity === value),
      ),
    [players],
  );
  const nations = useMemo(
    () =>
      [
        ...new Set(players.map((player) => player.nationality).filter(Boolean)),
      ].sort((a, b) => a!.localeCompare(b!)) as string[],
    [players],
  );
  const filtersOn = Boolean(
    filter ||
    position ||
    age ||
    rarity ||
    nation ||
    status ||
    ovrMin ||
    potMin ||
    group,
  );
  function resetFilters() {
    setFilter("");
    setPosition("");
    setAge("");
    setRarity("");
    setNation("");
    setStatus("");
    setOvrMin("");
    setPotMin("");
    setGroup("");
  }
  const [sort, setSort] = useState<SortKey>("potential"),
    [direction, setDirection] = useState(-1);
  const rows = useMemo(
    () =>
      players.map((player) => {
        // Fiche légère : pas de sous-attributs, donc pas de plan fiable.
        const plan = light.has(player.id)
          ? null
          : planTraining(player, options);
        const ok = plan && !plan.incomplete;
        // Réservé : gain d’OVR en changeant de poste (carte de poste) et
        // +1 OVR le moins cher (coachs niveau 5), avec la plus-value estimée.
        let posGain: number | undefined,
          posBest: string | undefined,
          posCost: number | undefined,
          posPath: string | undefined,
          plusOneCost: number | undefined,
          plusOneSessions: number | undefined,
          plusOneNet: number | undefined;
        if (premium) {
          // Carte de poste : meilleur poste atteignable (cartes enchaînées),
          // gain compté avec l'arrondi le plus prudent (voir cardGain).
          const card = cardGain(player);
          if (card.gain > 0 && card.route) {
            posGain = card.gain;
            posBest = card.best + (card.edge ? " ⚠" : "");
            posCost = card.route.cost;
            posPath = `${routeLabel(card.route)} · ${routeCards(card.route)}`;
          }
          if (!light.has(player.id)) {
            const cheapest = ovrLevers(player, options)
              .filter((l) => l.progresses)
              .sort((a, b) => a.cost - b.cost)[0];
            if (cheapest) {
              plusOneCost = cheapest.cost;
              plusOneSessions = cheapest.sessions;
              if (player.value)
                plusOneNet =
                  projectValue(
                    player.value,
                    player.overall,
                    player.overall + 1,
                  ) -
                  player.value -
                  cheapest.cost;
            }
          }
        }
        const next = nextBirthday(player.lastAgeUp, player.age);
        return {
          ...player,
          birthday: next?.days,
          birthdayAt: next?.at,
          birthdayDrop: next?.drop,
          posGain,
          posBest,
          posCost,
          posPath,
          plusOneCost,
          plusOneSessions,
          plusOneNet,
          sessions: ok ? plan.sessions : undefined,
          cost: ok ? plan.cost : undefined,
          to: plan?.to,
        };
      }),
    [players, light, premium, options],
  );
  const filtered = rows
    .filter(
      (player) =>
        player.name.toLowerCase().includes(filter.toLowerCase()) &&
        (!group ||
          (group === "squad" && roleOf.has(player.id)) ||
          (group === "xi" && roleOf.get(player.id) === "xi") ||
          (group === "bench" && roleOf.get(player.id) === "bench") ||
          (group === "rest" && !roleOf.has(player.id))) &&
        (!position ||
          (POSITION_GROUPS[position]
            ? POSITION_GROUPS[position].includes(player.position)
            : player.position === position)) &&
        (!age || inAgeBand(player.age, age)) &&
        (!rarity || player.rarity === rarity) &&
        (!nation || player.nationality === nation) &&
        (!ovrMin || player.overall >= Number(ovrMin)) &&
        (!potMin || player.potential >= Number(potMin)) &&
        (!status ||
          (status === "progress" && player.overall < player.potential) ||
          (status === "max" && player.overall >= player.potential) ||
          (status === "loan" && (player.onLoan || loanOf.has(player.id))) ||
          (status === "own" && !(player.onLoan || loanOf.has(player.id))) ||
          (status === "birthday" &&
            player.birthday !== undefined &&
            player.birthday <= 7) ||
          (status === "light" && light.has(player.id))),
    )
    .sort((a, b) => {
      const av = a[sort],
        bv = b[sort];
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      return (
        (typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : Number(av) - Number(bv)) * direction
      );
    });
  function order(key: SortKey) {
    if (sort === key) setDirection(-direction);
    else {
      setSort(key);
      setDirection(
        key === "name" ||
          key === "position" ||
          key === "plusOneCost" ||
          key === "birthday"
          ? 1
          : -1,
      );
    }
  }
  const headers: [SortKey, string][] = [
    ["position", "Poste"],
    ["name", "Joueur"],
    ["age", "Âge"],
    ["birthday", "Âge +1"],
    ["overall", "OVR"],
    ["potential", "POT"],
    ["sessions", "Séances → max"],
    ["cost", "Coût → max"],
    ...(premium
      ? ([
          ["posGain", "★ Poste +"],
          ["plusOneCost", "★ +1 OVR le moins cher"],
          ["plusOneNet", "★ Revente +1"],
        ] as [SortKey, string][])
      : []),
  ];
  return (
    <>
      <div className="statline">
        <div>
          <strong>{players.length}</strong>
          <small>Joueurs</small>
        </div>
        <div>
          <strong>
            {Math.round(
              players.reduce((sum, p) => sum + p.overall, 0) / players.length,
            )}
          </strong>
          <small>OVR moyen</small>
        </div>
        <div>
          <strong>
            {Math.round(
              players.reduce((sum, p) => sum + p.age, 0) / players.length,
            )}
          </strong>
          <small>Âge moyen</small>
        </div>
        <div>
          <strong>
            {compact(rows.reduce((sum, p) => sum + (p.cost ?? 0), 0))}
          </strong>
          <small>GMC2 → max</small>
        </div>
      </div>
      <section className="card">
        <div className="section-head">
          <div>
            <h2 style={{ margin: 0 }}>
              Les joueurs <small>({filtered.length})</small>
            </h2>
            <p>
              {subtitle ?? (
                <>
                  Plans calculés avec {settingsLabel}.{" "}
                  <Link href="/compte#reglages" prefetch={false}>
                    {club.saved ? "Modifier" : "Renseigner mes réglages"}
                  </Link>
                </>
              )}
            </p>
            {settingsNote}
          </div>
          {action}
        </div>
        {roleOf.size > 0 && (
          <div
            className="segmented"
            role="group"
            aria-label="Groupe de joueurs"
          >
            {(
              [
                ["", `Tout l’effectif`],
                ["squad", `Le 11 et le banc (${roleOf.size})`],
                ["xi", `Le 11`],
                ["bench", `Le banc`],
                ["rest", `Hors groupe`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={group === value}
                className={group === value ? "active" : undefined}
                onClick={() => setGroup(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="filters squad-filters">
          <input
            placeholder="Filtrer par nom…"
            aria-label="Filtrer par nom"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <select
            aria-label="Filtrer par poste"
            value={position}
            onChange={(event) => setPosition(event.target.value)}
          >
            <option value="">Tous les postes</option>
            <optgroup label="Lignes">
              {Object.keys(POSITION_GROUPS).map((group) => (
                <option key={group}>{group}</option>
              ))}
            </optgroup>
            <optgroup label="Postes">
              {POSITIONS.map((post) => (
                <option key={post}>{post}</option>
              ))}
            </optgroup>
          </select>
          <select
            aria-label="Tranche d’âge"
            value={age}
            onChange={(event) => setAge(event.target.value)}
          >
            <option value="">Tous les âges</option>
            <option value="0-17">17 ans et moins (entraînement ×3)</option>
            <option value="18-24">18 à 24 ans (×2)</option>
            <option value="25-30">25 à 30 ans (×1)</option>
            <option value="31-99">31 ans et plus (ne progresse plus)</option>
          </select>
          <select
            aria-label="Situation"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Toute situation</option>
            <option value="progress">Peut encore progresser</option>
            <option value="max">Au potentiel maximum</option>
            <option value="birthday">Âge +1 dans 7 jours</option>
            <option value="own">Hors prêt</option>
            <option value="loan">En prêt</option>
            {light.size > 0 && <option value="light">Fiches légères</option>}
          </select>
          {rarities.length > 0 && (
            <select
              aria-label="Rareté"
              value={rarity}
              onChange={(event) => setRarity(event.target.value)}
            >
              <option value="">Toute rareté</option>
              {rarities.map((value) => (
                <option key={value} value={value}>
                  {RARITY_LABELS[value]}
                </option>
              ))}
            </select>
          )}
          {nations.length > 1 && (
            <select
              aria-label="Nationalité"
              value={nation}
              onChange={(event) => setNation(event.target.value)}
            >
              <option value="">Tout pays</option>
              {nations.map((value) => (
                <option key={value} value={value}>
                  {value}
                  {signatureLabel(value) ? ` · ${signatureLabel(value)}` : ""}
                </option>
              ))}
            </select>
          )}
          <input
            className="filter-number"
            type="number"
            inputMode="numeric"
            min={1}
            max={130}
            placeholder="OVR min"
            aria-label="OVR minimum"
            value={ovrMin}
            onChange={(event) => setOvrMin(event.target.value)}
          />
          <input
            className="filter-number"
            type="number"
            inputMode="numeric"
            min={1}
            max={130}
            placeholder="POT min"
            aria-label="Potentiel minimum"
            value={potMin}
            onChange={(event) => setPotMin(event.target.value)}
          />
          {filtersOn && (
            <button
              type="button"
              className="button subtle"
              onClick={resetFilters}
            >
              Effacer les filtres
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table className="squad-table">
            <thead>
              <tr>
                {headers.map(([key, label]) => (
                  <th
                    key={key}
                    aria-sort={
                      sort === key
                        ? direction === 1
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button onClick={() => order(key)}>
                      {label}{" "}
                      {sort === key ? (direction === 1 ? "↑" : "↓") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((player) => (
                <tr
                  key={player.id}
                  className={
                    player.onLoan || loanOf.has(player.id)
                      ? "on-loan"
                      : undefined
                  }
                >
                  <td>
                    <span className="pill">{player.position}</span>
                  </td>
                  <td className="name">
                    <Link href={`${hrefPrefix}${player.id}`} prefetch={false}>
                      {player.name}
                    </Link>
                    {roleOf.has(player.id) && (
                      <span
                        className={`lineup-tag ${roleOf.get(player.id)}`}
                        title={
                          roleOf.get(player.id) === "xi"
                            ? "Titulaire dans la composition du jeu"
                            : "Sur le banc dans la composition du jeu"
                        }
                      >
                        {roleOf.get(player.id) === "xi" ? "11" : "banc"}
                      </span>
                    )}
                    {(player.onLoan || loanOf.has(player.id)) && (
                      <span className="loan-tag">
                        {loanLabel(loanOf.get(player.id), clubName)}
                      </span>
                    )}
                    {light.has(player.id) && (
                      <small
                        className="muted"
                        title="Fiche légère : 6 stats seulement, plan indisponible"
                      >
                        {" "}
                        · légère
                      </small>
                    )}
                  </td>
                  <td>{player.age}</td>
                  <td
                    title={
                      player.birthdayAt === undefined
                        ? "Date du dernier anniversaire inconnue (fiche légère ou ancienne lecture)"
                        : `${player.age + 1} ans vers le ${new Date(player.birthdayAt).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} (un +1 tous les 40 jours)`
                    }
                  >
                    {player.birthdayAt === undefined ? (
                      "—"
                    ) : (
                      <>
                        {birthdayDate(player.birthdayAt)}{" "}
                        <small className="muted">· {player.birthday} j</small>
                        {player.birthdayDrop && (
                          <small
                            style={{
                              color: "var(--attr-bad)",
                              fontWeight: 700,
                              display: "block",
                            }}
                            title="Le bonus d’entraînement baisse à cet anniversaire : entraîner avant."
                          >
                            ⚠ ×{player.birthdayDrop[0]} → ×
                            {player.birthdayDrop[1]}
                          </small>
                        )}
                      </>
                    )}
                  </td>
                  <td>
                    <Rating value={player.overall} />
                  </td>
                  <td>
                    <Rating value={player.potential} />
                  </td>
                  <td>
                    {player.sessions ?? "—"} <small>→ {player.to ?? "—"}</small>
                  </td>
                  <td
                    title={
                      player.cost === undefined ? undefined : money(player.cost)
                    }
                  >
                    {player.cost === undefined ? "—" : compact(player.cost)}
                  </td>
                  {premium && (
                    <>
                      <td className="wrap">
                        {player.posGain && player.posGain > 0 ? (
                          <span title={player.posPath}>
                            <strong style={{ color: "var(--attr-good)" }}>
                              {player.posBest} +{player.posGain}
                            </strong>
                            {player.posCost !== undefined && (
                              <small className="muted">
                                {" "}
                                · {compact(player.posCost)}
                              </small>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        className="wrap"
                        title={
                          player.plusOneCost === undefined
                            ? undefined
                            : money(player.plusOneCost)
                        }
                      >
                        {player.plusOneCost === undefined
                          ? "—"
                          : `${compact(player.plusOneCost)} · ${player.plusOneSessions} séance${(player.plusOneSessions ?? 0) > 1 ? "s" : ""}`}
                      </td>
                      <td
                        style={{
                          color:
                            player.plusOneNet === undefined
                              ? undefined
                              : player.plusOneNet >= 0
                                ? "var(--attr-good)"
                                : "var(--attr-bad)",
                          fontWeight: 700,
                        }}
                        title="Valeur estimée à +1 OVR − valeur actuelle − coût de l’entraînement"
                      >
                        {player.plusOneNet === undefined
                          ? "—"
                          : `${player.plusOneNet >= 0 ? "+" : "−"}${compact(Math.abs(player.plusOneNet))}`}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
