"use client";

import { useEffect, useMemo, useState } from "react";
import { get, set } from "idb-keyval";
import { toast } from "sonner";
import type { Player, Subs } from "@/types";
import {
  EXERCISES,
  DEFAULT_COACHES,
  type Coach,
  type CoachLevels,
} from "@/engine/tables";
import { modelOvr } from "@/engine/ovr";
import { planTraining, planVariants } from "@/engine/planner";
import ResalePlanner from "./ResalePlanner";
import {
  exerciseAccess,
  trainSession,
  validateSettings,
  type Session,
} from "@/engine/training";
import { money, number } from "@/lib/format";
import { subLabels } from "@/lib/i18n";

const coachLabels: Record<Coach, string> = {
  att: "Offensif",
  mid: "Milieu",
  def: "Défensif",
  gk: "Gardiens",
  physio: "Physio",
};
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
}: {
  player: Player;
  onChange?: (subs: Subs) => void;
}) {
  const [settings, setSettings] = useState<Settings>({
    coaches: { ...DEFAULT_COACHES },
    center: 1,
    age: player.age,
  });
  const [state, setState] = useState<State>({
    subs: player.attributes.subs,
    sequence: [],
    fitness: player.fitness ?? 100,
  });
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  useEffect(() => {
    let active = true;
    void get<Settings>("gmc-training-settings")
      .then((saved) => {
        if (!saved || !active) return;
        try {
          validateSettings(saved.coaches, saved.center, player.age);
          setSettings({ ...saved, age: player.age });
        } catch {
          /* Réglages invalides : garder les valeurs par défaut. */
        }
      })
      .catch(() => toast.error("Réglages mémorisés inaccessibles."));
    return () => {
      active = false;
    };
  }, [player.age]);
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
  const variants = useMemo(
    () => planVariants(simulated, settings),
    [simulated, settings],
  );
  const totals = state.sequence.reduce(
    (sum, session) => ({
      cost: sum.cost + session.cost,
      expected: sum.expected + session.expectedCost,
    }),
    { cost: 0, expected: 0 },
  );
  function updateSettings(next: Settings) {
    setSettings(next);
    void set("gmc-training-settings", next).catch(() =>
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
      <section className="card">
        <div className="section-head">
          <div>
            <div className="eyebrow">Planifier la progression</div>
            <h2 style={{ margin: "8px 0 0" }}>Simulateur d’entraînement</h2>
          </div>
          <span className="pill">Séances réussies</span>
        </div>
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
              {plan.milestones.map((milestone) => (
                <div className="milestone" key={milestone.ovr}>
                  <strong>{milestone.ovr}</strong>
                  <small>{milestone.sessions} séances</small>
                  <small>{money(milestone.cost)}</small>
                </div>
              ))}
            </div>
            {Object.entries(plan.drills).map(([name, count]) => (
              <div className="drill-row" key={name}>
                <strong>{name}</strong>
                <span className="pill">×{count}</span>
              </div>
            ))}
            {variants.unlocked && (
              <div className="notice">
                Coachs niveau 5 : OVR {variants.unlocked.to} ·{" "}
                {variants.unlocked.sessions} séances ·{" "}
                {money(variants.unlocked.cost)}.
              </div>
            )}
            {variants.afterBirthday && (
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
              {modelOvr(simulated) ?? "—"} · Forme restante {state.fitness}
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
            {EXERCISES.map((exercise) => {
              const access = exerciseAccess(
                player.position,
                exercise.key,
                settings.coaches,
              );
              if (!access.length) return null;
              const result = trainSession(player, exercise.key, {
                ...settings,
                subs: state.subs,
                fitness: state.fitness,
              });
              return (
                <div className="drill-row" key={exercise.key}>
                  <div>
                    <strong>{subLabels[exercise.key]}</strong>
                    <small>
                      {exercise.name} · {state.subs[exercise.key] ?? "—"} /{" "}
                      {player.potential}
                    </small>
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
      </section>
      <ResalePlanner player={player} settings={settings} />
    </>
  );
}
