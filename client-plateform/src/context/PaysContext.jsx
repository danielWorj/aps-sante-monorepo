// src/context/PaysContext.jsx
//
// Pays de l'utilisateur, partagé par TOUTE la plateforme (annuaires,
// accueil, demande express…) : chaque page propose d'abord les médecins,
// pharmacies, structures de santé, assurances et villes de ce pays, et
// garde un filtre « Pays » pour en changer au besoin.
//
// Ordre de détection (le premier qui répond l'emporte) :
//   1. pays choisi par l'utilisateur dans un filtre (mémorisé sur l'appareil) ;
//   2. pays du compte connecté ;
//   3. fuseau horaire / langue du navigateur (aucune autorisation requise) ;
//   4. position GPS, demandée UNE seule fois (modale d'explication de
//      geolocConsentement.js) : elle affine les étapes 2-3 mais ne remplace
//      jamais un choix explicite.
//
// Seuls les pays ouverts par APS (référentiel /referentiels/pays) sont
// retenus ; sinon aucun pays n'est imposé (« Tous les pays »).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { listerPays, listerVilles } from '../services/geoService';
import { detecterPaysUtilisateur } from '../lib/geoloc';
import { codePaysDuNavigateur } from '../lib/paysNavigateur';

const CLE_CHOIX = 'aps.pays.choix';
const CLE_GPS_DEMANDE = 'aps.pays.gps_demande';

function lire(cle) {
  try { return localStorage.getItem(cle); } catch { return null; }
}
function ecrire(cle, valeur) {
  try {
    if (valeur) localStorage.setItem(cle, valeur);
    else localStorage.removeItem(cle);
  } catch {
    // Stockage indisponible (navigation privée) : choix valable pour la session.
  }
}

const PaysContext = createContext(null);

export function PaysProvider({ children }) {
  const { user } = useAuth() ?? {};
  const [listePays, setListePays] = useState([]);
  const [paysId, setPaysId] = useState(() => lire(CLE_CHOIX) || '');
  // 'choix' | 'compte' | 'navigateur' | 'gps' | null
  const [source, setSource] = useState(() => (lire(CLE_CHOIX) ? 'choix' : null));
  const [villes, setVilles] = useState([]);
  // Lu par les effets de détection sans les relancer à chaque changement.
  const sourceRef = useRef(source);

  useEffect(() => {
    let annule = false;
    listerPays()
      .then((d) => { if (!annule) setListePays(d.pays || []); })
      .catch(() => {});
    return () => { annule = true; };
  }, []);

  const appliquer = useCallback((id, origine) => {
    sourceRef.current = origine;
    setPaysId(id);
    setSource(origine);
  }, []);

  // Étapes 2 et 3 : dès que le référentiel est chargé (ou que la session change).
  useEffect(() => {
    if (!listePays.length || sourceRef.current === 'choix' || sourceRef.current === 'gps') return;
    const existe = (id) => listePays.some((p) => String(p.pays_id) === String(id));
    if (user?.pays_id && existe(user.pays_id)) {
      appliquer(String(user.pays_id), 'compte');
      return;
    }
    const code = codePaysDuNavigateur(listePays.map((p) => p.code_iso2));
    const pays = code && listePays.find((p) => p.code_iso2?.toUpperCase() === code);
    if (pays) appliquer(String(pays.pays_id), 'navigateur');
  }, [listePays, user?.pays_id, appliquer]);

  // Étape 4 : position GPS, une seule demande par appareil.
  useEffect(() => {
    if (!listePays.length || sourceRef.current === 'choix' || lire(CLE_GPS_DEMANDE)) return undefined;
    let annule = false;
    ecrire(CLE_GPS_DEMANDE, '1');
    detecterPaysUtilisateur().then((pays) => {
      if (annule || !pays?.pays_id || sourceRef.current === 'choix') return;
      appliquer(String(pays.pays_id), 'gps');
    });
    return () => { annule = true; };
  }, [listePays, appliquer]);

  // Villes du pays actif (proposées par l'accueil et les formulaires).
  useEffect(() => {
    if (!paysId) { setVilles([]); return undefined; }
    let annule = false;
    listerVilles(paysId)
      .then((d) => { if (!annule) setVilles(d.villes || []); })
      .catch(() => { if (!annule) setVilles([]); });
    return () => { annule = true; };
  }, [paysId]);

  /** Choix explicite de l'utilisateur (filtre « Pays ») : mémorisé. */
  const changerPays = useCallback((id) => {
    const valeur = id ? String(id) : '';
    ecrire(CLE_CHOIX, valeur);
    appliquer(valeur, valeur ? 'choix' : null);
  }, [appliquer]);

  /** « Me localiser » : relance la détection GPS à la demande. */
  const localiser = useCallback(async () => {
    const pays = await detecterPaysUtilisateur({ forcer: true });
    if (pays?.pays_id) {
      ecrire(CLE_CHOIX, '');
      appliquer(String(pays.pays_id), 'gps');
    }
    return pays;
  }, [appliquer]);

  const pays = useMemo(
    () => listePays.find((p) => String(p.pays_id) === String(paysId)) ?? null,
    [listePays, paysId]
  );

  const valeur = useMemo(
    () => ({ listePays, paysId, pays, source, villes, changerPays, localiser }),
    [listePays, paysId, pays, source, villes, changerPays, localiser]
  );

  return <PaysContext.Provider value={valeur}>{children}</PaysContext.Provider>;
}

export function usePays() {
  const ctx = useContext(PaysContext);
  if (!ctx) throw new Error('usePays() doit être appelé dans un <PaysProvider>.');
  return ctx;
}

/**
 * Filtre « Pays » d'une page : démarre sur le pays de l'URL s'il y en a un,
 * sinon sur le pays détecté (et le suit tant que l'utilisateur n'a rien
 * choisi). Choisir un pays dans le filtre le mémorise pour tout le site ;
 * « Tous les pays » ne vaut que pour la page.
 *
 * @returns {[string, (id: string) => void]}
 */
export function usePaysFiltre(valeurUrl = '') {
  const { paysId: global, changerPays } = usePays();
  const [local, setLocal] = useState(valeurUrl || global || '');
  const touche = useRef(Boolean(valeurUrl));

  useEffect(() => {
    if (!touche.current && global) setLocal(global);
  }, [global]);

  const choisir = useCallback((id) => {
    touche.current = true;
    setLocal(id || '');
    if (id) changerPays(id);
  }, [changerPays]);

  return [local, choisir];
}
