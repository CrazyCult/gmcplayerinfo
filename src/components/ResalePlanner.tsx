"use client";

import { useMemo } from "react";
import { planTraining, type PlanOptions } from "@/engine/planner";
import { MAX_COACHES } from "@/engine/tables";
import { resaleSteps } from "@/engine/value";
import { money, shortAmount } from "@/lib/format";
import type { Player } from "@/types";

/** Faire progresser pour revendre : coût de chaque palier d’OVR et valeur estimée. */
export default function ResalePlanner({
  player,
  settings,
}: {
  player: Player;
  settings: PlanOptions;
}) {
  // Avec tes réglages ; s'ils ne permettent aucun progrès, avec les coachs
  // et le centre au maximum (pour voir ce que ça rapporterait).
  const { steps, maxed } = useMemo(() => {
    const run = (options: PlanOptions) => {
      const plan = planTraining(player, options);
      return plan.incomplete || plan.from === undefined || !player.value
        ? []
        : resaleSteps(player.value, plan.from, plan.milestones);
    };
    const own = run(settings);
    if (own.length || !player.value) return { steps: own, maxed: false };
    const best = run({ ...settings, coaches: MAX_COACHES, center: 5 });
    return { steps: best, maxed: best.length > 0 };
  }, [player, settings]);
  if (!player.value) return null;
  const best = steps.reduce<number>(
    (top, step, index) =>
      step.net > (steps[top]?.net ?? -Infinity) ? index : top,
    -1,
  );
  return (
    <section className="card">
      <div className="section-head">
        <div>
          <div className="eyebrow">Faire progresser pour revendre</div>
          <h2 style={{ margin: "8px 0 0" }}>Valeur après entraînement</h2>
        </div>
        <span className="pill">
          Aujourd’hui : {player.overall} OVR · {shortAmount(player.value)} GMC2
        </span>
      </div>
      {maxed && (
        <div className="notice">
          Tes coachs actuels ne permettent plus de faire progresser ce joueur :
          tableau calculé avec tous les coachs et le centre au niveau maximum.
        </div>
      )}
      {steps.length === 0 ? (
        <p className="muted">
          Pas de progression possible avec tes coachs actuels, ou sous-attributs
          manquants.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>OVR visé</th>
                <th>Séances</th>
                <th>Coût de l’entraînement</th>
                <th>Valeur estimée</th>
                <th>Gain net</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step, index) => (
                <tr
                  key={step.ovr}
                  className={
                    index === best && step.net > 0 ? "best-row" : undefined
                  }
                >
                  <td>
                    <strong>{step.ovr}</strong>{" "}
                    <small className="muted">
                      (+{step.ovr - player.overall})
                    </small>
                  </td>
                  <td>{step.sessions}</td>
                  <td title={money(step.cost)}>{shortAmount(step.cost)}</td>
                  <td title={money(step.value)}>{shortAmount(step.value)}</td>
                  <td
                    title={money(step.net)}
                    style={{
                      color:
                        step.net >= 0 ? "var(--attr-good)" : "var(--attr-bad)",
                      fontWeight: 700,
                    }}
                  >
                    {step.net >= 0 ? "+" : "−"}
                    {shortAmount(Math.abs(step.net))}
                    {index === best && step.net > 0 && (
                      <small> · meilleur</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
        Gain net = valeur estimée − valeur actuelle − coût de l’entraînement
        (séances réussies, avec les coachs et le centre indiqués). Estimation :
        chaque point d’OVR augmente la valeur du jeu d’environ 11 à 15 % (mesuré
        sur 4 184 joueurs). Le prix réel de revente dépend du marché.
      </p>
    </section>
  );
}
