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

/**
 * iPhone / iPad / iPod : un APK ne s'y installe pas (format Android) et
 * Safari n'enregistre pas le fichier dans « Téléchargements ». iPadOS se
 * présente comme un Mac : on le reconnaît à son écran tactile.
 */
export const estIos = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/i.test(ua)
    || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
};

export function useTelechargementApk() {
  const ios = estIos();
  // Sur iOS, le bouton ouvre une modale d'information au lieu de télécharger.
  const [infoIos, setInfoIos] = useState(false);
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
  // APK reçue et gardée en mémoire : ouvre la modale « Téléchargement
  // terminé » (ApkPreteModal) ; l'enregistrement ne part qu'au clic sur
  // « Installer », pour que le navigateur affiche aussitôt sa barre « Ouvrir ».
  const [fichierPret, setFichierPret] = useState(null);
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
    if (ios) {
      setInfoIos(true);
      return true;
    }
    if (!url || enCours) return false;
    setErreur(null);
    setOctetsRecus(0);
    setProgression(0);
    try {
      const { blob, nomFichier } = await telechargerApkAvecProgression(url, setProgression, taille, setOctetsRecus);
      setFichierPret({ blob, nomFichier, taille: blob.size });
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

  /** Enregistre l'APK déjà reçue : à appeler depuis un clic (geste utilisateur). */
  function installer() {
    if (fichierPret) declencherSauvegardeBlob(fichierPret.blob, fichierPret.nomFichier);
  }

  /** Ferme la modale et libère le fichier gardé en mémoire. */
  function fermer() {
    setFichierPret(null);
    setInfoIos(false);
  }

  return {
    disponible: Boolean(url), enCours, progression, tailleInconnue, libelleProgression, erreur, lancer,
    fichierPret, installer, fermer, ios, infoIos,
  };
}
