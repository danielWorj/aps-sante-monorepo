// src/controllers/medecin.controller.js
// Module transverse "Gestion des médecins" — fiche `medecin` (Annuaire
// public) : création, lecture, modification, suppression. Voir
// medecin.routes.js pour le détail des règles d'accès.
//
// ─── Pourquoi ce fichier ré-exporte aussi Avis / Abonnement /
//     Rendez-vous + Ordonnance ───────────────────────────────────────
// medecin.routes.js importe LES 28 handlers du module depuis un seul
// chemin : "../controllers/medecin.controller.js". Dans ce projet, ces
// handlers sont en réalité répartis dans trois fichiers dédiés (même
// découpage que le reste du code) :
//   - avis.controller.js            → listerAvisMedecin, etc.
//   - abonnementMedecin.controller.js → listerAbonnementsMedecin, etc.
//   - rendezVous.controller.js      → listerRendezVous / Ordonnances, etc.
// Plutôt que de dupliquer ce code ici (ou de faire porter à
// medecin.routes.js la connaissance de ce découpage interne, ce qui
// casserait le import { ... } from "../controllers/medecin.controller.js"
// tel qu'il est écrit), ce fichier :
//   1) implémente lui-même les 5 handlers propres à la fiche medecin
//      (creerMedecin, listerMedecins, obtenirMedecin, modifierMedecin,
//      supprimerMedecin) ;
//   2) ré-exporte tel quel le reste depuis les trois fichiers dédiés.
// Le seul point d'entrée pour medecin.routes.js reste donc bien
// medecin.controller.js, sans duplication de logique métier.
//
// ⚠️ NOTE D'ARCHITECTURE — creerMedecin
// Le commentaire du modèle Medecin dans schema.prisma indique que la
// création d'un médecin est censée passer par POST /comptes
// (authentification.controller.js, creerCompteAdministre) plutôt que
// par ce module. Si ce contrôleur existe déjà dans le projet, la
// logique de creerMedecin ci-dessous doit y être déplacée (ou
// mutualisée) plutôt que dupliquée ici. Elle est fournie dans ce
// fichier uniquement parce que c'est le seul point d'entrée connu de
// medecin.routes.js pour l'instant.
//
// Champs réels du modèle Medecin (voir schema.prisma) — TOUS
// obligatoires sauf mention contraire :
//   medecin { medecin_id, utilisateur_id (unique), specialite_id,
//     numero_ordre (PAS unique), statut_verification,
//     pays_exercice_id, ville_exercice_id, teleconsultation_activee,
//     tarif_indicatif, cni_url, attestation_url, photo_url
//     (optionnel/nullable), date_creation }
//   utilisateur { utilisateur_id, nom, prenom, email (unique),
//     telephone?, mot_de_passe_hash, role_id, pays_id, statut_compte,
//     mot_de_passe_temporaire, mot_de_passe_expire_le? }
//
// ⚠️ CORRECTIF — specialite
// "specialite" n'est PAS une colonne texte libre sur medecin : c'est
// une véritable entité (modèle Specialite, table "specialite" —
// specialite_id, nom, description) réutilisable, au même titre que
// Langue/Devise/Pays/Ville. medecin.specialite_id est une FK vers
// cette table (voir @@index([specialite_id]) sur Medecin, dans
// schema.prisma). Ce fichier implémente donc aussi le CRUD de
// Specialite elle-même (référentiel à part, lecture publique /
// écriture admin-superadmin — voir medecin.routes.js).

import crypto from "node:crypto";
import bcrypt from "bcrypt"; // ajuster vers "bcryptjs" si c'est la lib utilisée ailleurs dans le projet
import prisma from "../lib/prisma.js";
import cloudinaryService, { construireUrl } from "../lib/cloudinaryService.js";

export {
  listerAvisMedecin,
  obtenirAvisMedecin,
  creerAvisMedecin,
  modifierAvisMedecin,
  supprimerAvisMedecin,
} from "./avis.controller.js";

