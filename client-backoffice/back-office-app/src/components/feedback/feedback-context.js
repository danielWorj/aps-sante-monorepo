// feedback-context.js
//
// Contextes et hooks du système de retour utilisateur (toasts + modales de
// confirmation / saisie). Remplacent window.alert, window.confirm et
// window.prompt dans toute l'application : ne plus utiliser les boîtes natives.
//
// Le fournisseur (FeedbackProvider) est monté une seule fois dans main.jsx.
// Ce module est dupliqué à l'identique dans client-backoffice (seul
// feedback.css diffère, pour les couleurs de chaque application).
import { createContext, useContext } from 'react';

export const ToastContext = createContext(null);
export const DialogContext = createContext(null);

function exiger(valeur, hook) {
  if (!valeur) throw new Error(`${hook}() doit être utilisé sous <FeedbackProvider>.`);
  return valeur;
}

/**
 * Notifications non bloquantes.
 *
 *   const toast = useToast();
 *   toast.succes('Agence supprimée.');
 *   toast.erreur(err.message || 'Suppression impossible.');
 *   toast.info('Export en préparation.', { duree: 6000 });
 *
 * Variantes : succes, erreur, info, avertissement. Options : { titre, duree }
 * (duree en ms, 0 = reste affiché jusqu'à fermeture manuelle).
 */
export function useToast() {
  return exiger(useContext(ToastContext), 'useToast');
}

/**
 * Modale de confirmation, renvoie une promesse booléenne.
 *
 *   const confirmer = useConfirmation();
 *   if (!(await confirmer({
 *     titre: 'Supprimer l’agence',
 *     message: 'Cette action est définitive.',
 *     labelConfirmer: 'Supprimer',
 *     variante: 'danger',
 *   }))) return;
 *
 * Accepte aussi une simple chaîne : await confirmer('Continuer ?').
 * Variantes : 'primaire' (défaut), 'danger', 'avertissement'.
 */
export function useConfirmation() {
  return exiger(useContext(DialogContext), 'useConfirmation').confirmer;
}

/**
 * Modale de saisie (remplace window.prompt). Renvoie la valeur saisie
 * (chaîne, espaces de bord retirés) ou null si l'utilisateur annule.
 *
 *   const saisir = useSaisie();
 *   const motif = await saisir({
 *     titre: 'Rejeter le retrait',
 *     label: 'Motif (visible par le médecin)',
 *     multiligne: true,
 *     obligatoire: true,
 *   });
 *   if (motif === null) return;
 *
 * Options : message, label, valeurInitiale, placeholder, type ('text' |
 * 'number'), multiligne, obligatoire, maxLength, min, max, labelConfirmer,
 * labelAnnuler, variante, valider(valeur) → message d'erreur ou null.
 */
export function useSaisie() {
  return exiger(useContext(DialogContext), 'useSaisie').saisir;
}
