// src/lib/cloudinaryService.js
//
// Point d'accès UNIQUE à Cloudinary pour tout le backend. Toute
// fonctionnalité qui a besoin de stocker un fichier (image ou PDF)
// doit passer par ce module plutôt que d'appeler le SDK Cloudinary
// directement ailleurs.
//
// Règle produit : seul le "nom" du fichier (le public_id retourné par
// Cloudinary) est stocké en base de données — jamais l'URL complète.
// L'URL est reconstruite à la demande via construireUrl(), ce qui
// permet de changer de cloud_name / de politique de transformation
// sans avoir à migrer les données.
//
// Convention : tous les fichiers (images ET PDF) sont téléversés avec
// resource_type "image". Cloudinary sait nativement stocker et
// prévisualiser des PDF sous ce type (rendu page par page), ce qui
// évite de devoir mémoriser un second champ "type de ressource" en
// base — cohérent avec la règle "seul le nom est stocké".
//
// Variables d'environnement requises (.env) :
//   CLOUDINARY_CLOUD_NAME
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET

import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const RESOURCE_TYPE = "image";
const DOSSIER_RACINE = "aps/structures-sante";

/**
 * Téléverse un fichier (buffer en mémoire — voir middlewares/upload.middleware.js,
 * qui utilise multer en memoryStorage) vers Cloudinary.
 *
 * @param {Buffer} buffer - contenu binaire du fichier
 * @param {string} sousDossier - ex. "images", "pieces-identite", "agrements"
 * @returns {Promise<{nom: string, url: string}>} `nom` = public_id à stocker en base
 */
export function televerserFichier(buffer, sousDossier) {
  return new Promise((resolve, reject) => {
    const flux = cloudinary.uploader.upload_stream(
      {
        folder: `${DOSSIER_RACINE}/${sousDossier}`,
        resource_type: RESOURCE_TYPE,
      },
      (erreur, resultat) => {
        if (erreur) return reject(erreur);
        resolve({ nom: resultat.public_id, url: resultat.secure_url });
      }
    );
    flux.end(buffer);
  });
}

/**
 * Supprime un fichier de Cloudinary à partir du "nom" (public_id)
 * stocké en base. Utilisé lors du remplacement d'un fichier (édition)
 * ou de la suppression d'un centre de santé, pour éviter d'accumuler
 * des fichiers orphelins sur le compte Cloudinary.
 *
 * Volontairement "best effort" : un échec de nettoyage Cloudinary ne
 * doit jamais faire échouer l'opération métier (update/delete en DB)
 * qui l'a déclenché — on logge et on continue.
 */
export async function supprimerFichier(nom) {
  if (!nom) return;
  try {
    await cloudinary.uploader.destroy(nom, { resource_type: RESOURCE_TYPE });
  } catch (erreur) {
    console.error(`[cloudinaryService] Échec de suppression de "${nom}" :`, erreur.message);
  }
}

/**
 * Reconstruit l'URL publique d'un fichier à partir du nom stocké en
 * base. À utiliser côté API quand on renvoie une fiche au frontend :
 * le frontend n'a pas besoin de connaître cloud_name ni la logique
 * Cloudinary, seulement l'URL finale.
 */
export function construireUrl(nom) {
  if (!nom) return null;
  return cloudinary.url(nom, { resource_type: RESOURCE_TYPE, secure: true });
}

export default { televerserFichier, supprimerFichier, construireUrl };