export {
  listerAbonnementsMedecin,
  obtenirAbonnementMedecin,
  creerAbonnementMedecin,
  modifierAbonnementMedecin,
  supprimerAbonnementMedecin,
  ajouterMedecinAbonnement,
  retirerMedecinAbonnement,
  ajouterLigneAbonnementMedecin,
  modifierLigneAbonnementMedecin,
  supprimerLigneAbonnementMedecin,
} from "./abonnementMedecin.controller.js";

export {
  listerRendezVous,
  obtenirRendezVous,
  creerRendezVous,
  modifierRendezVous,
  supprimerRendezVous,
  listerOrdonnances,
  obtenirOrdonnance,
  creerOrdonnance,
  modifierOrdonnance,
  supprimerOrdonnance,
} from "./rendezVous.controller.js";

// Doit rester synchronisé avec l'enum StatutVerificationMedecin du
// schema.prisma : non_publie / en_cours / publie.
const STATUTS_VERIFICATION_MEDECIN = ["non_publie", "en_cours", "publie"];

// Libellé du rôle "medecin" dans la table role (role.libelle, unique).
// À ajuster si le seed du projet utilise une autre casse/valeur.
const LIBELLE_ROLE_MEDECIN = "medecin";

// Champs du COMPTE utilisateur (pas de la fiche medecin) modifiables
// via PUT /medecins/:id par le médecin propriétaire ou un admin.
// nom/prenom/telephone vivent sur la table utilisateur (voir en-tête
// de fichier) : avant ce correctif ils étaient silencieusement
// ignorés par modifierMedecin, qui n'écrivait que dans la table
// medecin — d'où le téléphone/nom jamais mis à jour après création.
const CHAMPS_MODIFIABLES_UTILISATEUR = ["nom", "prenom", "telephone"];

// Champs de fiche modifiables par le médecin lui-même ou un admin —
// statut_verification, cni_url et attestation_url sont traités à part
// ci-dessous (règles spécifiques).
const CHAMPS_MODIFIABLES_MEDECIN = [
  "specialite_id",
  "numero_ordre",
  "pays_exercice_id",
  "ville_exercice_id",
  "teleconsultation_activee",
  "tarif_indicatif",
];

// Ne jamais exposer publiquement plus que l'identité de base du
// compte lié (pas d'email/téléphone dans l'Annuaire public).
const SELECTION_UTILISATEUR_PUBLIC = {
  select: { nom: true, prenom: true },
};

// Vue élargie réservée à admin/superadmin (back-office) : email et
// téléphone du compte lié, nécessaires à l'écran de gestion des
// médecins. Ne JAMAIS utiliser cette sélection sur une route publique.
const SELECTION_UTILISATEUR_ADMIN = {
  select: { nom: true, prenom: true, email: true, telephone: true },
};

// Retourne la bonne sélection selon que l'appelant est admin/superadmin
// ou non — utilisé sur les routes en authentification optionnelle
// (GET /medecins, GET /medecins/:id) pour ne dévoiler email/téléphone
// qu'au back-office, jamais à un visiteur anonyme.
function selectionUtilisateurSelonRole(utilisateur) {
  return estAdmin(utilisateur) ? SELECTION_UTILISATEUR_ADMIN : SELECTION_UTILISATEUR_PUBLIC;
}

// Spécialité : entité réelle et réutilisable (table "specialite"),
// jamais une chaîne libre — on n'expose que son id + son nom sur la
// fiche médecin (l'éventuelle description longue reste réservée à
// l'endpoint dédié GET /specialites/:id).
const SELECTION_SPECIALITE_PUBLIC = {
  select: { specialite_id: true, nom: true },
};

// Ville/Pays d'exercice : entités référentielles (mêmes tables que
// pour Pharmacie/StructureSante) — medecin.ville_exercice_id /
// medecin.pays_exercice_id sont des FK. Sans ce `include`, l'API ne
// renvoyait que les ID bruts et jamais le libellé, ce qui laissait la
// colonne "Ville / Pays" vide côté back-office.
const SELECTION_VILLE_PUBLIC = {
  select: { ville_id: true, nom: true },
};
const SELECTION_PAYS_PUBLIC = {
  select: { pays_id: true, nom: true },
};

