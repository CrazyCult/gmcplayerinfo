import type { OvrPoint } from "@/engine/progression";
import { RARITY_COLOR, rarityOf } from "@/lib/colors";

const day = (t: number) =>
  new Date(t).toLocaleDateString("fr-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
  });

/** Courbe de l'historique d'OVR réel (relevé dans le jeu). */
export default function OvrHistory({
  points,
  potential,
}: {
  points: OvrPoint[];
  potential: number;
}) {
  if (points.length < 2)
    return (
      <p className="muted" style={{ fontSize: 13 }}>
        {points.length === 1
          ? `Un seul relevé pour l’instant : OVR ${points[0].overall} le ${day(points[0].t)}.`
          : "Historique pas encore relevé : il arrive avec la prochaine lecture de la fiche par GMC Companion."}
      </p>
    );
  const W = 560,
    H = 170,
    P = 28;
  const values = points.map((p) => p.overall);
  const lo = Math.min(...values) - 2,
    hi = Math.max(Math.max(...values), potential) + 2;
  const t0 = points[0].t,
    t1 = points[points.length - 1].t || t0 + 1;
  const x = (t: number) => P + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
  const y = (v: number) =>
    H - P - ((v - lo) / Math.max(1, hi - lo)) * (H - 2 * P);
  const line = points
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.overall).toFixed(1)}`,
    )
    .join(" ");
  const last = points[points.length - 1];
  const gain = last.overall - points[0].overall;
  return (
    <div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        {points.length} relevés du {day(t0)} au {day(t1)} ·{" "}
        <strong
          style={{
            color:
              gain > 0
                ? "var(--attr-good)"
                : gain < 0
                  ? "var(--attr-bad)"
                  : undefined,
          }}
        >
          {gain > 0 ? "+" : ""}
          {gain} OVR
        </strong>
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{
          width: "100%",
          maxWidth: 640,
          height: "auto",
          display: "block",
        }}
        role="img"
        aria-label="Historique d’OVR"
      >
        <line
          x1={P}
          x2={W - P}
          y1={y(potential)}
          y2={y(potential)}
          stroke="#8ea2bf"
          strokeDasharray="4 4"
          strokeWidth="1"
        />
        <text
          x={W - P}
          y={y(potential) - 5}
          fill="#8ea2bf"
          fontSize="11"
          textAnchor="end"
        >
          POT {potential}
        </text>
        <path
          d={line}
          fill="none"
          stroke="#ff9142"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {points.map((p) => (
          <circle
            key={p.t}
            cx={x(p.t)}
            cy={y(p.overall)}
            r="3.5"
            fill={RARITY_COLOR[rarityOf(p.overall)]}
          />
        ))}
        <text x={P} y={H - 6} fill="#8ea2bf" fontSize="11">
          {day(t0)}
        </text>
        <text x={W - P} y={H - 6} fill="#8ea2bf" fontSize="11" textAnchor="end">
          {day(t1)}
        </text>
        <text
          x={x(last.t)}
          y={y(last.overall) - 9}
          style={{ fill: RARITY_COLOR[rarityOf(last.overall)] }}
          fontSize="13"
          fontWeight="700"
          textAnchor="end"
        >
          {last.overall}
        </text>
      </svg>
    </div>
  );
}
