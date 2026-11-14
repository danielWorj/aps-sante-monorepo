// src/lib/dureeTeleconsultation.js
// Téléconsultation — calculs PURS autour de la durée maximale d'un appel.
//
// Module SANS dépendance : testable sans base.
//
// La durée D (minutes) se règle par pays dans le back-office
// (parametre_duree_teleconsultation) et se FIGE sur le RDV
// (rendez_vous.visio_duree_minutes) dès que les deux parties sont présentes.
//   début      = max(medecin_present_le, patient_present_le)
//   fin prévue = début + D
// Les applications affichent un compte à rebours, alertent ALERTE_AVANT_FIN_MIN
// minutes avant la fin, puis coupent l'appel ; le serveur refuse ensuite tout
// nouveau jeton et clôture la consultation (filet : cron).

const MS_PAR_MINUTE = 60_000;

// Bornes de D : miroir de la contrainte CHECK de la migration 20261106120000.
export const MINUTES_MIN = 5;
export const MINUTES_MAX = 240;

function entierEnv(nom, defaut) {
  const n = Number(process.env[nom] ?? defaut);
  return Number.isInteger(n) && n >= MINUTES_MIN && n <= MINUTES_MAX ? n : defaut;
}

// Valeur appliquée quand aucun paramètre actif n'existe pour le pays.
export const DUREE_TELECONSULTATION_PAR_DEFAUT_MIN = entierEnv("DUREE_TELECONSULTATION_PAR_DEFAUT_MIN", 30);

// Alerte affichée aux deux parties avant la coupure.
export const ALERTE_AVANT_FIN_MIN = 5;

// Marge laissée aux applications pour couper elles-mêmes avant que le cron
// ne clôture la consultation côté serveur.
export const MARGE_CLOTURE_AUTO_MS = 2 * MS_PAR_MINUTE;

/** D est-elle acceptable ? Entier dans [MINUTES_MIN, MINUTES_MAX], sans conversion implicite. */
export function minutesDureeValides(minutes) {
  return Number.isInteger(minutes) && minutes >= MINUTES_MIN && minutes <= MINUTES_MAX;
}

/** Début de la consultation : les deux parties présentes, sinon null. */
export function debutConsultation(rdv) {
  if (!rdv?.medecin_present_le || !rdv?.patient_present_le) return null;
  return new Date(Math.max(new Date(rdv.medecin_present_le).getTime(), new Date(rdv.patient_present_le).getTime()));
}

/** Fin prévue (Date) si la durée est figée et la consultation commencée, sinon null. */
export function finPrevue(rdv) {
  const debut = debutConsultation(rdv);
  if (!debut || !Number.isInteger(rdv.visio_duree_minutes)) return null;
  return new Date(debut.getTime() + rdv.visio_duree_minutes * MS_PAR_MINUTE);
}

/** La durée est-elle écoulée ? */
export function dureeEcoulee(rdv, maintenant = new Date()) {
  const fin = finPrevue(rdv);
  return Boolean(fin && maintenant.getTime() >= fin.getTime());
}