function estAdmin(utilisateur) {
  return utilisateur?.role === "admin" || utilisateur?.role === "superadmin";
}

/**
 * ⚠️ CORRECTIF — cni_url / attestation_url / photo_url en base ne
 * contiennent QUE le "nom" (public_id Cloudinary, ex.
 * "aps/structures-sante/medecins/photos/abc123.jpg") — jamais l'URL
 * complète (règle produit, voir cloudinaryService.js : "seul le nom du
 * fichier est stocké en base"). Contrairement à pharmacie.controller.js
 * (avecUrlsFichiers, qui expose des champs `_url` dérivés séparés des
 * `_nom` bruts), le nom de colonne choisi ici pour Medecin est déjà
 * "cni_url" etc. : Medecin.jsx (comme Pharmacie.jsx) consomme
 * directement `medecin.cni_url` en tant que lien cliquable. Sans ce
 * passage par construireUrl() avant l'envoi de la réponse, le front
 * ouvrait le public_id brut comme une URL RELATIVE à l'application
 * React elle-même (pas de "https://res.cloudinary.com/…"), ce qui
 * tombait sur la 404 du routeur plutôt que sur le fichier Cloudinary.
 * À appliquer sur toute réponse contenant une fiche medecin destinée à
 * être affichée (listerMedecins, obtenirMedecin, modifierMedecin,
 * creerMedecin).
 */
function avecUrlsFichiersMedecin(medecin) {
  if (!medecin) return medecin;
  return {
    ...medecin,
    cni_url: construireUrl(medecin.cni_url),
    attestation_url: construireUrl(medecin.attestation_url),
    photo_url: medecin.photo_url ? construireUrl(medecin.photo_url) : null,
  };
}

/**
 * Génère un mot de passe temporaire lisible (12 caractères) — même
 * patron attendu que creerPharmacie côté service front
 * (agent.mot_de_passe_temporaire, affiché une seule fois à l'appelant).
 */
function genererMotDePasseTemporaire() {
  return crypto.randomBytes(9).toString("base64url"); // 12 caractères
}

/* ===================================================================
 * Médecins (fiche annuaire)
 * =================================================================== */

/**
 * POST /api/medecins
 * PUBLIQUE — aucune authentification requise (voir medecin.routes.js).
 * N'importe quel visiteur peut soumettre une candidature médecin. Crée
 * EN MÊME TEMPS :
 *   1) le compte utilisateur du médecin (rôle "medecin"), avec un mot
 *      de passe temporaire généré côté serveur ;
 *   2) la fiche medecin liée (utilisateur_id unique), TOUJOURS créée
 *      avec statut_verification="non_publie" (en attente de
 *      vérification) — voir plus bas.
 * Champs requis dans req.body : nom, prenom, email, pays_id (compte
 * utilisateur) + specialite, numero_ordre, pays_exercice_id,
 * ville_exercice_id, teleconsultation_activee, tarif_indicatif (fiche
 * médecin — tous obligatoires en base, aucun n'est nullable).
 * Fichiers requis (multipart, voir gererTeleversementMedecin) : cni,
 * attestation. Fichier optionnel : photo (photo de profil, photo_url
 * nullable en base).
 * ⚠️ SÉCURITÉ — statut_verification n'est PLUS lisible depuis
 * req.body ici : la route étant désormais ouverte à tout le monde
 * sans authentification, accepter cette valeur depuis la requête
 * permettrait à n'importe qui de se créer directement "publie". Seul
 * un admin/superadmin peut faire passer la fiche à "publie" ensuite,
 * via PUT /medecins/:id (route protégée).
 * Le mot de passe temporaire n'est renvoyé qu'UNE SEULE FOIS dans la
 * réponse (`utilisateur.mot_de_passe_temporaire`) — jamais restocké
 * en clair.
 */
