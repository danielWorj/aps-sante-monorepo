// src/utils/creneaux.js
//
// Agenda — aides d'affichage des créneaux RÉSERVABLES d'un médecin
// (GET /medecins/:id/agenda?libres=true, voir medecinService.listerCreneauxLibres).
//
// Chaque créneau porte `debut` / `fin` : des instants réels (ISO) calculés
// par le serveur dans le fuseau du médecin, ainsi que son jour (`date`) et
// son heure (`horaire.heure_debut`) MURAUX, épinglés en UTC. On affiche et
// on regroupe à l'heure du cabinet (jourCabinet / heureCabinet) : patient
// et médecin lisent la même heure, quel que soit le fuseau du navigateur.

// Fenêtre de recherche par défaut : alignée sur l'horizon de publication
// des créneaux côté serveur (AGENDA_HORIZON_JOURS, 60 jours).
export const HORIZON_CRENEAUX_JOURS = 60;

// Codes 409/404 renvoyés quand le créneau choisi n'est plus réservable
// (pris entre-temps par un autre patient, fermé par le médecin, passé).
const CODES_CRENEAU_PERDU = ['CRENEAU_INDISPONIBLE', 'CRENEAU_PASSE', 'CRENEAU_HORS_AGENDA', 'CRENEAU_INTROUVABLE'];

const pad = (n) => String(n).padStart(2, '0');

/** Date locale "AAAA-MM-JJ" d'un instant (ou d'une Date). */
export function dateLocaleISO(instant) {
  const d = instant instanceof Date ? instant : new Date(instant);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Heure locale "HH:mm" d'un instant. */
export function heureLocale(instant) {
  const d = new Date(instant);
  return Number.isNaN(d.getTime()) ? '--:--' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Jour du cabinet "AAAA-MM-JJ" d'un créneau (repli : jour local de `debut`). */
export function jourCabinet(creneau) {
  const d = typeof creneau?.date === 'string' ? creneau.date.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : dateLocaleISO(creneau?.debut);
}

/** Heure du cabinet "HH:mm" d'un créneau (repli : heure locale de `debut`). */
export function heureCabinet(creneau) {
  const brut = creneau?.horaire?.heure_debut;
  if (typeof brut === 'string') {
    const h = (brut.includes('T') ? brut.split('T')[1] : brut).slice(0, 5);
    if (/^\d{2}:\d{2}$/.test(h)) return h;
  }
  return heureLocale(creneau?.debut);
}

/** "mar. 12" — jour court du cabinet d'un créneau. */
export function jourCourtCabinet(creneau) {
  const d = new Date(`${jourCabinet(creneau)}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "jeudi 23 octobre à 14:30" à l'heure du cabinet. */
export function dateHeureCabinet(creneau) {
  const d = new Date(`${jourCabinet(creneau)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  const jour = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return `${jour} à ${heureCabinet(creneau)}`;
}

/**
 * Bornes (AAAA-MM-JJ) à envoyer au serveur pour couvrir `jours` jours à
 * partir d'aujourd'hui. Un jour de marge de chaque côté : le serveur filtre
 * sur la date murale du médecin, qui peut différer d'un jour de la date
 * locale du patient autour de minuit.
 */
export function plageRecherche(jours = HORIZON_CRENEAUX_JOURS, maintenant = new Date()) {
  const debut = new Date(maintenant);
  debut.setDate(debut.getDate() - 1);
  const fin = new Date(maintenant);
  fin.setDate(fin.getDate() + jours + 1);
  return { date_debut: dateLocaleISO(debut), date_fin: dateLocaleISO(fin) };
}

/**
 * Regroupe les créneaux par jour du cabinet (clé "AAAA-MM-JJ"), triés par heure.
 * Les créneaux déjà commencés sont écartés (la liste a pu vieillir à l'écran).
 * @param {Array<{ creneau_id: string, debut: string }>} creneaux
 * @returns {Map<string, Array>}
 */
export function grouperParJour(creneaux, maintenant = Date.now()) {
  const carte = new Map();
  [...(creneaux || [])]
    .filter((c) => c?.debut && new Date(c.debut).getTime() > maintenant)
    .sort((a, b) => new Date(a.debut) - new Date(b.debut))
    .forEach((c) => {
      const jour = jourCabinet(c);
      if (!carte.has(jour)) carte.set(jour, []);
      carte.get(jour).push(c);
    });
  return carte;
}

/** L'erreur indique-t-elle que le créneau choisi n'est plus réservable ? */
export function estCreneauPerdu(err) {
  return CODES_CRENEAU_PERDU.includes(err?.data?.code);
}

/** "jeudi 23 octobre à 14:30" — échéance de confirmation, etc. */
export function dateHeureLisible(instant) {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return '';
  const jour = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  return `${jour} à ${heureLocale(d)}`;
}
