import { RARITY_COLOR, rarityOf, tint } from "@/lib/colors";

/** Couleur de texte, fond et contour d'une note, selon la rareté du jeu. */
export function ratingColors(value: number) {
  const rarity = rarityOf(value);
  const color = RARITY_COLOR[rarity];
  return {
    color,
    background:
      rarity === "galactico"
        ? "linear-gradient(135deg, #4c1d95cc, #1e1b4bcc 60%, #831843cc)"
        : tint(color, 12),
    outline: `1px solid ${tint(color, 40)}`,
  };
}
export default function Rating({
  value,
  color,
}: {
  value?: number;
  /** Couleur imposée (ex. part du potentiel pour les attributs). */
  color?: string;
}) {
  const style =
    value === undefined
      ? undefined
      : color
        ? {
            color,
            background: tint(color, 12),
            outline: `1px solid ${tint(color, 40)}`,
          }
        : ratingColors(value);
  return (
    <span className="rating" style={style}>
      {value ?? "—"}
    </span>
  );
}