export async function creerMedecin(req, res, next) {
  try {
    const {
      nom,
      prenom,
      email,
      telephone,
      pays_id,
      specialite_id,
      numero_ordre,
      pays_exercice_id,
      ville_exercice_id,
      teleconsultation_activee,
      tarif_indicatif,
    } = req.body;

    const champsManquants = [];
    if (!nom) champsManquants.push("nom");
    if (!prenom) champsManquants.push("prenom");
    if (!email) champsManquants.push("email");
    if (!pays_id) champsManquants.push("pays_id");
    if (!specialite_id) champsManquants.push("specialite_id");
    if (!numero_ordre) champsManquants.push("numero_ordre");
    if (!pays_exercice_id) champsManquants.push("pays_exercice_id");
    if (!ville_exercice_id) champsManquants.push("ville_exercice_id");
    if (teleconsultation_activee === undefined) champsManquants.push("teleconsultation_activee");
    if (tarif_indicatif === undefined) champsManquants.push("tarif_indicatif");

    if (champsManquants.length > 0) {
      return res.status(400).json({
        message: `Champs obligatoires manquants : ${champsManquants.join(", ")}.`,
      });
    }

    const cniFile = req.files?.cni?.[0];
    const attestationFile = req.files?.attestation?.[0];
    const photoFile = req.files?.photo?.[0];
    if (!cniFile || !attestationFile) {
      return res.status(400).json({
        message: "Les fichiers cni et attestation sont obligatoires à la création.",
      });
    }
    // photo : optionnelle, même à la création (schema.prisma, photo_url
    // nullable) — contrairement à cni/attestation.

    // Route désormais publique (aucune authentification) : on ignore
    // délibérément un éventuel req.body.statut_verification et on
    // force toujours "non_publie" (en attente de vérification). Ne
    // JAMAIS réintroduire de lecture de ce champ depuis la requête
    // sans la re-protéger derrière autoriser("admin", "superadmin").
    const statutVerification = "non_publie";

    const role = await prisma.role.findUnique({ where: { libelle: LIBELLE_ROLE_MEDECIN } });
    if (!role) {
      return res.status(500).json({
        message: `Rôle "${LIBELLE_ROLE_MEDECIN}" introuvable en base — vérifier le seed de la table role.`,
      });
    }

    // specialite_id doit référencer une spécialité existante dans le
    // référentiel (table specialite) — ce n'est plus une chaîne libre.
    const specialite = await prisma.specialite.findUnique({ where: { specialite_id } });
    if (!specialite) {
      return res.status(400).json({ message: "specialite_id invalide : spécialité introuvable." });
    }

    // Upload Cloudinary AVANT la transaction DB : en cas d'échec de la
    // transaction, on nettoie les fichiers déjà envoyés (best effort).
    const [resultatCni, resultatAttestation, resultatPhoto] = await Promise.all([
      cloudinaryService.televerserFichier(cniFile.buffer, "medecins/cni"),
      cloudinaryService.televerserFichier(attestationFile.buffer, "medecins/attestations"),
      photoFile ? cloudinaryService.televerserFichier(photoFile.buffer, "medecins/photos") : Promise.resolve(null),
    ]);

    const motDePasseTemporaire = genererMotDePasseTemporaire();
    const motDePasseHash = await bcrypt.hash(motDePasseTemporaire, 10);

    try {
      const { utilisateur, medecin } = await prisma.$transaction(async (tx) => {
        const utilisateurCree = await tx.utilisateur.create({
          data: {
            nom,
            prenom,
            email,
            telephone: telephone || null,
            mot_de_passe_hash: motDePasseHash,
            role_id: role.role_id,
            pays_id,
            statut_compte: "actif",
            mot_de_passe_temporaire: true,
          },
        });

        const medecinCree = await tx.medecin.create({
          data: {
            utilisateur_id: utilisateurCree.utilisateur_id,
            specialite_id,
            numero_ordre,
            pays_exercice_id,
            ville_exercice_id,
            teleconsultation_activee: Boolean(teleconsultation_activee),
            tarif_indicatif,
            cni_url: resultatCni.nom,
            attestation_url: resultatAttestation.nom,
            photo_url: resultatPhoto ? resultatPhoto.nom : null,
            statut_verification: statutVerification,
          },
        });

        return { utilisateur: utilisateurCree, medecin: medecinCree };
      });

      return res.status(201).json({
        message: "Médecin créé.",
        medecin: avecUrlsFichiersMedecin(medecin),
        utilisateur: {
          utilisateur_id: utilisateur.utilisateur_id,
          nom: utilisateur.nom,
          prenom: utilisateur.prenom,
          email: utilisateur.email,
          mot_de_passe_temporaire: motDePasseTemporaire,
        },
      });
    } catch (errTransaction) {
      // Nettoyage best effort des fichiers déjà envoyés sur Cloudinary
      // si la création en base a échoué (ex. email déjà utilisé).
      await Promise.all([
        cloudinaryService.supprimerFichier(resultatCni.nom),
        cloudinaryService.supprimerFichier(resultatAttestation.nom),
        resultatPhoto ? cloudinaryService.supprimerFichier(resultatPhoto.nom) : Promise.resolve(),
      ]);

      if (errTransaction.code === "P2002") {
        const champ = errTransaction.meta?.target?.[0] || "champ unique";
        return res.status(409).json({ message: `Conflit : ${champ} déjà utilisé.` });
      }
      throw errTransaction;
    }
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/medecins
 * PUBLIQUE, mais désormais avec authentification OPTIONNELLE
 * (authentifierOptionnel dans medecin.routes.js) : un visiteur anonyme
 * ne reçoit toujours que nom/prenom (SELECTION_UTILISATEUR_PUBLIC),
 * mais un admin/superadmin connecté reçoit en plus email/téléphone
 * (SELECTION_UTILISATEUR_ADMIN) — nécessaire à l'écran back-office
 * "Tous les médecins". Ville/pays d'exercice sont désormais inclus
 * (libellé, pas seulement l'ID de la FK).
 * Filtres optionnels : ?specialite_id=...&specialite=...&ville_exercice_id=...&pays_exercice_id=...&recherche=...
 *   - specialite_id : filtre exact sur la FK (id de la table specialite).
 *   - specialite     : recherche par NOM de spécialité (relation), pour
 *                       les clients qui n'ont pas encore l'id sous la
 *                       main — ne fonctionne plus par égalité sur une
 *                       colonne texte, mais via le champ relationnel.
 * Affiche TOUTES les fiches médecin, quel que soit statut_verification
 * (pas de filtrage sur ce champ ici), triées de la plus récente à la
 * plus ancienne.
 */
export async function listerMedecins(req, res, next) {
  try {
    const { specialite_id, specialite, ville_exercice_id, pays_exercice_id, recherche } = req.query;

    const where = {};
    if (specialite_id) where.specialite_id = specialite_id;
    else if (specialite) where.specialite = { nom: { contains: specialite, mode: "insensitive" } };
    if (ville_exercice_id) where.ville_exercice_id = ville_exercice_id;
    if (pays_exercice_id) where.pays_exercice_id = pays_exercice_id;
    if (recherche) {
      where.utilisateur = {
        OR: [
          { nom: { contains: recherche, mode: "insensitive" } },
          { prenom: { contains: recherche, mode: "insensitive" } },
        ],
      };
    }

    const medecins = await prisma.medecin.findMany({
      where,
      include: {
        utilisateur: selectionUtilisateurSelonRole(req.utilisateur),
        specialite: SELECTION_SPECIALITE_PUBLIC,
        ville_exercice: SELECTION_VILLE_PUBLIC,
        pays_exercice: SELECTION_PAYS_PUBLIC,
      },
      orderBy: { date_creation: "desc" },
    });

    return res.status(200).json({ medecins: medecins.map(avecUrlsFichiersMedecin) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/medecins/:id
 * PUBLIQUE avec authentification optionnelle (mêmes règles que
 * listerMedecins ci-dessus : vue enrichie email/téléphone + ville/pays
 * d'exercice réservée à admin/superadmin). Consultation directe par ID
 * possible même hors "verifie" (pas de fuite d'info supplémentaire par
 * rapport à la liste), mais la fiche n'apparaît dans /medecins que
 * vérifiée.
 */
export async function obtenirMedecin(req, res, next) {
  try {
    const medecin = await prisma.medecin.findUnique({
      where: { medecin_id: req.params.id },
      include: {
        utilisateur: selectionUtilisateurSelonRole(req.utilisateur),
        specialite: SELECTION_SPECIALITE_PUBLIC,
        ville_exercice: SELECTION_VILLE_PUBLIC,
        pays_exercice: SELECTION_PAYS_PUBLIC,
      },
    });
    if (!medecin) {
      return res.status(404).json({ message: "Médecin introuvable." });
    }

    return res.status(200).json({ medecin: avecUrlsFichiersMedecin(medecin) });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/medecins/:id
 * Ouvert au médecin concerné (utilisateur_id déduit du token) ou à
 * admin/superadmin (voir en-tête medecin.routes.js).
 *   - Le médecin lui-même : peut modifier ses champs de fiche
 *     (CHAMPS_MODIFIABLES_MEDECIN) et/ou remplacer cni_url/attestation_url/
 *     photo_url (fichiers déjà téléversés par gererTeleversementMedecin
 *     dans req.files — voir upload.middleware.js). Contrairement à
 *     cni/attestation, la photo est optionnelle : son absence ne bloque
 *     rien. Il ne peut jamais choisir
 *     statut_verification lui-même : toute modification de sa fiche le
 *     repasse automatiquement à "en_cours" pour re-vérification.
 *   - admin/superadmin : peut en plus fixer statut_verification
 *     librement ; cela ne déclenche pas le repassage automatique à
 *     "en_cours".
 */
export async function modifierMedecin(req, res, next) {
  try {
    const medecin = await prisma.medecin.findUnique({ where: { medecin_id: req.params.id } });
    if (!medecin) {
      return res.status(404).json({ message: "Médecin introuvable." });
    }

    const estAdministrateur = estAdmin(req.utilisateur);
    const estProprietaire = req.utilisateur?.utilisateur_id === medecin.utilisateur_id;

    if (!estAdministrateur && !estProprietaire) {
      return res.status(403).json({ message: "Accès refusé : privilèges insuffisants." });
    }

    const donnees = {};

    for (const champ of CHAMPS_MODIFIABLES_MEDECIN) {
      if (req.body[champ] !== undefined) donnees[champ] = req.body[champ];
    }

    // nom/prenom/telephone : champs du compte utilisateur, distincts de
    // la fiche medecin — traités séparément et écrits sur `utilisateur`
    // plus bas (voir CHAMPS_MODIFIABLES_UTILISATEUR).
    const donneesUtilisateur = {};
    for (const champ of CHAMPS_MODIFIABLES_UTILISATEUR) {
      if (req.body[champ] !== undefined) donneesUtilisateur[champ] = req.body[champ];
    }

    // Pièces jointes remplacées à cette occasion (optionnelles ici,
    // voir gererTeleversementMedecin). On téléverse le remplaçant sur
    // Cloudinary et on nettoie l'ancien fichier (best effort) une fois
    // la mise à jour DB confirmée plus bas.
    let ancienCniNom = null;
    let ancienAttestationNom = null;
    let ancienPhotoNom = null;

    if (req.files?.cni?.[0]) {
      const resultat = await cloudinaryService.televerserFichier(req.files.cni[0].buffer, "medecins/cni");
      donnees.cni_url = resultat.nom;
      ancienCniNom = medecin.cni_url;
    }
    if (req.files?.attestation?.[0]) {
      const resultat = await cloudinaryService.televerserFichier(
        req.files.attestation[0].buffer,
        "medecins/attestations"
      );
      donnees.attestation_url = resultat.nom;
      ancienAttestationNom = medecin.attestation_url;
    }
    // photo : optionnelle, même règle de remplacement que cni/attestation
    // (nouveau fichier téléversé puis ancien nettoyé une fois la mise à
    // jour DB confirmée). photo_url étant nullable, il n'y a pas
    // d'"ancienne" valeur à nettoyer si le médecin n'en avait pas encore.
    if (req.files?.photo?.[0]) {
      const resultat = await cloudinaryService.televerserFichier(req.files.photo[0].buffer, "medecins/photos");
      donnees.photo_url = resultat.nom;
      ancienPhotoNom = medecin.photo_url;
    }

    if (estAdministrateur) {
      if (req.body.statut_verification !== undefined) {
        if (!STATUTS_VERIFICATION_MEDECIN.includes(req.body.statut_verification)) {
          return res.status(400).json({
            message: `statut_verification invalide. Valeurs acceptées : ${STATUTS_VERIFICATION_MEDECIN.join(", ")}.`,
          });
        }
        donnees.statut_verification = req.body.statut_verification;
      }
    } else if (Object.keys(donnees).length > 0 || Object.keys(donneesUtilisateur).length > 0) {
      // Le médecin modifie sa propre fiche (ou ses coordonnées) : repasse
      // en vérification.
      donnees.statut_verification = "en_cours";
    }

    if (Object.keys(donnees).length === 0 && Object.keys(donneesUtilisateur).length === 0) {
      return res.status(400).json({ message: "Aucune donnée valide à mettre à jour." });
    }

    // specialite_id référence désormais une véritable table (specialite) :
    // on vérifie qu'elle existe avant d'écrire la FK, plutôt que de
    // laisser une contrainte P2003 remonter en erreur générique.
    if (donnees.specialite_id !== undefined) {
      const specialiteExiste = await prisma.specialite.findUnique({
        where: { specialite_id: donnees.specialite_id },
      });
      if (!specialiteExiste) {
        return res.status(400).json({ message: "specialite_id invalide : spécialité introuvable." });
      }
    }

    // Écriture transactionnelle : la fiche medecin ET le compte
    // utilisateur (nom/prenom/telephone) peuvent être modifiés dans la
    // même requête — on les écrit ensemble pour éviter un état
    // incohérent si l'un des deux échoue.
    const [, medecinMisAJour] = await prisma.$transaction([
      ...(Object.keys(donneesUtilisateur).length > 0
        ? [
            prisma.utilisateur.update({
              where: { utilisateur_id: medecin.utilisateur_id },
              data: donneesUtilisateur,
            }),
          ]
        : [prisma.utilisateur.findUnique({ where: { utilisateur_id: medecin.utilisateur_id } })]),
      prisma.medecin.update({
        where: { medecin_id: req.params.id },
        data: donnees,
        // Ici (contrairement à listerMedecins/obtenirMedecin) l'accès a
        // déjà été restreint plus haut à estAdministrateur ||
        // estProprietaire : quiconque atteint ce point a le droit de
        // voir son propre email/téléphone, pas seulement un admin.
        include: {
          utilisateur: SELECTION_UTILISATEUR_ADMIN,
          specialite: SELECTION_SPECIALITE_PUBLIC,
          ville_exercice: SELECTION_VILLE_PUBLIC,
          pays_exercice: SELECTION_PAYS_PUBLIC,
        },
      }),
    ]);

    // Nettoyage best effort des anciens fichiers remplacés.
    await Promise.all([
      ancienCniNom ? cloudinaryService.supprimerFichier(ancienCniNom) : Promise.resolve(),
      ancienAttestationNom ? cloudinaryService.supprimerFichier(ancienAttestationNom) : Promise.resolve(),
      ancienPhotoNom ? cloudinaryService.supprimerFichier(ancienPhotoNom) : Promise.resolve(),
    ]);

    return res.status(200).json({
      message: "Fiche médecin mise à jour.",
      medecin: avecUrlsFichiersMedecin(medecinMisAJour),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/medecins/:id
 * Réservé à superadmin (route déjà verrouillée par
 * autoriser("superadmin")). Avis, abonnements, rendez-vous et
 * ordonnances référencent cette fiche (pas de cascade en base) : la
 * suppression échoue proprement si des dépendances existent encore.
 */
export async function supprimerMedecin(req, res, next) {
  try {
    const medecin = await prisma.medecin.findUnique({ where: { medecin_id: req.params.id } });
    if (!medecin) {
      return res.status(404).json({ message: "Médecin introuvable." });
    }

    await prisma.medecin.delete({ where: { medecin_id: req.params.id } });
    return res.status(200).json({ message: "Fiche médecin supprimée." });
  } catch (err) {
    if (err.code === "P2003") {
      return res.status(409).json({
        message:
          "Impossible de supprimer ce médecin : des avis, abonnements, rendez-vous ou ordonnances y sont encore rattachés.",
      });
    }
    next(err);
  }
}

/* ===================================================================
 * Spécialités médicales (référentiel)
 *
 * Table de référence autonome (même patron que Langue/Devise/Pays/
 * Ville) : un médecin est RATTACHÉ à une spécialité via specialite_id
 * (FK), il ne porte plus lui-même le libellé. Lecture publique,
 * écriture réservée à admin/superadmin (voir medecin.routes.js).
 * =================================================================== */

/**
 * GET /api/specialites
 * PUBLIQUE. Filtre optionnel : ?recherche=... (sur le nom).
 */
export async function listerSpecialites(req, res, next) {
  try {
    const { recherche } = req.query;

    const where = {};
    if (recherche) where.nom = { contains: recherche, mode: "insensitive" };

    const specialites = await prisma.specialite.findMany({
      where,
      orderBy: { nom: "asc" },
    });

    return res.status(200).json({ specialites });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/specialites/:id
 * PUBLIQUE.
 */
export async function obtenirSpecialite(req, res, next) {
  try {
    const specialite = await prisma.specialite.findUnique({
      where: { specialite_id: req.params.id },
    });
    if (!specialite) {
      return res.status(404).json({ message: "Spécialité introuvable." });
    }

    return res.status(200).json({ specialite });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/specialites
 * Réservé à admin/superadmin. Champs : nom (obligatoire, unique),
 * description (optionnel).
 */
export async function creerSpecialite(req, res, next) {
  try {
    const { nom, description } = req.body;

    if (!nom) {
      return res.status(400).json({ message: "Le champ nom est obligatoire." });
    }

    const specialite = await prisma.specialite.create({
      data: { nom, description: description || null },
    });

    return res.status(201).json({ message: "Spécialité créée.", specialite });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ message: "Une spécialité avec ce nom existe déjà." });
    }
    next(err);
  }
}

/**
 * PUT /api/specialites/:id
 * Réservé à admin/superadmin. Champs modifiables : nom, description.
 */
export async function modifierSpecialite(req, res, next) {
  try {
    const specialite = await prisma.specialite.findUnique({
      where: { specialite_id: req.params.id },
    });
    if (!specialite) {
      return res.status(404).json({ message: "Spécialité introuvable." });
    }

    const donnees = {};
    if (req.body.nom !== undefined) donnees.nom = req.body.nom;
    if (req.body.description !== undefined) donnees.description = req.body.description;

    if (Object.keys(donnees).length === 0) {
      return res.status(400).json({ message: "Aucune donnée valide à mettre à jour." });
    }

    const specialiteMiseAJour = await prisma.specialite.update({
      where: { specialite_id: req.params.id },
      data: donnees,
    });

    return res.status(200).json({ message: "Spécialité mise à jour.", specialite: specialiteMiseAJour });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ message: "Une spécialité avec ce nom existe déjà." });
    }
    next(err);
  }
}

/**
 * DELETE /api/specialites/:id
 * Réservé à superadmin. Des fiches médecin peuvent référencer cette
 * spécialité (specialite_id, pas de cascade en base) : la suppression
 * échoue proprement si des médecins y sont encore rattachés.
 */
export async function supprimerSpecialite(req, res, next) {
  try {
    const specialite = await prisma.specialite.findUnique({
      where: { specialite_id: req.params.id },
    });
    if (!specialite) {
      return res.status(404).json({ message: "Spécialité introuvable." });
    }

    await prisma.specialite.delete({ where: { specialite_id: req.params.id } });
    return res.status(200).json({ message: "Spécialité supprimée." });
  } catch (err) {
    if (err.code === "P2003") {
      return res.status(409).json({
        message: "Impossible de supprimer cette spécialité : des médecins y sont encore rattachés.",
      });
    }
    next(err);
  }
}