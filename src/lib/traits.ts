// Traits des joueurs, d'après la page « Traits des joueurs » du jeu
// (description et effet réel lu par le moteur), traduits en français.
export type TraitTier = "S" | "A" | "B" | "-";
export interface TraitInfo {
  tier: TraitTier;
  /** Qui peut l'avoir : tout joueur, joueur de champ ou gardien. */
  scope: "Tous" | "Joueur de champ" | "Gardien";
  summary: string;
  effect: string;
}
export const TRAIT_TIER_LABEL: Record<TraitTier, string> = {
  S: "S · Majeur",
  A: "A · Fort",
  B: "B · Situationnel",
  "-": "Défaut",
};

export const TRAITS: Record<string, TraitInfo> = {
  "Big Game Player": {
    tier: "S",
    scope: "Tous",
    summary: "Se transcende quand ça compte : derbys et fins de match.",
    effect: "+5 à toutes les stats en derby ou après la 75e minute.",
  },
  Predator: {
    tier: "S",
    scope: "Joueur de champ",
    summary: "Renard des surfaces, à l’affût des rebonds et demi-occasions.",
    effect: "+3 % en finition dans les phases de finition et de face-à-face.",
  },
  "Composed Finisher": {
    tier: "S",
    scope: "Joueur de champ",
    summary: "Nerfs d’acier devant le but sous pression.",
    effect:
      "+1,5 % en face-à-face ; +1 % en finition quand la pression est d’au moins 60.",
  },
  Wonderkid: {
    tier: "A",
    scope: "Tous",
    summary: "Un talent générationnel avec une grosse marge de progression.",
    effect:
      "Marqueur de recrutement : signale un potentiel de progression exceptionnel (pas d’effet en match).",
  },
  "Dribble King": {
    tier: "A",
    scope: "Joueur de champ",
    summary: "Élimine en un contre un grâce à son contrôle serré.",
    effect:
      "Bonus progressif en dribble, contrôle de balle et sang-froid dans les duels de dribble.",
  },
  "Clinical Finisher": {
    tier: "A",
    scope: "Joueur de champ",
    summary: "Convertit les occasions quand le ballon arrive.",
    effect: "Bonus de finition pendant les phases de finition.",
  },
  Speedster: {
    tier: "A",
    scope: "Joueur de champ",
    summary: "Laisse tout le monde sur place dans les espaces.",
    effect: "Bonus de vitesse, qui s’estompe quand sa forme passe sous 60.",
  },
  Playmaker: {
    tier: "A",
    scope: "Joueur de champ",
    summary: "Donne le tempo et trouve les passes entre les lignes.",
    effect: "Bonus de vision et de passe en construction et en attaque.",
  },
  "Solid Defender": {
    tier: "A",
    scope: "Joueur de champ",
    summary: "Lit le jeu, gagne ses tacles, éteint les attaques.",
    effect:
      "Bonus en tacle, lecture du jeu et force quand l’adversaire a le ballon.",
  },
  "Free Kick Specialist": {
    tier: "A",
    scope: "Joueur de champ",
    summary:
      "Magicien des coups de pied arrêtés : un coup franc direct vaut un demi-but.",
    effect:
      "+12 en précision, effet et puissance des coups francs sur coups de pied arrêtés et frappes lointaines.",
  },
  "The Wall": {
    tier: "A",
    scope: "Gardien",
    summary: "Un mur sur les tirs de près.",
    effect:
      "+10 en prise de balle et force sur les tirs à moins de 16 m (se déclenche 70 % du temps).",
  },
  "Cat-like Reflexes": {
    tier: "A",
    scope: "Gardien",
    summary: "Des arrêts réflexes qui défient la logique.",
    effect:
      "+8 en réflexes et réactions sur les tirs (se déclenche 75 % du temps).",
  },
  "One-on-One Stopper": {
    tier: "A",
    scope: "Gardien",
    summary: "Gagne les duels face à l’attaquant lancé.",
    effect:
      "+10 en placement et sang-froid en face-à-face (se déclenche 80 % du temps).",
  },
  "Long Shot Taker": {
    tier: "B",
    scope: "Joueur de champ",
    summary: "Déclenche de loin.",
    effect:
      "Bonus de précision et de puissance sur les frappes de plus de 20 m.",
  },
  "Aerial Threat": {
    tier: "B",
    scope: "Joueur de champ",
    summary: "Gagne les ballons aériens dans la surface.",
    effect:
      "+12 au jeu de tête dans la surface sur les têtes (se déclenche 70 % du temps).",
  },
  "Set Piece Specialist": {
    tier: "B",
    scope: "Joueur de champ",
    summary: "Des coups de pied arrêtés redoutables.",
    effect:
      "Gros bonus de précision et d’effet sur les coups francs et corners.",
  },
  "Pinpoint Crosser": {
    tier: "B",
    scope: "Joueur de champ",
    summary:
      "Trouve la tête ou le pied depuis la ligne de fond, à chaque fois.",
    effect:
      "+8 en centre, effet et qualité de service sur les attaques côté et coups de pied arrêtés.",
  },
  "Long Passer": {
    tier: "B",
    scope: "Joueur de champ",
    summary: "Renverse le jeu avec de longues diagonales.",
    effect:
      "+8 en passe longue et vision en construction et sur les passes en profondeur.",
  },
  "Wall Pass Master": {
    tier: "B",
    scope: "Joueur de champ",
    summary: "Des une-deux à travers les défenses les plus serrées.",
    effect:
      "+7 en passe courte, vision et contrôle sur les passes en profondeur et combinaisons au milieu.",
  },
  "Finesse Shot": {
    tier: "B",
    scope: "Joueur de champ",
    summary: "Enroule dans le petit filet opposé, le gardien est battu.",
    effect:
      "+8 en effet, finition et frappes lointaines sur les tirs à 12 m et plus (se déclenche 70 % du temps).",
  },
  "Acrobatic Clearance": {
    tier: "B",
    scope: "Joueur de champ",
    summary:
      "Arrive toujours à toucher le ballon quand c’est la panique dans la surface.",
    effect:
      "+7 en détente, jeu de tête et agilité pour défendre les coups de pied arrêtés et les têtes dans la surface.",
  },
  Flair: {
    tier: "B",
    scope: "Joueur de champ",
    summary: "Tente le geste spectaculaire, et le réussit parfois.",
    effect: "Peut tenter des frappes acrobatiques (volées, retournés).",
  },
  "Power Header": {
    tier: "B",
    scope: "Joueur de champ",
    summary: "Une tête comme un marteau.",
    effect: "Bonus progressif de puissance et de précision sur les têtes.",
  },
  Acrobat: {
    tier: "B",
    scope: "Joueur de champ",
    summary: "Spécialiste du retourné.",
    effect: "Débloque de rares buts en retourné sur les volées et les têtes.",
  },
  Flashy: {
    tier: "B",
    scope: "Joueur de champ",
    summary: "Toujours à la recherche du but de l’année.",
    effect: "Peut tenter des retournés, comme Acrobat et Flair.",
  },
  "Sweeper Keeper": {
    tier: "B",
    scope: "Gardien",
    summary: "Sort loin pour couvrir derrière une ligne haute.",
    effect:
      "+7 en vitesse et jeu au pied du gardien quand la ligne défensive est haute.",
  },
  "Commanding Presence": {
    tier: "B",
    scope: "Gardien",
    summary: "Maître de ses six mètres sur les centres.",
    effect:
      "+8 en prise de balle et détente sur les coups de pied arrêtés dans la surface (se déclenche 70 % du temps).",
  },
  Workhorse: {
    tier: "B",
    scope: "Tous",
    summary: "Continue de courir quand les autres craquent.",
    effect:
      "+4 à toutes les stats tant que sa forme reste au-dessus de 75 (endurance supérieure à 80 requise).",
  },
  Leadership: {
    tier: "B",
    scope: "Tous",
    summary: "Remobilise l’équipe quand le score est défavorable.",
    effect: "+8 en sang-froid quand son équipe ne mène pas.",
  },
  "One Club Player": {
    tier: "B",
    scope: "Tous",
    summary: "Donne tout à domicile.",
    effect:
      "Bonus de sang-froid et de moral à domicile, encore plus en fin de match et en derby.",
  },
  Inconsistent: {
    tier: "-",
    scope: "Tous",
    summary: "Brillant un match, invisible le suivant.",
    effect: "±10 à toutes les stats, tiré à pile ou face avant chaque match.",
  },
};
