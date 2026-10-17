// src/lib/fuseauHoraire.js
// Agenda — conversions PURES entre heure murale (ce que le médecin déclare :
// « le lundi de 09h00 à 09h30 ») et instant absolu (RendezVous.date_creneau).
//
// Module SANS dépendance (ni Prisma, ni bibliothèque de dates) : s'appuie sur
// Intl, disponible dans Node, et reste testable sans base.
//
// Convention de stockage (inchangée depuis la migration agenda_medecin) :
//   - creneau_agenda.date        : @db.Date, lue en UTC (AAAA-MM-JJ « mural ») ;
//   - horaire.heure_debut / fin  : @db.Time, lue en UTC (HH:mm « mural ») ;
//   - rendez_vous.date_creneau   : instant réel (UTC).
// Le passage de l'un à l'autre se fait dans le fuseau du pays d'exercice du
// médecin (pays.fuseau_horaire), jamais dans le fuseau du serveur.

export const FUSEAU_PAR_DEFAUT = "Africa/Douala";

const MS_PAR_MINUTE = 60 * 1000;

const formateurs = new Map();

function formateur(fuseau) {
  let f = formateurs.get(fuseau);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: fuseau,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formateurs.set(fuseau, f);
  }
  return f;
}

const INDEX_JOUR = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Le fuseau est-il un identifiant IANA reconnu par le moteur ?
 * @param {unknown} fuseau
 * @returns {boolean}
 */
export function estFuseauValide(fuseau) {
  if (typeof fuseau !== "string" || !fuseau.trim()) return false;
  try {
    formateur(fuseau);
    return true;
  } catch {
    return false;
  }
}

/** Fuseau utilisable : celui fourni s'il est valide, sinon FUSEAU_PAR_DEFAUT. */
export function fuseauOuDefaut(fuseau) {
  return estFuseauValide(fuseau) ? fuseau : FUSEAU_PAR_DEFAUT;
}

/**
 * Heure murale, dans `fuseau`, de l'instant donné.
 * @param {Date|string|number} instant
 * @param {string} fuseau
 * @returns {{ annee:number, mois:number, jour:number, heures:number, minutes:number, secondes:number, jourSemaine:number }}
 *   mois de 1 à 12 ; jourSemaine au format Date.getDay() (0 = dimanche).
 */
export function heureMuraleDepuisInstant(instant, fuseau) {
  const d = instant instanceof Date ? instant : new Date(instant);
  const parties = {};
  for (const { type, value } of formateur(fuseau).formatToParts(d)) parties[type] = value;
  return {
    annee: Number(parties.year),
    mois: Number(parties.month),
    jour: Number(parties.day),
    heures: Number(parties.hour),
    minutes: Number(parties.minute),
    secondes: Number(parties.second),
    jourSemaine: INDEX_JOUR[parties.weekday],
  };
}

/** Décalage (minutes) du fuseau par rapport à UTC à l'instant donné. */
function decalageMinutes(instantMs, fuseau) {
  const m = heureMuraleDepuisInstant(new Date(instantMs), fuseau);
  const commeUtc = Date.UTC(m.annee, m.mois - 1, m.jour, m.heures, m.minutes, m.secondes);
  return Math.round((commeUtc - Math.floor(instantMs / 1000) * 1000) / MS_PAR_MINUTE);
}

/**
 * Instant correspondant à une heure murale dans `fuseau`. Deux passes pour
 * tomber juste autour d'un changement d'heure (sans effet en Afrique
 * centrale, mais le pays peut changer de fuseau).
 * @param {{ annee:number, mois:number, jour:number, heures:number, minutes:number }} m mois de 1 à 12
 * @param {string} fuseau
 * @returns {Date}
 */
export function instantDepuisHeureMurale({ annee, mois, jour, heures, minutes }, fuseau) {
  const commeUtc = Date.UTC(annee, mois - 1, jour, heures, minutes, 0, 0);
  let instant = commeUtc - decalageMinutes(commeUtc, fuseau) * MS_PAR_MINUTE;
  instant = commeUtc - decalageMinutes(instant, fuseau) * MS_PAR_MINUTE;
  return new Date(instant);
}

/**
 * Instant de début (ou de fin) d'une case d'agenda.
 * @param {Date|string} dateCase  creneau_agenda.date (@db.Date, lue en UTC)
 * @param {Date|string} heure     horaire.heure_debut ou heure_fin (@db.Time, lue en UTC)
 * @param {string} fuseau
 * @returns {Date}
 */
export function instantDeCase(dateCase, heure, fuseau) {
  const d = new Date(dateCase);
  const h = new Date(heure);
  return instantDepuisHeureMurale(
    {
      annee: d.getUTCFullYear(),
      mois: d.getUTCMonth() + 1,
      jour: d.getUTCDate(),
      heures: h.getUTCHours(),
      minutes: h.getUTCMinutes(),
    },
    fuseau
  );
}

/**
 * Case d'agenda (date + heure murales, au format de stockage) qui commence à
 * l'instant donné.
 * @param {Date|string} instant
 * @param {string} fuseau
 * @returns {{ date: Date, heure: Date, alignee: boolean }}
 *   `alignee` = faux si l'instant porte des secondes / millisecondes (ne peut
 *   pas être un début de case).
 */
export function caseDepuisInstant(instant, fuseau) {
  const d = instant instanceof Date ? instant : new Date(instant);
  const m = heureMuraleDepuisInstant(d, fuseau);
  return {
    date: new Date(Date.UTC(m.annee, m.mois - 1, m.jour)),
    heure: new Date(Date.UTC(1970, 0, 1, m.heures, m.minutes, 0, 0)),
    alignee: m.secondes === 0 && d.getUTCMilliseconds() === 0,
  };
}

/**
 * Date murale du jour (minuit, au format de stockage @db.Date) dans `fuseau`.
 * @param {string} fuseau
 * @param {Date} [maintenant]
 * @returns {Date}
 */
export function dateMuraleDuJour(fuseau, maintenant = new Date()) {
  const m = heureMuraleDepuisInstant(maintenant, fuseau);
  return new Date(Date.UTC(m.annee, m.mois - 1, m.jour));
}
