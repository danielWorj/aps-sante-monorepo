// src/jobs/agenda.job.js
// Agenda — déclencheurs périodiques :
//   - expirerRdvNonConfirmesJob : annule les RDV « cree » dont le délai de
//     confirmation est échu et libère leurs cases (expirationConfirmation.service.js) ;
//   - synchroniserAgendasJob : prolonge chaque nuit l'horizon des cases
//     générées à partir du gabarit hebdomadaire (agendaCreneau.service.js).
//
// Ce fichier ne contient AUCUNE règle métier : seulement un verrou en mémoire
// contre le chevauchement de deux passages dans CE process. Plusieurs
// instances restent sans danger : annulation et réservation sont des UPDATE
// conditionnels, la génération est idempotente (skipDuplicates).

import { expirerRdvNonConfirmes } from "../services/expirationConfirmation.service.js";
import { synchroniserTousLesAgendas } from "../services/agendaCreneau.service.js";

function sansChevauchement(nom, tache) {
  let enCours = false;
  return async (options = {}) => {
    if (enCours) {
      console.warn(`[${nom}] Passage précédent encore en cours : tick ignoré.`);
      return { saute: true };
    }
    enCours = true;
    try {
      return await tache(options);
    } finally {
      enCours = false;
    }
  };
}

export const expirerRdvNonConfirmesJob = sansChevauchement("expiration-confirmation", expirerRdvNonConfirmes);
export const synchroniserAgendasJob = sansChevauchement("agenda-synchronisation", synchroniserTousLesAgendas);
