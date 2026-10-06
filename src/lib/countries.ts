// Pays du joueur en français. Le jeu donne le nom anglais (et parfois le code
// ISO) : on retrouve le code depuis le nom anglais grâce à Intl, puis le nom
// français. Quelques noms du football (nations britanniques…) sont fixés à la main.
const MANUAL: Record<string, string> = {
  England: "Angleterre",
  Scotland: "Écosse",
  Wales: "Pays de Galles",
  "Northern Ireland": "Irlande du Nord",
  "Republic of Ireland": "Irlande",
  USA: "États-Unis",
  "United States": "États-Unis",
  "Ivory Coast": "Côte d’Ivoire",
  "Côte d'Ivoire": "Côte d’Ivoire",
  "Korea Republic": "Corée du Sud",
  "South Korea": "Corée du Sud",
  "North Korea": "Corée du Nord",
  "DR Congo": "RD Congo",
  "Congo DR": "RD Congo",
  Türkiye: "Turquie",
  Turkey: "Turquie",
  "Czech Republic": "Tchéquie",
  Czechia: "Tchéquie",
  Holland: "Pays-Bas",
  Kosovo: "Kosovo",
  "Cape Verde": "Cap-Vert",
  "Bosnia and Herzegovina": "Bosnie-Herzégovine",
  Russia: "Russie",
  Vietnam: "Viêt Nam",
};

let byEnglish: Map<string, string> | null = null;
function englishToCode() {
  if (byEnglish) return byEnglish;
  byEnglish = new Map();
  try {
    const en = new Intl.DisplayNames(["en"], { type: "region" });
    for (let a = 65; a <= 90; a++)
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const name = en.of(code);
        if (name && name !== code) byEnglish.set(name.toLowerCase(), code);
      }
  } catch {
    /* Intl indisponible : on garde les noms d’origine */
  }
  return byEnglish;
}
let fr: Intl.DisplayNames | null = null;
function frenchOf(code: string) {
  try {
    fr ??= new Intl.DisplayNames(["fr"], { type: "region" });
    const name = fr.of(code.toUpperCase());
    return name && name !== code.toUpperCase() ? name : undefined;
  } catch {
    return undefined;
  }
}

/** Nom français du pays, à partir du nom anglais du jeu et/ou du code ISO. */
export function countryFr(name?: string, flagCode?: string) {
  if (name && MANUAL[name]) return MANUAL[name];
  if (flagCode && /^[a-z]{2}$/i.test(flagCode)) {
    const viaCode = frenchOf(flagCode);
    if (viaCode) return viaCode;
  }
  if (name) {
    const code = englishToCode().get(name.toLowerCase());
    const viaName = code ? frenchOf(code) : undefined;
    if (viaName) return viaName;
  }
  return name;
}
