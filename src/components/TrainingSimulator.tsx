"use client";

import { useMemo, useState } from "react";
import { saveClubSettings, useClubSettings } from "@/lib/trainingSettings";
import { toast } from "sonner";
import type { Player, Subs } from "@/types";
import { EXERCISES, type Coach, type CoachLevels } from "@/engine/tables";
import { familyOf, modelOvr, rawOvrValue } from "@/engine/ovr";
import { planSteps, planTraining, planVariants } from "@/engine/planner";
import ResalePlanner from "./ResalePlanner";
import Fold from "./UI/Fold";
import { exerciseAccess, trainSession, type Session } from "@/engine/training";
import { money, number } from "@/lib/format";
import { subLabels } from "@/lib/i18n";

const coachLabels: Record<Coach, string> = {
  att: "Offensif",
  mid: "Milieu",
  def: "Défensif",
  gk: "Gardiens",
  physio: "Physio",
};
/** OVR avant arrondi (même formule que modelOvr), pour voir les fractions gagnées. */
const exactOvr = (player: Player, subs: Subs) =>
  rawOvrValue(familyOf(player.position), player, subs);
const decimal = (value: number) =>
  value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
interface Settings {
  coaches: CoachLevels;
  center: number;
  age: number;
}
interface State {
  subs: Subs;
  sequence: (Session & { fitnessBefore: number })[];
  fitness: number;
}
export default function TrainingSimulator({
  player,
  onChange,
  open = false,
}: {
  player: Player;
  onChange?: (subs: Subs) => void;
  /** Volet du simulateur déplié d’emblée (page plein écran). */
  open?: boolean;
}) {
  const club = useClubSettings();
  const [activated, setActivated] = useState(open);
  const [age, setAge] = useState(player.age);
  const settings: Settings = useMemo(
    () => ({ coaches: club.coaches, center: club.center, age }),
    [club, age],
  );
  const [state, setState] = useState<State>({
    subs: player.attributes.subs,
    sequence: [],
    fitness: player.fitness ?? 100,
  });
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const simulated = useMemo(
    () => ({
      ...player,
      attributes: { ...player.attributes, subs: state.subs },
    }),
    [player, state.subs],
  );
  const plan = useMemo(
    () => planTraining(simulated, { ...settings, fitness: state.fitness }),
    [simulated, settings, state.fitness],
  );
  const steps = useMemo(() => planSteps(plan.sequence), [plan.sequence]);
  const variants = useMemo(
    () => (activated ? planVariants(simulated, settings) : null),
    [activated, simulated, settings],
  );
  const totals = state.sequence.reduce(
    (sum, session) => ({
      cost: sum.cost + session.cost,
      expected: sum.expected + session.expectedCost,
    }),
    { cost: 0, expected: 0 },
  );
  // Séance par séance : effet de la prochaine séance de chaque exercice sur
  // l'OVR, avec les décimales (une séance fait rarement gagner un point entier).
  const currentExact = exactOvr(player, state.subs);
  // Gain exact (décimales) de chaque séance déjà faite.
  const doneGains: (number | undefined)[] = [];
  {
    let subs = player.attributes.subs,
      prev = exactOvr(player, subs);
    for (const session of state.sequence) {
      subs = { ...subs, [session.key]: session.after };
      const next = exactOvr(player, subs);
      doneGains.push(
        next === undefined || prev === undefined ? undefined : next - prev,
      );
      prev = next;
    }
  }
  const startExact = exactOvr(player, player.attributes.subs);
  const manualRows = EXERCISES.flatMap((exercise) => {
    const access = exerciseAccess(
      player.position,
      exercise.key,
      settings.coaches,
    );
    if (!access.length) return [];
    const result = trainSession(player, exercise.key, {
      ...settings,
      subs: state.subs,
      fitness: state.fitness,
    });
    const after = result ? exactOvr(player, result.subs) : undefined;
    const gain =
      after === undefined || currentExact === undefined
        ? undefined
        : after - currentExact;
    return [{ exercise, access, result, gain }];
  });
  const bestManual = manualRows
    .filter((r) => r.result && r.gain !== undefined && r.gain > 0)
    .sort(
      (a, b) =>
        b.gain! / b.result!.session.cost - a.gain! / a.result!.session.cost,
    )[0]?.exercise.key;
  function updateSettings(next: Settings) {
    setAge(next.age);
    if (next.coaches !== club.coaches || next.center !== club.center)
      void saveClubSettings(next.coaches, next.center).catch(() =>
        toast.error("Impossible de mémoriser les réglages."),
      );
  }
  function update(next: State) {
    setState(next);
    onChange?.(next.subs);
  }
  function add(key: Session["key"]) {
    const result = trainSession(player, key, {
      ...settings,
      subs: state.subs,
      fitness: state.fitness,
    });
    if (!result) return;
    update({
      subs: result.subs,
      sequence: [
        ...state.sequence,
        { ...result.session, fitnessBefore: state.fitness },
      ],
      fitness: state.fitness - 8,
    });
  }
  function undo() {
    const session = state.sequence.at(-1);
    if (!session) return;
    update({
      subs: { ...state.subs, [session.key]: session.before },
      sequence: state.sequence.slice(0, -1),
      fitness: session.fitnessBefore,
    });
  }
  function applyPlan() {
    let fitness = state.fitness;
    const added = plan.sequence.map((session) => {
      if (fitness < 35) fitness = 100;
      const fitnessBefore = fitness;
      fitness -= 8;
      return { ...session, fitnessBefore };
    });
    update({
      subs: plan.subs,
      sequence: [...state.sequence, ...added],
      fitness,
    });
    setMode("manual");
  }
  function exportCsv() {
    const rows = [
      "Séance;Exercice;OVR avant;OVR après;Coût GMC2;Coût attendu GMC2",
      ...plan.sequence.map(
        (s, i) =>
          `${i + 1};${s.name};${s.ovrBefore};${s.ovrAfter};${s.cost};${s.expectedCost.toFixed(2)}`,
      ),
    ];
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + rows.join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `entrainement-${player.id}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <Fold
        open={open}
        onOpen={() => setActivated(true)}
        title="Simulateur d’entraînement"
        summary={
          plan.incomplete || plan.to === undefined
            ? "Sous-attributs manquants"
            : plan.sessions === 0
              ? "Plus de progression possible avec ces coachs"
              : `Jusqu’à ${plan.to} en ${plan.sessions} séances réussies · ${money(plan.cost)}`
        }
      >
        {modelOvr(player) !== player.overall && (
          <div className="notice warning">
            La simulation part de l’OVR calculé (
            {modelOvr(player) ?? "incomplet"}
            ), contre {player.overall} affiché dans le jeu.
          </div>
        )}
        <div className="settings">
          {(Object.keys(coachLabels) as Coach[]).map((coach) => (
            <label key={coach}>
              {coachLabels[coach]}
              <select
                value={settings.coaches[coach]}
                onChange={(event) =>
                  updateSettings({
                    ...settings,
                    coaches: {
                      ...settings.coaches,
                      [coach]: Number(event.target.value),
                    },
                  })
                }
              >
                {[1, 2, 3, 4, 5].map((level) => (
                  <option key={level} value={level}>
                    Niveau {level}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="filters" style={{ marginTop: 14 }}>
          <label>
            <small>Centre </small>
            <select
              aria-label="Centre d’entraînement"
              value={settings.center}
              onChange={(event) =>
                updateSettings({
                  ...settings,
                  center: Number(event.target.value),
                })
              }
            >
              {[1, 2, 3, 4, 5].map((level) => (
                <option key={level} value={level}>
                  Niveau {level}
                </option>
              ))}
            </select>
          </label>
          <label>
            <small>Âge simulé </small>
            <input
              aria-label="Âge simulé"
              type="number"
              min="10"
              max="60"
              value={settings.age}
              onChange={(event) => {
                const age = Number(event.target.value);
                if (age >= 10 && age <= 60)
                  updateSettings({ ...settings, age });
              }}
              style={{ width: 85 }}
            />
          </label>
          <button
            className="button subtle"
            onClick={() =>
              updateSettings({
                ...settings,
                coaches: { att: 5, mid: 5, def: 5, gk: 5, physio: 5 },
              })
            }
          >
            Tous les coachs à 5
          </button>
          <label>
            <small>Forme de départ </small>
            <input
              aria-label="Forme de départ"
              type="number"
              min="0"
              max="100"
              value={state.fitness}
              disabled={state.sequence.length > 0}
              onChange={(event) => {
                const fitness = Number(event.target.value);
                if (fitness >= 0 && fitness <= 100)
                  setState({ ...state, fitness });
              }}
              style={{ width: 85 }}
            />
          </label>
        </div>
        {player.position === "CF" && (
          <div className="notice">
            Un CF n’a accès qu’aux exercices du physio, comme dans le jeu.
          </div>
        )}
        <div className="tabs">
          <button
            className="button"
            aria-pressed={mode === "auto"}
            onClick={() => setMode("auto")}
          >
            Plan automatique
          </button>
          <button
            className="button"
            aria-pressed={mode === "manual"}
            onClick={() => setMode("manual")}
          >
            Séance par séance
          </button>
        </div>
        {mode === "auto" ? (
          <>
            <div className="training-summary">
              <div>
                <small>OVR calculé → atteignable</small>
                <strong>
                  {plan.from ?? "—"}{" "}
                  <span className="link-accent">→ {plan.to ?? "—"}</span>
                </strong>
              </div>
              <div>
                <small>Séances réussies</small>
                <strong>{number(plan.sessions)}</strong>
              </div>
              <div>
                <small>Budget des réussites</small>
                <strong style={{ fontSize: 18 }}>{money(plan.cost)}</strong>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              Coût attendu : {money(plan.expectedCost)} · Forme consommée :{" "}
              {plan.fitness} · {plan.recharges} recharge(s) nécessaire(s). Le
              coût des recharges n’est pas inclus.
            </p>
            {plan.incomplete ? (
              <div className="notice warning">
                Sous-attributs manquants : le plan ne peut pas être calculé.
              </div>
            ) : (
              !plan.sessions && (
                <div className="notice">
                  {plan.from !== undefined && plan.from >= player.potential
                    ? "Le joueur a déjà atteint son potentiel."
                    : "Aucun exercice disponible ne fait progresser l’OVR avec ces coachs."}
                </div>
              )
            )}
            <div className="milestones">
              {plan.milestones.map((milestone, index) => {
                const previous = plan.milestones[index - 1];
                return (
                  <div className="milestone" key={milestone.ovr}>
                    <strong>{milestone.ovr}</strong>
                    <small>{milestone.sessions} séances</small>
                    <small title="Coût de ce point d’OVR">
                      ce point : +
                      {money(milestone.cost - (previous?.cost ?? 0))}
                    </small>
                    <small title="Total investi depuis le début du plan">
                      total : <b>{money(milestone.cost)}</b>
                    </small>
                  </div>
                );
              })}
            </div>
            {plan.sessions > 0 && (
              <details className="plan-order" open={steps.length <= 30}>
                <summary>
                  Ordre des séances · {steps.length} étape
                  {steps.length > 1 ? "s" : ""}
                </summary>
                <p className="muted" style={{ fontSize: 12 }}>
                  À faire dans cet ordre : le prix d’une séance dépend de l’OVR
                  au moment où tu la fais. Total par exercice :{" "}
                  {Object.entries(plan.drills)
                    .map(([name, count]) => `${name} ×${count}`)
                    .join(" · ")}
                  .
                </p>
                <ol>
                  {steps.map((step, index) => (
                    <li key={index}>
                      <div className="plan-step">
                        <span>
                          <strong>{step.name}</strong>{" "}
                          <span className="pill">×{step.count}</span>
                        </span>
                        <span className="muted">
                          OVR {step.ovrBefore}
                          {step.ovrAfter > step.ovrBefore ? (
                            <b className="link-accent"> → {step.ovrAfter}</b>
                          ) : (
                            " (pas encore de point)"
                          )}{" "}
                          · {money(step.cost)} · total {money(step.total)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {variants?.unlocked && (
              <div className="notice">
                Coachs niveau 5 : OVR {variants.unlocked.to} ·{" "}
                {variants.unlocked.sessions} séances ·{" "}
                {money(variants.unlocked.cost)}.
              </div>
            )}
            {variants?.afterBirthday && (
              <div className="notice">
                Après anniversaire ({settings.age + 1} ans) : OVR{" "}
                {variants.afterBirthday.to ?? "—"} ·{" "}
                {variants.afterBirthday.sessions} séances ·{" "}
                {money(variants.afterBirthday.cost)}.
              </div>
            )}
            {plan.sessions > 0 && (
              <div className="player-links">
                <button className="button primary" onClick={applyPlan}>
                  Appliquer le plan
                </button>
                <button className="button" onClick={exportCsv}>
                  Exporter en CSV
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="notice">
              {state.sequence.length} séances · {money(totals.cost)} · Coût
              attendu {money(totals.expected)} · OVR {modelOvr(player) ?? "—"} →{" "}
              {modelOvr(simulated) ?? "—"}
              {startExact !== undefined && currentExact !== undefined
                ? ` (${decimal(startExact)} → ${decimal(currentExact)}, +${decimal(currentExact - startExact)})`
                : ""}{" "}
              · Forme restante {state.fitness}
            </div>
            <div className="player-links">
              <button
                className="button"
                disabled={!state.sequence.length}
                onClick={undo}
              >
                Annuler la dernière séance
              </button>
              <button
                className="button subtle"
                onClick={() =>
                  update({
                    subs: player.attributes.subs,
                    sequence: [],
                    fitness: player.fitness ?? 100,
                  })
                }
              >
                Réinitialiser
              </button>
              {state.fitness < 35 && (
                <button
                  className="button primary"
                  onClick={() => setState({ ...state, fitness: 100 })}
                >
                  Simuler une recharge à 100
                </button>
              )}
            </div>
            {state.sequence.length > 0 && (
              <details className="plan-order">
                <summary>Séances faites · {state.sequence.length}</summary>
                <ol>
                  {state.sequence.map((session, index) => (
                    <li key={index}>
                      <div className="plan-step">
                        <strong>{session.name}</strong>
                        <span className="muted">
                          {session.before} → {session.after} ·{" "}
                          {doneGains[index] !== undefined &&
                            `OVR +${decimal(doneGains[index])} · `}
                          OVR {session.ovrBefore}
                          {session.ovrAfter > session.ovrBefore && (
                            <b className="link-accent"> → {session.ovrAfter}</b>
                          )}{" "}
                          · {money(session.cost)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {manualRows.map(({ exercise, access, result, gain }) => {
              const best = result && exercise.key === bestManual;
              return (
                <div className="drill-row" key={exercise.key}>
                  <div>
                    <strong>
                      {subLabels[exercise.key]}
                      {best && (
                        <span
                          className="link-accent"
                          title="Plus grand gain d’OVR par GMC2 dépensé"
                        >
                          {" "}
                          ★ meilleur rapport
                        </span>
                      )}
                    </strong>
                    <small>
                      {exercise.name} · {state.subs[exercise.key] ?? "—"} /{" "}
                      {player.potential}
                    </small>
                    {result && gain !== undefined && (
                      <small>
                        OVR +{decimal(gain)} par séance
                        {result.session.ovrAfter > result.session.ovrBefore ? (
                          <b className="link-accent">
                            {" "}
                            → passe à {result.session.ovrAfter}
                          </b>
                        ) : (
                          ` (${decimal(currentExact ?? 0)} → ${decimal((currentExact ?? 0) + gain)})`
                        )}
                      </small>
                    )}
                    <small>
                      {access
                        .map(
                          (a) =>
                            `${coachLabels[a.coach]} ${a.level}${a.available ? "" : " · verrouillé"}`,
                        )
                        .join(" / ")}
                    </small>
                  </div>
                  <button
                    className="button"
                    disabled={!result}
                    onClick={() => add(exercise.key)}
                  >
                    +1 séance {result ? `· ${money(result.session.cost)}` : ""}
                  </button>
                </div>
              );
            })}
          </>
        )}
      </Fold>
      <ResalePlanner player={player} settings={settings} />
    </>
  );
}
