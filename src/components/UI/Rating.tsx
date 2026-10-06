import { RARITY_COLOR, rarityOf, tint } from "@/lib/colors";

/** Couleur de texte, fond et contour d'une note, selon la rareté du jeu. */
export function ratingColors(value: number) {
  const rarity = rarityOf(value);
  // Galactico : texte blanc sur dégradé violet → rose, lisible en thème clair
  // comme en thème sombre (évoque la carte cosmique du jeu).
  if (rarity === "galactico")
    return {
      color: "#fff",
      background: "linear-gradient(135deg, #6d28d9, #a21caf 55%, #db2777)",
      outline: "1px solid #c4b5fd",
      textShadow: "0 1px 2px #0006",
    };
  const color = RARITY_COLOR[rarity];
  return {
    color,
    background: tint(color, 12),
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
