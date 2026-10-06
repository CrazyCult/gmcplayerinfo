// Effet des traits en match, d'après le catalogue du jeu (relevé par GMC
// Companion). Quand le jeu ne chiffre pas l'effet, on le dit plutôt que
// d'inventer un nombre.
export const TRAIT_EFFECTS: Record<string, string> = {
  Predator: "+3 % en finition et en face-à-face.",
  "Composed Finisher":
    "+1,5 % en face-à-face et +1 % en finition sous pression.",
  "Clinical Finisher": "Bonus de finition quand il est en position de tir.",
  "Dribble King": "Bonus dans les duels de dribble.",
  Speedster: "Bonus de vitesse, qui s’estompe quand sa forme passe sous 60.",
  Playmaker: "Bonus de vision et de passe en construction et en attaque.",
  "Solid Defender": "Bonus défensif quand l’adversaire a le ballon.",
  "Free Kick Specialist": "+12 sur les coups francs et les frappes lointaines.",
  "Long Shot Taker": "Bonus sur les frappes de plus de 20 m.",
  "Aerial Threat": "+12 au jeu de tête dans la surface adverse.",
  "Pinpoint Crosser": "+8 aux centres.",
  "Long Passer": "+8 en passe longue et en vision.",
  "Wall Pass Master": "+7 en passes courtes et en une-deux.",
  "Finesse Shot": "+8 sur les frappes à 12 m et plus.",
  "Acrobatic Clearance":
    "+7 en défense sur coups de pied arrêtés et dans les duels de tête.",
  "Power Header": "Têtes plus puissantes et plus précises.",
  Leadership:
    "+8 en sang-froid quand l’équipe ne mène pas (pour lui seul, pas un effet de capitaine).",
  "One Club Player":
    "Sang-froid et moral à domicile, encore plus en fin de match et en derby.",
  "Big Game Player": "+5 partout en derby ou après la 75e minute.",
  Workhorse:
    "+4 partout tant que sa forme reste au-dessus de 75 (endurance supérieure à 80 requise).",
  Inconsistent: "±10 partout, tiré au sort avant chaque match.",
  "Set Piece Specialist": "Gros bonus sur coups francs et corners.",
  Acrobat: "Débloque de rares retournés (effet anecdotique).",
  Flair: "Débloque les frappes acrobatiques.",
  Flashy: "Débloque les retournés.",
  Wonderkid: "Marqueur de potentiel, sans effet en match.",
  "Sweeper Keeper":
    "Gardien : +7 en vitesse et jeu au pied quand la ligne défensive est haute.",
  "The Wall": "Trait de gardien (effet non chiffré par le jeu).",
  "Cat-like Reflexes": "Trait de gardien (effet non chiffré par le jeu).",
  "One-on-One Stopper": "Trait de gardien (effet non chiffré par le jeu).",
  "Commanding Presence": "Trait de gardien (effet non chiffré par le jeu).",
};
