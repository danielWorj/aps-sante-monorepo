// src/hooks/useTelechargementApk.js
//
// Téléchargement de l'APK active (module « Gestion des APKs » du
// back-office) avec suivi de progression. Partagé par le bloc
// « Application » de l'accueil (Home.jsx) et le bouton du pied de page
// (Footer.jsx) : voir src/services/apkService.js pour le détail.
import { useEffect, useState } from 'react';
import {
  obtenirApkActive,
  obtenirUrlTelechargementApk,
  telechargerApkAvecProgression,
  declencherSauvegardeBlob,
} from '../services/apkService';

export function useTelechargementApk() {
  // URL de téléchargement de l'APK active, récupérée depuis GET /api/apks/active
  // (route publique). null = pas encore chargée / aucune APK active : le
  // bouton est alors désactivé.
  const [url, setUrl] = useState(null);
  // Taille du fichier (octets) renvoyée par /apks/active : repli si le
  // téléchargement n'expose pas Content-Length.
  const [taille, setTaille] = useState(null);
  // null = pas de téléchargement en cours, sinon 0-100.
  const [progression, setProgression] = useState(null);
  const [erreur, setErreur] = useState(null);
  // Octets reçus : affichés en Mo quand aucune taille totale n'est connue.
  const [octetsRecus, setOctetsRecus] = useState(0);
  const tailleInconnue = !taille && progression === 0 && octetsRecus > 0;
  const enCours = progression !== null;

  useEffect(() => {
    let annule = false;
    obtenirApkActive()
      .then((apk) => {
        if (annule) return;
        setUrl(obtenirUrlTelechargementApk(apk) || null);
        setTaille(apk?.taille || null);
      })
      .catch(() => {
        // Erreur réseau/serveur : bouton désactivé plutôt qu'une page en erreur.
        if (!annule) setUrl(null);
      });
    return () => { annule = true; };
  }, []);

  /** Lance le téléchargement ; renvoie false s'il a échoué (message dans `erreur`). */
  async function lancer() {
    if (!url || enCours) return false;
    setErreur(null);
    setOctetsRecus(0);
    setProgression(0);
    try {
      const { blob, nomFichier } = await telechargerApkAvecProgression(url, setProgression, taille, setOctetsRecus);
      declencherSauvegardeBlob(blob, nomFichier);
      return true;
    } catch (err) {
      setErreur(err?.message || 'Le téléchargement a échoué. Réessayez dans quelques instants.');
      return false;
    } finally {
      setProgression(null);
    }
  }

  /** Avancement lisible : « 42% », ou « 12.3 Mo » sans taille totale connue. */
  const libelleProgression = tailleInconnue
    ? `${(octetsRecus / 1024 / 1024).toFixed(1)} Mo`
    : `${progression ?? 0}%`;

  return { disponible: Boolean(url), enCours, progression, tailleInconnue, libelleProgression, erreur, lancer };
}
