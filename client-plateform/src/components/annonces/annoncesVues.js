// annoncesVues.js
//
// Les annonces sont diffusées à tous (modèle Annonce sans destinataire,
// voir annonce.controller.js) : le serveur ne sait pas qui les a lues.
// On retient donc, par compte et sur cet appareil, la date de la dernière
// visite de la page « Annonces » ; toute annonce publiée après est
// « nouvelle » (pastille du menu, étiquette sur la carte).
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listerAnnonces } from '../../services/annonceService';

const EVENEMENT = 'aps:annonces-vues';
const CACHE_MS = 60000;
let cache = null; // { promesse, le } : la navbar et la sidebar partagent la requête

function annoncesEnCours() {
  if (!cache || Date.now() - cache.le > CACHE_MS) {
    cache = { le: Date.now(), promesse: listerAnnonces({ actives: true }).catch((e) => { cache = null; throw e; }) };
  }
  return cache.promesse;
}

function cle(user) {
  const id = user?.utilisateur_id ?? user?.email;
  return id ? `aps.annonces.vues.${id}` : null;
}

/** Date (ms) de la dernière visite de la page Annonces, 0 si jamais. */
export function derniereVisite(user) {
  const k = cle(user);
  if (!k) return 0;
  try {
    return Number(localStorage.getItem(k)) || 0;
  } catch {
    return 0;
  }
}

export function marquerAnnoncesVues(user) {
  const k = cle(user);
  if (!k) return;
  try {
    localStorage.setItem(k, String(Date.now()));
  } catch {
    /* stockage indisponible (navigation privée) : pastille seulement */
  }
  window.dispatchEvent(new Event(EVENEMENT));
}

export function estNouvelle(annonce, depuis) {
  return new Date(annonce.date_creation).getTime() > depuis;
}

/** Nombre d'annonces en cours publiées depuis la dernière visite. */
export function useAnnoncesNonLues() {
  const { user } = useAuth();
  const [annonces, setAnnonces] = useState([]);
  // Relu à chaque rendu ; l'événement ne sert qu'à provoquer ce rendu.
  const [, setTic] = useState(0);
  const depuis = derniereVisite(user);

  useEffect(() => {
    if (!user) return undefined;
    let annule = false;
    annoncesEnCours()
      .then((liste) => { if (!annule) setAnnonces(Array.isArray(liste) ? liste : []); })
      .catch(() => { /* pastille seulement : silencieux */ });
    return () => { annule = true; };
  }, [user]);

  useEffect(() => {
    const maj = () => setTic((t) => t + 1);
    window.addEventListener(EVENEMENT, maj);
    return () => window.removeEventListener(EVENEMENT, maj);
  }, []);

  return annonces.filter((a) => estNouvelle(a, depuis)).length;
}
