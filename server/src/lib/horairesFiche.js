// src/lib/horairesFiche.js
// Horaires d'ouverture d'une pharmacie ou d'un centre de santé (colonne
// JSON `horaires`) : validation de la saisie du gestionnaire et état
// « ouvert / fermé » à un instant donné, en heure murale du pays de la fiche
// (Pays.fuseau_horaire).
//
// Format stocké (les 7 jours toujours présents, tableau vide = fermé) :
//   { lundi: [{ debut: "08:00", fin: "12:30" }, { debut: "14:00", fin: "19:00" }],
//     …, dimanche: [] }
// Une plage ne franchit jamais minuit : « fin » vaut au plus "24:00" et une
// ouverture de nuit se saisit sur deux jours (20:00–24:00 puis 00:00–08:00).
// Ouvert 24 h/24 : une plage 00:00–24:00 chaque jour.
//
// Fonctions pures, testées sans base (tests/espacePresence.test.js).

import { heureMuraleDepuisInstant, fuseauOuDefaut } from "./fuseauHoraire.js";

export const JOURS_SEMAINE = Object.freeze(["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]);
export const MAX_PLAGES_PAR_JOUR = 4;
export const NOTE_HORAIRES_MAX = 255;

const FORMAT_HEURE = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;

/** "HH:MM" -> minutes depuis minuit (0 à 1440), ou null si invalide. */
export function minutesDe(heure) {
  if (typeof heure !== "string" || !FORMAT_HEURE.test(heure)) return null;
  const [h, m] = heure.split(":").map(Number);
  return h * 60 + m;
}

const versHeure = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * Valide et normalise une saisie d'horaires. `null` efface les horaires
 * (« non renseignés »). Les plages sont triées ; elles ne doivent ni se
 * chevaucher ni être vides.
 * @returns {{ erreur?: string, data?: object|null }}
 */
export function normaliserHoraires(saisie) {
  if (saisie === null) return { data: null };
  if (!saisie || typeof saisie !== "object" || Array.isArray(saisie)) {
    return { erreur: "horaires invalides : objet attendu (un tableau de plages par jour)." };
  }
  const inconnus = Object.keys(saisie).filter((j) => !JOURS_SEMAINE.includes(j));
  if (inconnus.length) return { erreur: `Jour inconnu : ${inconnus.join(", ")}.` };

  const data = {};
  for (const jour of JOURS_SEMAINE) {
    const plages = saisie[jour] ?? [];
    if (!Array.isArray(plages)) return { erreur: `${jour} : liste de plages attendue.` };
    if (plages.length > MAX_PLAGES_PAR_JOUR) {
      return { erreur: `${jour} : ${MAX_PLAGES_PAR_JOUR} plages au maximum.` };
    }
    const lues = [];
    for (const p of plages) {
      const debut = minutesDe(p?.debut);
      const fin = minutesDe(p?.fin);
      if (debut === null || fin === null || debut === 1440) {
        return { erreur: `${jour} : heure invalide (format HH:MM, fin au plus 24:00).` };
      }
      if (fin <= debut) {
        return { erreur: `${jour} : l'heure de fermeture doit suivre l'heure d'ouverture (une plage ne passe pas minuit).` };
      }
      lues.push({ debut, fin });
    }
    lues.sort((a, b) => a.debut - b.debut);
    for (let i = 1; i < lues.length; i += 1) {
      if (lues[i].debut < lues[i - 1].fin) return { erreur: `${jour} : les plages se chevauchent.` };
    }
    data[jour] = lues.map((p) => ({ debut: versHeure(p.debut), fin: versHeure(p.fin) }));
  }
  return { data };
}

/** Normalise la note libre (« Fermé les jours fériés »…). */
export function normaliserNoteHoraires(note) {
  if (note === undefined) return { data: undefined };
  if (note === null || note === "") return { data: null };
  if (typeof note !== "string") return { erreur: "horaires_note invalide." };
  const propre = note.trim();
  if (propre.length > NOTE_HORAIRES_MAX) return { erreur: `Note trop longue (${NOTE_HORAIRES_MAX} caractères maximum).` };
  return { data: propre || null };
}

/** Vrai si la fiche est ouverte 24 h/24, 7 j/7. */
export function estOuvert24h(horaires) {
  if (!horaires) return false;
  return JOURS_SEMAINE.every((j) => (horaires[j] ?? []).some((p) => p.debut === "00:00" && p.fin === "24:00"));
}

// Jour de la semaine (lundi = 0) d'une date murale.
function indexJour({ annee, mois, jour }) {
  return (new Date(Date.UTC(annee, mois - 1, jour)).getUTCDay() + 6) % 7;
}

/**
 * État d'ouverture à `maintenant`, en heure murale de `fuseau`.
 * @returns {null | { ouvert: boolean, jusqu_a?: string, prochaine_ouverture?: { jour: string, heure: string } | null }}
 *   null : horaires non renseignés (on ne sait pas).
 */
export function etatOuverture(horaires, fuseau, maintenant = new Date()) {
  if (!horaires) return null;
  const m = heureMuraleDepuisInstant(maintenant, fuseauOuDefaut(fuseau));
  const minutes = m.heures * 60 + m.minutes;
  const aujourdhui = indexJour(m);
  const plagesDu = (i) => (horaires[JOURS_SEMAINE[i % 7]] ?? []).map((p) => ({ debut: minutesDe(p.debut), fin: minutesDe(p.fin) }));

  const enCours = plagesDu(aujourdhui).find((p) => p.debut <= minutes && minutes < p.fin);
  if (enCours) {
    // Ouverture continue au-delà de minuit (24:00 puis 00:00 le lendemain).
    let fin = enCours.fin;
    let jourFin = aujourdhui;
    for (let k = 1; fin === 1440 && k <= 7; k += 1) {
      const suite = plagesDu(aujourdhui + k).find((p) => p.debut === 0);
      if (!suite) break;
      fin = suite.fin;
      jourFin = aujourdhui + k;
    }
    if (fin === 1440 && jourFin - aujourdhui >= 7) return { ouvert: true, jusqu_a: null };
    return { ouvert: true, jusqu_a: versHeure(fin === 1440 ? 0 : fin) };
  }

  for (let k = 0; k <= 7; k += 1) {
    const prochaine = plagesDu(aujourdhui + k).find((p) => k > 0 || p.debut > minutes);
    if (prochaine) {
      return { ouvert: false, prochaine_ouverture: { jour: JOURS_SEMAINE[(aujourdhui + k) % 7], heure: versHeure(prochaine.debut) } };
    }
  }
  return { ouvert: false, prochaine_ouverture: null };
}
