// src/components/medecin.jsx
//
// Page "Annuaire — Médecins", calquée sur Pharmacie.jsx (même design
// system APS / Bootstrap 5, mêmes conventions de nommage en français)
// et branchée sur medecinService.js.
//
// Écarts assumés avec Pharmacie.jsx, pour rester fidèle à ce que
// medecin.routes.js documente (voir les commentaires détaillés déjà
// présents dans medecinService.js) :
//
//   - CRÉATION RÉSERVÉE À L'ADMIN/SUPERADMIN : medecinService.js expose
//     creerMedecin() → POST /medecins, qui crée EN MÊME TEMPS le compte
//     utilisateur du médecin (rôle "medecin", mot de passe temporaire
//     généré côté serveur) et sa fiche annuaire. cni et attestation
//     sont obligatoires à la création (voir creerMedecin dans
//     medecinService.js). Le bouton « Nouvelle fiche » n'est donc
//     visible que pour un admin/superadmin, et le mot de passe
//     temporaire renvoyé une seule fois par le backend
//     (`utilisateur.mot_de_passe_temporaire`) est affiché dans une
//     modale dédiée juste après la création, à communiquer au médecin
//     (il devra le changer à sa première connexion) — il n'est plus
//     jamais consultable ensuite.
//
//   - Droit de modification à deux visages (contrairement à
//     Pharmacie, ouvert à tout connecté) : d'après le commentaire de
//     medecinService.js, PUT est réservé au « médecin propriétaire
//     (déduit du token) ou admin/superadmin ». On ne sait pas
//     précisément ce que renvoie /auth/me pour relier un compte à sa
//     fiche médecin : estProprietaireFiche() ci-dessous essaie donc
//     plusieurs formes plausibles (medecin.utilisateur_id === id du
//     compte connecté, OU user.medecin_id === medecin.medecin_id),
//     par tolérance plutôt que par certitude — à ajuster une fois le
//     contrôleur réel disponible.
//
//   - Suppression : superadmin uniquement, comme Pharmacie.
//
//   - Pas de photo de profil : seuls deux fichiers existent côté
//     backend (cni_url, attestation_url — voir CHAMPS_FICHIERS_MEDECIN
//     dans medecinService.js). Les cartes et la fiche détail utilisent
//     donc un avatar générique (icône) plutôt qu'une image de
//     couverture.
//
//   - Champs de la fiche (nom, prenom, numero_ordre, adresse_cabinet,
//     geolocalisation…) : non documentés dans medecin.routes.js
//     au-delà de cni_url/attestation_url et des filtres de
//     listerMedecins (pays_id, ville_id, specialite_id,
//     statut_verification, recherche) — HYPOTHÈSES par analogie avec
//     Pharmacie/StructureSante, à ajuster une fois le contrôleur réel
//     disponible.
//
//   - Spécialité : PAS un texte libre — une vraie entité référentiel
//     (table Specialite), reliée par FK medecin.specialite_id (voir
//     medecinService.js, section "Spécialités médicales"). La liste
//     déroulante du formulaire et le filtre de la page sont peuplés
//     via listerSpecialites(), avec la même règle d'accès que
//     Langue/Devise/Pays/Ville : lecture publique, création/édition
//     admin/superadmin, suppression superadmin. Une modale dédiée
//     "Gérer les spécialités" (accessible aux admin/superadmin depuis
//     l'en-tête de page) couvre le CRUD complet du référentiel, en
//     plus de son usage dans le formulaire médecin.
//     note_moyenne / nombre_avis sont affichés seulement
//     s'ils sont présents dans la réponse (aucun appel supplémentaire
//     à avis-medecin n'est fait ici : cette page ne couvre que la
//     fiche annuaire elle-même, pas les avis/abonnements/rendez-vous/
//     ordonnances, qui relèvent vraisemblablement d'écrans dédiés).
//
// Styles de la fiche détail : extraits dans ./medecin.css (contrairement
// à Pharmacie.jsx qui les injectait en ligne via une balise <style>),
// classes toujours préfixées "aps-fiche-" / "aps-accordion-" /
// "aps-medecin-" pour ne pas entrer en collision avec admin.css.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Chart from "chart.js/auto";
import { useAuth } from "../context/AuthContext";
import {
  creerMedecin,
  listerMedecins,
  modifierMedecin,
  supprimerMedecin,
  // Actions explicites de bascule de statut (routes PATCH dédiées,
  // admin/superadmin uniquement) — préférées à modifierMedecin() pour
  // ce cas précis : pas besoin de repasser tout le FormData/fichiers
  // pour changer uniquement le statut de publication (voir
  // medecinService.js). suspendreMedecin() suspend en plus le COMPTE
  // utilisateur lié (bloque la connexion du médecin), pas seulement la
  // fiche annuaire — d'où le message d'avertissement dédié dans la
  // modale de confirmation ci-dessous.
  publierMedecin,
  suspendreMedecin,
  listerPays,
  listerVilles,
  STATUTS_VERIFICATION_MEDECIN,
  // Spécialités médicales (référentiel) — table dédiée (Specialite),
  // reliée à la fiche médecin via specialite_id (FK). Lecture publique,
  // écriture admin/superadmin, suppression superadmin (voir
  // medecinService.js, section "Spécialités médicales").
  listerSpecialites,
  creerSpecialite,
  modifierSpecialite,
  supprimerSpecialite,
  // Vérification d'appartenance au Tableau de l'Ordre National des
  // Médecins du Cameroun (ONMC) — POST public /medecins/verifier-ordre
  // (voir medecinService.js). Utilisée ici depuis la fiche détail pour
  // vérifier a posteriori un numero_ordre déjà enregistré.
  verifierAppartenanceOrdre,
} from "../services/medecinService.js";
// Moyens de paiement du médecin (Mobile Money / compte bancaire) —
// lecture seule ici : simple liste affichée dans la fiche détail.
// La gestion (ajout/édition/suppression) reste dans son propre écran
// (moyenPaiementService.js, mêmes fonctions que celles utilisées par
// MoyenPaiement.jsx : listerMobileMoneyMedecin / listerComptesBancairesMedecin).
import * as moyenPaiementService from "../services/moyenPaiementService.js";
import "../assets/style/medecin.css";

const STATUT_META = {
  publie: { libelle: "Publié", badge: "is-success", detailIcone: "fa-circle-check" },
  en_cours: { libelle: "En cours", badge: "is-warning", detailIcone: "fa-hourglass-half" },
  non_publie: { libelle: "Non publié", badge: "is-danger", detailIcone: "fa-circle-xmark" },
};

const COULEURS_GRAPHIQUE = {
  primary: "#1C8FE0", teal: "#17B6C4", success: "#1B8A4B",
  warning: "#B7791F", danger: "#E5484D", violet: "#8B5CF6",
  text500: "#6B7280", border: "#E7EAF0",
};

// Formulaire partagé CRÉATION + ÉDITION. `medecin_id` fait office de
// discriminant de mode dans tout le composant : null/undefined =>
// création (ouvrirCreation()), sinon édition (ouvrirEdition() le
// remplit avec la fiche sélectionnée).
//
// `email` n'a de sens qu'à la création (compte utilisateur "medecin"
// créé en même temps que la fiche par creerMedecin, voir en-tête du
// fichier) : ignoré en édition, jamais envoyé par modifierMedecin.
//
// IMPORTANT — clés de fichiers : `cni` / `attestation`, PAS `cni_url` /
// `attestation_url`. Ce sont ces noms-là que construireFormDataMedecin
// (medecinService.js, CHAMPS_FICHIERS_MEDECIN) reconnaît comme des
// fichiers à extraire vers le FormData multipart ; `cni_url` /
// `attestation_url` sont uniquement les noms des colonnes déjà
// enregistrées en base, utilisées ici pour affichage (voir
// fichiersExistants) — jamais comme clé de formulaire éditable.
// IMPORTANT — pays_id / ville_id vs pays_exercice_id / ville_exercice_id :
// le commentaire de creerMedecin dans medecinService.js confirme que la
// FICHE médecin (celle affichée/éditée ici) utilise pays_exercice_id /
// ville_exercice_id — PAS pays_id/ville_id, qui eux ne concernent que
// le COMPTE UTILISATEUR créé en même temps (compte non géré par ce
// formulaire au-delà de l'email). D'où ces noms de champs, et
// `pays_exercice`/`ville_exercice` (pas `pays`/`ville`) pour la relation
// jointe attendue dans la réponse de l'API (GET /medecins) plus bas.
// ⚠️ NON CORRIGÉ — adresse_cabinet / latitude / longitude :
// contrairement à nom/prenom/telephone/ville/pays (corrigés dans cette
// révision), ces 3 champs n'apparaissent PAS dans la liste exhaustive
// des colonnes du modèle Medecin recopiée en en-tête de
// medecin.controller.js (medecin { medecin_id, utilisateur_id,
// specialite_id, numero_ordre, statut_verification, pays_exercice_id,
// ville_exercice_id, teleconsultation_activee, tarif_indicatif,
// cni_url, attestation_url, photo_url, date_creation }). Le formulaire
// les envoie bien, mais creerMedecin/modifierMedecin ne les lisent
// jamais dans req.body (ils ne font pas partie de
// CHAMPS_MODIFIABLES_MEDECIN) : ils sont donc silencieusement ignorés
// à l'écriture ET absents de la lecture. Il ne s'agit pas d'un bug de
// mapping réparable côté front comme les 3 champs ci-dessus — cela
// nécessite soit d'ajouter ces colonnes à schema.prisma (migration +
// lecture/écriture dans le contrôleur), soit de retirer ces champs du
// formulaire si la fonctionnalité "localisation du cabinet" n'est pas
// encore prévue.
const FORMULAIRE_VIDE = {
  medecin_id: null,
  email: "",
  nom: "", prenom: "", specialite_id: "", numero_ordre: "",
  telephone: "", statut_verification: "non_publie",
  pays_exercice_id: "", ville_exercice_id: "", adresse_cabinet: "",
  latitude: "", longitude: "",
  // Obligatoires en base (Medecin.teleconsultation_activee /
  // Medecin.tarif_indicatif, voir schema.prisma — aucun des deux
  // n'est nullable) : initialisés ici pour ne jamais être `undefined`
  // au moment de l'envoi (le contrôleur rejette explicitement
  // `undefined`, contrairement à `false`/chaîne vide).
  teleconsultation_activee: false, tarif_indicatif: "",
  // biographie : NOT NULL en base (schema.prisma) — obligatoire à la
  // création ET en édition (le contrôleur rejette une chaîne vide ou
  // absente, voir medecin.controller.js). Initialisée ici pour ne
  // jamais être `undefined` au moment de l'envoi.
  biographie: "",
  // À la création : cni/attestation sont OBLIGATOIRES (voir creerMedecin
  // dans medecinService.js). En édition : toujours optionnels — un
  // champ laissé vide conserve le fichier déjà enregistré.
  // `photo` (photo de profil) est TOUJOURS optionnelle, même à la
  // création (Medecin.photo_url, nullable — voir medecinService.js).
  cni: null, attestation: null, photo: null,
};

// Formulaire partagé CRÉATION + ÉDITION du référentiel Spécialité
// (modale "Gérer les spécialités"). `specialite_id` fait office de
// discriminant de mode, comme FORMULAIRE_VIDE ci-dessus : null/undefined
// => creerSpecialite(), sinon => modifierSpecialite().
// `description` est une hypothèse (non confirmée par medecin.routes.js,
// voir medecinService.js) — envoyée seulement si renseignée.
const SPECIALITE_VIDE = { specialite_id: null, nom: "", description: "" };

const TAILLES_PAGE = [8, 16, 32];

/**
 * Extrait un nom de rôle (en minuscules) depuis un objet utilisateur,
 * quelle que soit la forme exacte sous laquelle il a été stocké après
 * connexion (chaîne directe, objet imbriqué, tableau de rôles…).
 * Tolérant par design : mieux vaut essayer plusieurs formes plausibles
 * que de casser silencieusement les droits d'un superadmin réel.
 * (Identique à la version utilisée dans Pharmacie.jsx.)
 */
function extraireNomRole(objetUtilisateur) {
  if (!objetUtilisateur || typeof objetUtilisateur !== "object") return null;

  const candidats = [
    objetUtilisateur.role,
    objetUtilisateur.role?.nom,
    objetUtilisateur.role?.libelle,
    objetUtilisateur.role_nom,
    objetUtilisateur.type_compte,
    objetUtilisateur.utilisateur?.role,
    objetUtilisateur.roles?.[0],
    objetUtilisateur.roles?.[0]?.nom,
  ];

  for (const candidat of candidats) {
    if (typeof candidat === "string" && candidat.trim()) {
      return candidat.trim().toLowerCase();
    }
  }
  return null;
}

/**
 * Extrait un identifiant de compte utilisateur, sous une des formes
 * plausibles renvoyées par /auth/me (non documenté). Utilisé
 * uniquement pour estProprietaireFiche() ci-dessous.
 */
function extraireIdUtilisateur(objetUtilisateur) {
  if (!objetUtilisateur || typeof objetUtilisateur !== "object") return null;

  const candidats = [
    objetUtilisateur.utilisateur_id,
    objetUtilisateur.id,
    objetUtilisateur.user_id,
    objetUtilisateur.utilisateur?.utilisateur_id,
  ];

  for (const candidat of candidats) {
    if (candidat !== undefined && candidat !== null && candidat !== "") return candidat;
  }
  return null;
}

/**
 * Dérive { role, utilisateur } depuis AuthContext (useAuth()), seule
 * source de vérité de l'authentification côté front (cf.
 * AuthContext.jsx) : le refresh token vit dans un cookie httpOnly
 * (jamais lu en JS), l'access token vit en mémoire (jamais persisté),
 * et `user` est restauré au montage via /auth/refresh + /auth/me.
 */
function useRoleUtilisateur() {
  const { user } = useAuth();
  return {
    role: extraireNomRole(user),
    utilisateur: user,
  };
}

/**
 * Un médecin peut modifier sa PROPRE fiche (cf. commentaire PUT dans
 * medecinService.js) ; on ne sait pas précisément comment un compte se
 * rattache à sa fiche médecin dans la réponse /auth/me, donc on essaie
 * deux formes plausibles avant de conclure que non :
 *   1) la fiche connaît l'utilisateur : medecin.utilisateur_id
 *   2) l'utilisateur connaît sa fiche : utilisateur.medecin_id
 * HYPOTHÈSE à confirmer avec le contrôleur réel.
 */
function estProprietaireFiche(medecin, utilisateur) {
  if (!medecin || !utilisateur) return false;

  const idUtilisateur = extraireIdUtilisateur(utilisateur);
  if (
    idUtilisateur !== null &&
    medecin.utilisateur_id !== undefined &&
    medecin.utilisateur_id !== null &&
    String(medecin.utilisateur_id) === String(idUtilisateur)
  ) {
    return true;
  }

  if (
    utilisateur.medecin_id !== undefined &&
    utilisateur.medecin_id !== null &&
    medecin.medecin_id !== undefined &&
    medecin.medecin_id !== null &&
    String(utilisateur.medecin_id) === String(medecin.medecin_id)
  ) {
    return true;
  }

  return false;
}

/**
 * Aperçu embarqué d'une pièce justificative (image OU PDF) directement
 * dans la fiche détail, sans quitter la modale. On s'appuie sur
 * <object>, qui laisse le navigateur détecter le type réel via
 * l'en-tête Content-Type renvoyé par le serveur plutôt que de deviner
 * depuis l'extension de l'URL (souvent absente/peu fiable côté API).
 * (Identique à la version utilisée dans Pharmacie.jsx.)
 */
function ApercuPieceJustificative({ url, label }) {
  const [enErreur, setEnErreur] = useState(false);

  if (!url) return null;

  if (enErreur) {
    return (
      <div className="aps-text-muted aps-accordion-apercu-repli">
        Aperçu indisponible pour ce fichier.{" "}
        <a href={url} target="_blank" rel="noreferrer">Ouvrir le fichier dans un nouvel onglet</a>
      </div>
    );
  }

  return (
    <object
      data={url}
      aria-label={label}
      className="aps-accordion-apercu-objet"
      onError={() => setEnErreur(true)}
    >
      <div className="aps-text-muted aps-accordion-apercu-repli">
        Aperçu indisponible pour ce fichier.{" "}
        <a href={url} target="_blank" rel="noreferrer">Ouvrir le fichier dans un nouvel onglet</a>
      </div>
    </object>
  );
}

export default function Medecin() {
  const { role, utilisateur } = useRoleUtilisateur();
  // Rôle "admin" non confirmé (Pharmacie.jsx ne vérifie que
  // "superadmin", faute d'avoir un rôle intermédiaire à distinguer
  // pour son propre cas d'usage). Ici le commentaire de
  // medecinService.js parle explicitement d'« admin/superadmin » pour
  // le PUT : on regroupe donc les deux — à ajuster si la taxonomie
  // réelle des rôles diffère (ex. "admin_pays").
  const estAdmin = role === "admin" || role === "superadmin";
  const peutSupprimer = role === "superadmin";

  function peutModifierFiche(medecin) {
    return estAdmin || estProprietaireFiche(medecin, utilisateur);
  }

  /**
   * Détermine l'action de bascule de statut proposée pour une fiche :
   * "publie" => on ne peut que suspendre ; "non_publie"/"en_cours" =>
   * on ne peut que publier. Un seul bouton contextuel plutôt que deux
   * boutons distincts (cf. publierMedecin/suspendreMedecin dans
   * medecinService.js, toutes deux admin/superadmin uniquement).
   */
  function determinerActionStatut(medecin) {
    return medecin?.statut_verification === "publie" ? "suspendre" : "publier";
  }

  // Liste filtrée (grille de la page)
  const [medecins, setMedecins] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  // Jeu complet non filtré, pour les KPI et graphiques globaux
  const [statistiques, setStatistiques] = useState([]);

  const [filtres, setFiltres] = useState({
    recherche: "", statut_verification: "", specialite_id: "", pays_exercice_id: "", ville_exercice_id: "",
  });
  const [filtresAppliques, setFiltresAppliques] = useState(filtres);

  const [pays, setPays] = useState([]);
  const [villesFiltre, setVillesFiltre] = useState([]);
  const [villesFormulaire, setVillesFormulaire] = useState([]);

  // Référentiel des spécialités (table Specialite, GET /specialites —
  // public) : sert à la fois au filtre de la page et au <select> du
  // formulaire de création/édition d'une fiche médecin.
  const [specialitesReferentiel, setSpecialitesReferentiel] = useState([]);
  const [chargementSpecialites, setChargementSpecialites] = useState(true);
  const [erreurSpecialites, setErreurSpecialites] = useState(null);

  const [tri, setTri] = useState("nom");
  const [page, setPage] = useState(1);
  const [parPage, setParPage] = useState(8);

  const [medecinSelectionne, setMedecinSelectionne] = useState(null);
  // Pièces justificatives repliées par défaut dans la fiche détail ;
  // clé = id de la pièce ("cni" / "attestation"), valeur = dépliée ou
  // non. Réinitialisé à chaque changement de médecin affiché.
  const [piecesOuvertes, setPiecesOuvertes] = useState({});

  // Moyens de paiement du médecin affiché (Mobile Money + compte
  // bancaire) — simple liste en lecture seule dans la fiche détail,
  // rechargée à chaque changement de médecin sélectionné.
  const [moyensPaiement, setMoyensPaiement] = useState({ mobileMoney: [], comptesBancaires: [] });
  const [moyensPaiementChargement, setMoyensPaiementChargement] = useState(false);
  const [moyensPaiementErreur, setMoyensPaiementErreur] = useState(null);

  // Vérification ONMC déclenchée depuis la fiche détail (bouton dédié,
  // pas automatique à l'ouverture — POST /medecins/verifier-ordre reste
  // volontairement une action explicite, voir onmcVerificationService.js
  // pour le coût de l'appel côté serveur, piloté par navigateur headless).
  // `resultat` = null tant qu'aucune vérification n'a été lancée pour la
  // fiche actuellement affichée, sinon { appartient_ordre, nom_complet?,
  // numero_ordre_onmc? }. `erreur` distingue explicitement le cas 502
  // (vérification externe indisponible) d'un numéro simplement introuvable
  // (ce dernier cas est un `resultat` normal, pas une erreur — voir
  // medecinService.js).
  const [verificationOrdre, setVerificationOrdre] = useState({
    enCours: false,
    resultat: null,
    erreur: null,
  });

  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [formulaire, setFormulaire] = useState(FORMULAIRE_VIDE);
  // Fichiers déjà en ligne pour la fiche en cours d'édition (URLs
  // Cloudinary renvoyées par le backend) — affichés à titre indicatif
  // pour que l'utilisateur sache ce qu'il remplace (ou pas) s'il ne
  // re-sélectionne pas de nouveau fichier.
  const [fichiersExistants, setFichiersExistants] = useState(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreurFormulaire, setErreurFormulaire] = useState(null);
  // Suivi explicite : l'utilisateur a-t-il touché la case
  // "téléconsultation" pendant CETTE session d'édition ? Si non, on
  // n'envoie PAS teleconsultation_activee au serveur — celui-ci
  // n'écrase alors rien et conserve la valeur déjà enregistrée en
  // base lors de la création du compte (voir soumettreFormulaire).
  // Toujours `true` en création (ouvrirCreation) : le champ est
  // obligatoire à la création, donc toujours envoyé.
  const [teleconsultationModifieeParUtilisateur, setTeleconsultationModifieeParUtilisateur] = useState(true);

  const [cibleSuppression, setCibleSuppression] = useState(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  // Bascule de statut (publier/suspendre), admin/superadmin uniquement
  // (voir publierMedecin/suspendreMedecin dans medecinService.js).
  // `cibleChangementStatut` = { medecin, action } où action vaut
  // "publier" ou "suspendre" ; null tant qu'aucune confirmation n'est
  // demandée. L'action proposée dépend du statut courant de la fiche
  // (voir determinerActionStatut ci-dessous).
  const [cibleChangementStatut, setCibleChangementStatut] = useState(null);
  const [changementStatutEnCours, setChangementStatutEnCours] = useState(false);

  /* ─── Gestion des spécialités (référentiel) ────────────────────
       Modale dédiée, indépendante de la modale fiche médecin :
       liste + formulaire d'ajout/édition + confirmation de
       suppression, sur le même patron que Langue/Devise/Pays/Ville. */
  const [modaleSpecialitesOuverte, setModaleSpecialitesOuverte] = useState(false);
  const [formulaireSpecialite, setFormulaireSpecialite] = useState(SPECIALITE_VIDE);
  const [envoiSpecialiteEnCours, setEnvoiSpecialiteEnCours] = useState(false);
  const [erreurFormulaireSpecialite, setErreurFormulaireSpecialite] = useState(null);
  const [cibleSuppressionSpecialite, setCibleSuppressionSpecialite] = useState(null);
  const [suppressionSpecialiteEnCours, setSuppressionSpecialiteEnCours] = useState(false);

  // Résultat de la dernière création réussie : { nomComplet, email,
  // motDePasseTemporaire }. N'existe qu'un court instant, juste après
  // creerMedecin() — le backend ne renvoie ce mot de passe qu'une seule
  // fois (voir en-tête du fichier), donc affiché dans une modale dédiée
  // que l'admin doit fermer explicitement après l'avoir communiqué.
  const [compteMedecinCree, setCompteMedecinCree] = useState(null);

  const chargerMedecins = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const resultat = await listerMedecins(filtresAppliques);
      setMedecins(resultat);
      setPage(1);
    } catch (err) {
      setErreur(err.message || "Impossible de charger les médecins.");
    } finally {
      setChargement(false);
    }
  }, [filtresAppliques]);

  useEffect(() => { chargerMedecins(); }, [chargerMedecins]);

  // Referme tous les panneaux "pièce justificative" quand on ouvre la
  // fiche d'un autre médecin.
  useEffect(() => { setPiecesOuvertes({}); }, [medecinSelectionne?.medecin_id]);

  // Charge la liste des moyens de paiement du médecin dès que sa fiche
  // est ouverte (et vide la liste quand aucune fiche n'est ouverte).
  useEffect(() => {
    const medecinId = medecinSelectionne?.medecin_id;
    if (!medecinId) {
      setMoyensPaiement({ mobileMoney: [], comptesBancaires: [] });
      setMoyensPaiementErreur(null);
      return;
    }
    let annule = false;
    setMoyensPaiementChargement(true);
    setMoyensPaiementErreur(null);
    Promise.all([
      moyenPaiementService.listerMobileMoneyMedecin(medecinId),
      moyenPaiementService.listerComptesBancairesMedecin(medecinId),
    ])
      .then(([mobileMoney, comptesBancaires]) => {
        if (annule) return;
        setMoyensPaiement({ mobileMoney: mobileMoney || [], comptesBancaires: comptesBancaires || [] });
      })
      .catch((err) => {
        if (annule) return;
        setMoyensPaiementErreur(err.message || "Impossible de charger les moyens de paiement.");
      })
      .finally(() => {
        if (!annule) setMoyensPaiementChargement(false);
      });
    return () => { annule = true; };
  }, [medecinSelectionne?.medecin_id]);

  // Réinitialise le résultat de vérification ONMC quand on ouvre la
  // fiche d'un autre médecin (ou qu'on referme la fiche) — on ne veut
  // jamais afficher le résultat d'un précédent médecin sur la fiche
  // suivante, même brièvement.
  useEffect(() => {
    setVerificationOrdre({ enCours: false, resultat: null, erreur: null });
  }, [medecinSelectionne?.medecin_id]);

  async function lancerVerificationOrdre() {
    if (!medecinSelectionne?.numero_ordre) return;
    setVerificationOrdre({ enCours: true, resultat: null, erreur: null });
    try {
      const reponse = await verifierAppartenanceOrdre(medecinSelectionne.numero_ordre);
      setVerificationOrdre({ enCours: false, resultat: reponse, erreur: null });
    } catch (err) {
      // 502 = vérification externe indisponible (site ONMC injoignable,
      // timeout…) — à ne surtout pas confondre avec un numéro introuvable
      // au tableau (celui-ci arrive en 200 avec appartient_ordre=false et
      // suit donc la branche `resultat`, pas `erreur`).
      setVerificationOrdre({
        enCours: false,
        resultat: null,
        erreur:
          err.status === 502
            ? "La vérification auprès de l'ONMC a échoué. Cela ne signifie pas que le médecin n'appartient pas à l'Ordre — réessayez dans un instant."
            : err.message || "Impossible de lancer la vérification.",
      });
    }
  }

  useEffect(() => {
    listerMedecins({}).then(setStatistiques).catch(() => setStatistiques([]));
  }, [medecins]);

  useEffect(() => {
    listerPays().then(setPays).catch(() => setPays([]));
  }, []);

  useEffect(() => {
    if (!filtres.pays_exercice_id) { setVillesFiltre([]); return; }
    listerVilles(filtres.pays_exercice_id).then(setVillesFiltre).catch(() => setVillesFiltre([]));
  }, [filtres.pays_exercice_id]);

  useEffect(() => {
    if (!formulaire.pays_exercice_id) { setVillesFormulaire([]); return; }
    listerVilles(formulaire.pays_exercice_id).then(setVillesFormulaire).catch(() => setVillesFormulaire([]));
  }, [formulaire.pays_exercice_id]);

  function modifierFiltre(champ, valeur) {
    setFiltres((p) => ({ ...p, [champ]: valeur, ...(champ === "pays_exercice_id" ? { ville_exercice_id: "" } : {}) }));
  }

  function appliquerFiltres() { setFiltresAppliques(filtres); }

  function reinitialiserFiltres() {
    const vide = { recherche: "", statut_verification: "", specialite_id: "", pays_exercice_id: "", ville_exercice_id: "" };
    setFiltres(vide);
    setFiltresAppliques(vide);
  }

  /* ─── Référentiel des spécialités (GET /specialites, public) ───
       Chargé une fois au montage, et rechargé après chaque création /
       modification / suppression depuis la modale "Gérer les
       spécialités" (voir soumettreFormulaireSpecialite /
       confirmerSuppressionSpecialite) pour que le filtre de la page et
       le <select> du formulaire médecin restent à jour. */
  const chargerSpecialites = useCallback(async () => {
    setChargementSpecialites(true);
    setErreurSpecialites(null);
    try {
      const resultat = await listerSpecialites();
      setSpecialitesReferentiel(
        [...resultat].sort((a, b) => (a.nom || "").localeCompare(b.nom || ""))
      );
    } catch (err) {
      setErreurSpecialites(err.message || "Impossible de charger les spécialités.");
      setSpecialitesReferentiel([]);
    } finally {
      setChargementSpecialites(false);
    }
  }, []);

  useEffect(() => { chargerSpecialites(); }, [chargerSpecialites]);

  /* ─── Tri + pagination côté client ─────────────────────────── */

  const medecinsTries = useMemo(() => {
    const copie = [...medecins];
    if (tri === "statut") {
      const ordre = { publie: 0, en_cours: 1, non_publie: 2 };
      copie.sort((a, b) => (ordre[a.statut_verification] ?? 9) - (ordre[b.statut_verification] ?? 9));
    } else if (tri === "specialite") {
      copie.sort((a, b) => (a.specialite?.nom || "").localeCompare(b.specialite?.nom || ""));
    } else {
      copie.sort((a, b) => (a.nom || "").localeCompare(b.nom || ""));
    }
    return copie;
  }, [medecins, tri]);

  const nbPages = Math.max(1, Math.ceil(medecinsTries.length / parPage));
  const pageCourante = Math.min(page, nbPages);
  const medecinsPage = medecinsTries.slice((pageCourante - 1) * parPage, pageCourante * parPage);
  const debutAffichage = medecinsTries.length === 0 ? 0 : (pageCourante - 1) * parPage + 1;
  const finAffichage = Math.min(pageCourante * parPage, medecinsTries.length);

  /* ─── KPI + graphiques (jeu complet non filtré) ────────────── */

  const kpi = useMemo(() => {
    const total = statistiques.length;
    const publie = statistiques.filter((m) => m.statut_verification === "publie").length;
    const enCours = statistiques.filter((m) => m.statut_verification === "en_cours").length;
    const nonPublie = statistiques.filter((m) => m.statut_verification === "non_publie").length;
    return { total, publie, enCours, nonPublie };
  }, [statistiques]);

  const refGraphStatut = useRef(null);
  const refGraphSpecialite = useRef(null);
  const instancesGraph = useRef({});

  useEffect(() => {
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = COULEURS_GRAPHIQUE.text500;
  }, []);

  useEffect(() => {
    if (!refGraphStatut.current) return;
    instancesGraph.current.statut?.destroy();
    instancesGraph.current.statut = new Chart(refGraphStatut.current, {
      type: "polarArea",
      data: {
        labels: ["Publié", "En cours", "Non publié"],
        datasets: [{
          data: [kpi.publie, kpi.enCours, kpi.nonPublie],
          backgroundColor: ["rgba(27,138,75,0.75)", "rgba(183,121,31,0.75)", "rgba(229,72,77,0.75)"],
          borderColor: "#fff", borderWidth: 2,
        }],
      },
      options: {
        plugins: { legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "circle", padding: 16 } } },
        scales: { r: { grid: { color: COULEURS_GRAPHIQUE.border }, ticks: { display: false } } },
      },
    });
  }, [kpi]);

  useEffect(() => {
    if (!refGraphSpecialite.current) return;
    const parSpecialite = {};
    statistiques.forEach((m) => {
      const nom = m.specialite?.nom || "—";
      parSpecialite[nom] = (parSpecialite[nom] || 0) + 1;
    });
    const entrees = Object.entries(parSpecialite).sort((a, b) => b[1] - a[1]).slice(0, 6);

    instancesGraph.current.specialite?.destroy();
    instancesGraph.current.specialite = new Chart(refGraphSpecialite.current, {
      type: "bar",
      data: {
        labels: entrees.map(([nom]) => nom),
        datasets: [{
          label: "Médecins",
          data: entrees.map(([, n]) => n),
          backgroundColor: COULEURS_GRAPHIQUE.teal,
          borderRadius: 6, borderSkipped: false,
        }],
      },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: COULEURS_GRAPHIQUE.border }, border: { color: "transparent" }, ticks: { precision: 0 } },
          y: { grid: { display: false }, border: { color: COULEURS_GRAPHIQUE.border } },
        },
      },
    });
  }, [statistiques]);

  useEffect(() => () => {
    Object.values(instancesGraph.current).forEach((g) => g?.destroy());
  }, []);

  /* ─── Formulaire création + édition ──────────────────────────
       `formulaire.medecin_id` distingue les deux modes (voir
       FORMULAIRE_VIDE) : null => creerMedecin(), sinon => modifierMedecin(). */

  // Réservé admin/superadmin — vérifié aussi côté serveur (POST
  // /medecins), ce garde-fou côté front évite juste d'ouvrir une modale
  // pour un rôle qui se ferait de toute façon rejeter à l'envoi.
  function ouvrirCreation() {
    if (!estAdmin) return;
    setFormulaire(FORMULAIRE_VIDE);
    setFichiersExistants(null);
    setErreurFormulaire(null);
    setModaleOuverte(true);
    setMedecinSelectionne(null);
    // Création : teleconsultation_activee est obligatoire en base, donc
    // toujours envoyé (voir déclaration du state plus haut).
    setTeleconsultationModifieeParUtilisateur(true);
  }

  function ouvrirEdition(medecin) {
    setFormulaire({
      medecin_id: medecin.medecin_id,
      email: "",
      nom: medecin.nom ?? "", prenom: medecin.prenom ?? "",
      specialite_id: medecin.specialite_id ?? medecin.specialite?.specialite_id ?? "",
      numero_ordre: medecin.numero_ordre ?? "",
      telephone: medecin.telephone ?? "",
      statut_verification: medecin.statut_verification ?? "non_publie",
      pays_exercice_id: medecin.pays_exercice_id ?? "", ville_exercice_id: medecin.ville_exercice_id ?? "",
      adresse_cabinet: medecin.adresse_cabinet ?? "",
      latitude: medecin.geolocalisation?.latitude ?? "", longitude: medecin.geolocalisation?.longitude ?? "",
      teleconsultation_activee: medecin.teleconsultation_activee ?? false,
      tarif_indicatif: medecin.tarif_indicatif ?? "",
      biographie: medecin.biographie ?? "",
      cni: null, attestation: null, photo: null,
    });
    setFichiersExistants({
      cni_url: medecin.cni_url ?? null,
      attestation_url: medecin.attestation_url ?? null,
      photo_url: medecin.photo_url ?? null,
    });
    setErreurFormulaire(null);
    setModaleOuverte(true);
    setMedecinSelectionne(null);
    // Édition : tant que l'utilisateur ne touche pas explicitement la
    // case, on ne renverra pas ce champ au serveur (voir
    // soumettreFormulaire) — la valeur de création reste inchangée.
    setTeleconsultationModifieeParUtilisateur(false);
  }

  function fermerModale() { setModaleOuverte(false); setErreurFormulaire(null); }

  function modifierChampFormulaire(champ, valeur) {
    setFormulaire((p) => ({ ...p, [champ]: valeur, ...(champ === "pays_exercice_id" ? { ville_exercice_id: "" } : {}) }));
    // La case téléconsultation vient d'être manipulée volontairement :
    // à partir de maintenant sa valeur sera bien envoyée au serveur.
    if (champ === "teleconsultation_activee") setTeleconsultationModifieeParUtilisateur(true);
  }

  function modifierFichierFormulaire(champ, fichier) {
    setFormulaire((p) => ({ ...p, [champ]: fichier ?? null }));
  }

  async function soumettreFormulaire(evenement) {
    evenement.preventDefault();
    setErreurFormulaire(null);
    setEnvoiEnCours(true);

    const enCreation = !formulaire.medecin_id;
    const { medecin_id, email, latitude, longitude, ...reste } = formulaire;
    const donnees = {
      ...reste,
      // email : uniquement pertinent à la création (compte utilisateur
      // créé en même temps par creerMedecin) — jamais envoyé en édition.
      ...(enCreation ? { email } : {}),
      // pays_id : le contrôleur creerMedecin l'exige pour le COMPTE
      // utilisateur créé en même temps (voir medecin.controller.js —
      // distinct de pays_exercice_id, qui concerne la fiche). Ce
      // formulaire ne propose pas de sélecteur "pays du compte" séparé :
      // on réutilise donc le pays d'exercice choisi. Non envoyé en
      // édition, modifierMedecin ne touchant jamais au compte.
      ...(enCreation ? { pays_id: reste.pays_exercice_id } : {}),
      ...(latitude !== "" && longitude !== "" ? { latitude: Number(latitude), longitude: Number(longitude) } : {}),
    };

    // En édition, si l'utilisateur n'a pas touché la case
    // téléconsultation, on ne l'envoie pas du tout : le serveur ignore
    // les champs absents (voir CHAMPS_MODIFIABLES_MEDECIN côté back) et
    // conserve donc la valeur déjà enregistrée à la création, plutôt
    // que de la réécrire avec la valeur par défaut du formulaire.
    if (!enCreation && !teleconsultationModifieeParUtilisateur) {
      delete donnees.teleconsultation_activee;
    }

    try {
      if (enCreation) {
        const reponse = await creerMedecin(donnees);
        setModaleOuverte(false);
        // Affiché une seule fois : le backend ne renvoie plus jamais ce
        // mot de passe ensuite (voir en-tête du fichier).
        if (reponse?.utilisateur?.mot_de_passe_temporaire) {
          setCompteMedecinCree({
            nomComplet: `Dr ${formulaire.prenom} ${formulaire.nom}`.trim(),
            email: reponse.utilisateur?.email || formulaire.email,
            motDePasseTemporaire: reponse.utilisateur.mot_de_passe_temporaire,
          });
        }
      } else {
        await modifierMedecin(medecin_id, donnees);
        setModaleOuverte(false);
      }
      await chargerMedecins();
    } catch (err) {
      setErreurFormulaire(
        err.message ||
          (enCreation
            ? "Une erreur est survenue lors de la création de la fiche médecin."
            : "Une erreur est survenue lors de l'enregistrement.")
      );
    } finally {
      setEnvoiEnCours(false);
    }
  }

  async function confirmerSuppression() {
    if (!cibleSuppression) return;
    setSuppressionEnCours(true);
    try {
      await supprimerMedecin(cibleSuppression.medecin_id);
      setCibleSuppression(null);
      if (medecinSelectionne?.medecin_id === cibleSuppression.medecin_id) setMedecinSelectionne(null);
      await chargerMedecins();
    } catch (err) {
      setErreur(err.message || "Impossible de supprimer cette fiche médecin.");
      setCibleSuppression(null);
    } finally {
      setSuppressionEnCours(false);
    }
  }

  /**
   * Confirme la publication ou la suspension d'une fiche (déclenché
   * depuis la modale de confirmation ci-dessous). suspendreMedecin est
   * idempotent et ne renvoie pas toujours un objet `medecin` (voir
   * medecinService.js) : on ne met alors à jour que via
   * chargerMedecins(), sans dépendre du retour.
   */
  async function confirmerChangementStatut() {
    if (!cibleChangementStatut) return;
    const { medecin, action } = cibleChangementStatut;
    setChangementStatutEnCours(true);
    try {
      const medecinMaj = action === "publier"
        ? await publierMedecin(medecin.medecin_id)
        : await suspendreMedecin(medecin.medecin_id);
      setCibleChangementStatut(null);
      if (medecinMaj && medecinSelectionne?.medecin_id === medecin.medecin_id) {
        setMedecinSelectionne((prev) => (prev ? { ...prev, ...medecinMaj } : prev));
      }
      await chargerMedecins();
    } catch (err) {
      setErreur(
        err.message ||
          (action === "publier"
            ? "Impossible de publier cette fiche médecin."
            : "Impossible de suspendre cette fiche médecin.")
      );
      setCibleChangementStatut(null);
    } finally {
      setChangementStatutEnCours(false);
    }
  }

  /* ─── CRUD du référentiel Spécialité ────────────────────────
       Modale indépendante de la fiche médecin (voir en-tête du
       fichier) : liste des spécialités existantes + formulaire
       d'ajout/édition inline + confirmation de suppression, toujours
       réservée admin/superadmin côté écriture (voir garde-fous
       ci-dessous, doublés côté serveur de toute façon). */

  function ouvrirGestionSpecialites() {
    if (!estAdmin) return;
    setFormulaireSpecialite(SPECIALITE_VIDE);
    setErreurFormulaireSpecialite(null);
    setModaleSpecialitesOuverte(true);
  }

  function fermerGestionSpecialites() {
    setModaleSpecialitesOuverte(false);
    setFormulaireSpecialite(SPECIALITE_VIDE);
    setErreurFormulaireSpecialite(null);
  }

  function ouvrirEditionSpecialite(specialite) {
    setFormulaireSpecialite({
      specialite_id: specialite.specialite_id,
      nom: specialite.nom ?? "",
      description: specialite.description ?? "",
    });
    setErreurFormulaireSpecialite(null);
  }

  function modifierChampFormulaireSpecialite(champ, valeur) {
    setFormulaireSpecialite((p) => ({ ...p, [champ]: valeur }));
  }

  async function soumettreFormulaireSpecialite(evenement) {
    evenement.preventDefault();
    if (!estAdmin) return;
    setErreurFormulaireSpecialite(null);
    setEnvoiSpecialiteEnCours(true);

    const enCreation = !formulaireSpecialite.specialite_id;
    const { specialite_id, ...donnees } = formulaireSpecialite;

    try {
      if (enCreation) {
        await creerSpecialite(donnees);
      } else {
        await modifierSpecialite(specialite_id, donnees);
      }
      setFormulaireSpecialite(SPECIALITE_VIDE);
      await chargerSpecialites();
    } catch (err) {
      setErreurFormulaireSpecialite(
        err.message ||
          (enCreation
            ? "Une erreur est survenue lors de la création de la spécialité."
            : "Une erreur est survenue lors de l'enregistrement.")
      );
    } finally {
      setEnvoiSpecialiteEnCours(false);
    }
  }

  async function confirmerSuppressionSpecialite() {
    if (!cibleSuppressionSpecialite || !peutSupprimer) return;
    setSuppressionSpecialiteEnCours(true);
    try {
      await supprimerSpecialite(cibleSuppressionSpecialite.specialite_id);
      setCibleSuppressionSpecialite(null);
      // Le formulaire d'édition peut cibler la spécialité qu'on vient
      // de supprimer : on le réinitialise par précaution.
      if (formulaireSpecialite.specialite_id === cibleSuppressionSpecialite.specialite_id) {
        setFormulaireSpecialite(SPECIALITE_VIDE);
      }
      await chargerSpecialites();
    } catch (err) {
      // Le contrôleur renvoie 409 si des fiches médecin référencent
      // encore cette spécialité (voir medecinService.js) — message
      // affiché tel quel plutôt qu'un échec silencieux.
      setErreurSpecialites(
        err.message ||
          "Impossible de supprimer cette spécialité : elle est peut-être encore utilisée par une ou plusieurs fiches médecin."
      );
      setCibleSuppressionSpecialite(null);
    } finally {
      setSuppressionSpecialiteEnCours(false);
    }
  }

  function exporterCsv() {
    const entetes = ["Nom", "Prénom", "Spécialité", "Statut", "Téléphone", "N° d'ordre", "Ville", "Pays"];
    const lignes = medecinsTries.map((m) => [
      m.nom, m.prenom, m.specialite?.nom,
      STATUT_META[m.statut_verification]?.libelle || m.statut_verification,
      m.telephone, m.numero_ordre, m.ville_exercice?.nom || m.ville?.nom || "", m.pays_exercice?.nom || m.pays?.nom || "",
    ]);
    const csv = [entetes, ...lignes]
      .map((ligne) => ligne.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(blob);
    lien.download = "medecins.csv";
    lien.click();
    URL.revokeObjectURL(lien.href);
  }

  return (
    <>
      <main className="aps-content">
        {/* =========================================================
             EN-TÊTE DE PAGE
             ========================================================= */}
        <div className="aps-page-header">
          <div>
            <nav className="aps-breadcrumb">
              <a href="dashboard.html">Tableau de bord</a>
              <span className="sep">/</span>
              <span>Annuaire &amp; Utilisateurs</span>
              <span className="sep">/</span>
              <span>Médecins</span>
            </nav>
            <h1>Médecins</h1>
            <p className="aps-text-muted mb-0" style={{ fontSize: 13 }}>
              Gestion des fiches médecins enregistrées sur la plateforme.
            </p>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-light" type="button" onClick={exporterCsv}>
              <i className="fa-solid fa-file-export me-1"></i> Exporter
            </button>
            {/* Référentiel Spécialités : lecture publique, mais
                écriture (POST/PUT) et suppression (DELETE) réservées
                admin/superadmin — voir medecinService.js. Le bouton
                n'ouvre donc la modale de gestion que pour ces rôles ;
                elle n'apparaît pas du tout pour un visiteur ou un
                médecin non-admin. */}
            {estAdmin && (
              <button className="btn btn-light" type="button" onClick={ouvrirGestionSpecialites}>
                <i className="fa-solid fa-stethoscope me-1"></i> Gérer les spécialités
              </button>
            )}
            {/* Réservé admin/superadmin : POST /medecins crée aussi le
                compte utilisateur du médecin (voir en-tête du fichier). */}
            {estAdmin && (
              <button className="btn btn-primary" type="button" onClick={ouvrirCreation}>
                <i className="fa-solid fa-user-doctor me-1"></i> Nouvelle fiche
              </button>
            )}
          </div>
        </div>

        {/* =========================================================
             KPI PRINCIPAUX
             ========================================================= */}
        <div className="row g-3 mb-4">
          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-primary"><i className="fa-solid fa-user-doctor"></i></div>
                <span className="aps-badge is-info"><i className="fa-solid fa-circle"></i> Total</span>
              </div>
              <div className="aps-kpi__label">Médecins enregistrés</div>
              <div className="aps-kpi__value">{kpi.total.toLocaleString("fr-FR")}</div>
            </div>
          </div>

          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-success"><i className="fa-solid fa-circle-check"></i></div>
                <span className="aps-badge is-success"><i className="fa-solid fa-circle"></i> Actif</span>
              </div>
              <div className="aps-kpi__label">Fiches publiées</div>
              <div className="aps-kpi__value">{kpi.publie.toLocaleString("fr-FR")}</div>
            </div>
          </div>

          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-warning"><i className="fa-solid fa-hourglass-half"></i></div>
                <span className="aps-badge is-warning"><i className="fa-solid fa-circle"></i> En attente</span>
              </div>
              <div className="aps-kpi__label">Fiches à vérifier</div>
              <div className="aps-kpi__value">{kpi.enCours.toLocaleString("fr-FR")}</div>
            </div>
          </div>

          <div className="col-6 col-lg-3">
            <div className="aps-kpi">
              <div className="aps-kpi__top">
                <div className="aps-kpi__icon is-danger"><i className="fa-solid fa-triangle-exclamation"></i></div>
                <span className="aps-badge is-danger"><i className="fa-solid fa-circle"></i> Non publié</span>
              </div>
              <div className="aps-kpi__label">Fiches non publiées</div>
              <div className="aps-kpi__value">{kpi.nonPublie.toLocaleString("fr-FR")}</div>
            </div>
          </div>
        </div>

        {/* =========================================================
             GRAPHIQUES CHART.JS (calculés depuis les médecins réels)
             ========================================================= */}
        <div className="row g-3 mb-4">
          <div className="col-lg-6">
            <div className="aps-card h-100">
              <div className="aps-card__header"><h3>Statut de vérification</h3></div>
              <div className="aps-card__body">
                <div style={{ position: "relative", height: 260 }}>
                  <canvas ref={refGraphStatut}></canvas>
                </div>
              </div>
            </div>
          </div>
          <div className="col-lg-6">
            <div className="aps-card h-100">
              <div className="aps-card__header"><h3>Médecins par spécialité</h3></div>
              <div className="aps-card__body">
                <div style={{ position: "relative", height: 260 }}>
                  <canvas ref={refGraphSpecialite}></canvas>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================
             BANDEAU D'ALERTE (dynamique)
             ========================================================= */}
        {kpi.enCours > 0 && (
          <div className="aps-notice is-warning mb-4">
            <i className="fa-solid fa-triangle-exclamation"></i>
            <div>
              <strong>{kpi.enCours} fiche{kpi.enCours > 1 ? "s" : ""} médecin en attente de vérification.</strong>{" "}
              Merci de contrôler le numéro d'ordre et l'attestation d'exercice avant publication.
            </div>
          </div>
        )}

        {/* =========================================================
             FILTRES
             ========================================================= */}
        <div className="aps-card mb-3">
          <div className="aps-card__body">
            <div className="row g-3 align-items-end">
              <div className="col-md-3">
                <label className="form-label">Rechercher</label>
                <div className="position-relative">
                  <i className="fa-solid fa-magnifying-glass position-absolute"
                     style={{ left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--aps-text-400)", fontSize: 13 }}></i>
                  <input
                    type="search" className="form-control" style={{ paddingLeft: 36 }}
                    placeholder="Nom du médecin…" value={filtres.recherche}
                    onChange={(e) => modifierFiltre("recherche", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && appliquerFiltres()}
                  />
                </div>
              </div>
              <div className="col-md-2">
                <label className="form-label">Statut</label>
                <select className="form-select" value={filtres.statut_verification} onChange={(e) => modifierFiltre("statut_verification", e.target.value)}>
                  <option value="">Tous</option>
                  {STATUTS_VERIFICATION_MEDECIN.map((s) => <option key={s.valeur} value={s.valeur}>{s.libelle}</option>)}
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label">Spécialité</label>
                <select className="form-select" value={filtres.specialite_id} onChange={(e) => modifierFiltre("specialite_id", e.target.value)}>
                  <option value="">Toutes</option>
                  {specialitesReferentiel.map((s) => (
                    <option key={s.specialite_id} value={s.specialite_id}>{s.nom}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label">Pays</label>
                <select className="form-select" value={filtres.pays_exercice_id} onChange={(e) => modifierFiltre("pays_exercice_id", e.target.value)}>
                  <option value="">Tous les pays</option>
                  {pays.map((p) => <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>)}
                </select>
              </div>
              <div className="col-md-1">
                <label className="form-label">Ville</label>
                <select className="form-select" value={filtres.ville_exercice_id} onChange={(e) => modifierFiltre("ville_exercice_id", e.target.value)} disabled={!filtres.pays_exercice_id}>
                  <option value="">Toutes</option>
                  {villesFiltre.map((v) => <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>)}
                </select>
              </div>
              <div className="col-md-2 d-flex gap-2">
                <button className="btn btn-outline-primary flex-grow-1" type="button" onClick={appliquerFiltres}>Filtrer</button>
                <button className="btn btn-light" type="button" title="Réinitialiser" onClick={reinitialiserFiltres}>
                  <i className="fa-solid fa-rotate-left"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        {erreur && (
          <div className="aps-notice is-danger mb-3"><i className="fa-solid fa-circle-exclamation"></i><div>{erreur}</div></div>
        )}

        {/* =========================================================
             LISTE DES MÉDECINS — TABLEAU (même gabarit que la liste
             des utilisateurs dans Utilisateurs.jsx : aps-card >
             aps-table-wrap > table.aps-table, avatar-cell, badges de
             rôle/statut, actions en fin de ligne).
             ========================================================= */}
        <div className="aps-card">
          <div className="aps-card__header flex-wrap gap-2">
            <h2>Tous les médecins</h2>
            <div className="d-flex flex-wrap gap-2 align-items-center">
              <div className="aps-text-muted" style={{ fontSize: 13 }}>
                {chargement ? "Chargement…" : (
                  <>Affichage de <strong className="aps-text-strong">{debutAffichage}–{finAffichage}</strong> sur{" "}
                    <strong className="aps-text-strong">{medecinsTries.length}</strong> médecins</>
                )}
              </div>
              <label className="aps-text-muted" style={{ fontSize: 13 }}>Trier par :</label>
              <select className="form-select form-select-sm" style={{ width: "auto" }} value={tri} onChange={(e) => setTri(e.target.value)}>
                <option value="nom">Nom (A-Z)</option>
                <option value="specialite">Spécialité</option>
                <option value="statut">Statut</option>
              </select>
            </div>
          </div>

          <div className="aps-table-wrap">
            <table className="table aps-table">
              <thead>
                <tr>
                  <th>Médecin</th>
                  <th>Spécialité</th>
                  <th>Téléphone</th>
                  <th>Ville / Pays</th>
                  <th>N° d'ordre</th>
                  <th>Statut</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!chargement && medecinsPage.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="aps-empty-state">
                        <i className="fa-solid fa-user-doctor"></i>
                        <div>Aucun médecin ne correspond à ces critères.</div>
                      </div>
                    </td>
                  </tr>
                )}

                {medecinsPage.map((medecin) => {
                  const statut = STATUT_META[medecin.statut_verification] || {};
                  const modifiable = peutModifierFiche(medecin);
                  const ville = medecin.ville_exercice?.nom || medecin.ville?.nom;
                  const paysNom = medecin.pays_exercice?.nom || medecin.pays?.nom;
                  return (
                    <tr key={medecin.medecin_id}>
                      <td>
                        <div className="aps-avatar-cell">
                          {medecin.photo_url ? (
                            <img src={medecin.photo_url} alt={`Dr ${medecin.prenom} ${medecin.nom}`} />
                          ) : (
                            <span
                              className="d-inline-flex align-items-center justify-content-center"
                              style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--aps-primary-100)", color: "var(--aps-primary)" }}
                            >
                              <i className="fa-solid fa-user-doctor"></i>
                            </span>
                          )}
                          <div>
                            <div className="cell-title">Dr {medecin.prenom} {medecin.nom}</div>
                            <div className="cell-sub">{medecin.email || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="aps-badge is-info">
                          <i className="fa-solid fa-circle"></i>
                          {medecin.specialite?.nom || "—"}
                        </span>
                      </td>
                      <td>{medecin.telephone || "—"}</td>
                      <td>
                        {ville}
                        {ville && paysNom ? " · " : ""}
                        {paysNom}
                        {!ville && !paysNom && "—"}
                      </td>
                      <td>{medecin.numero_ordre || "—"}</td>
                      <td>
                        <span className={`aps-badge ${statut.badge || "is-info"}`}>
                          <i className="fa-solid fa-circle"></i> {statut.libelle || "—"}
                        </span>
                      </td>
                      <td className="text-end">
                        {/* Les deux actions "Voir" et "Modifier"/"Examiner"
                            restent toutes les deux visibles en permanence
                            (plus de bascule exclusive entre les deux). */}
                        <div className="d-flex gap-2 justify-content-end">
                          <button
                            type="button"
                            className="btn btn-sm btn-light"
                            title="Voir la fiche"
                            onClick={() => setMedecinSelectionne(medecin)}
                          >
                            <i className="fa-solid fa-eye"></i>
                          </button>
                          {modifiable && (
                            <button
                              type="button"
                              className="btn btn-sm btn-light"
                              title={medecin.statut_verification === "en_cours" ? "Examiner" : "Modifier"}
                              onClick={() => ouvrirEdition(medecin)}
                            >
                              <i className={`fa-solid ${medecin.statut_verification === "en_cours" ? "fa-file-signature" : "fa-pen"}`}></i>
                            </button>
                          )}
                          {/* Publier/Suspendre : action PATCH dédiée,
                              admin/superadmin uniquement (voir
                              publierMedecin/suspendreMedecin dans
                              medecinService.js) — un seul bouton
                              contextuel selon le statut courant. */}
                          {estAdmin && (
                            <button
                              type="button"
                              className="btn btn-sm btn-light"
                              title={medecin.statut_verification === "publie" ? "Suspendre" : "Publier"}
                              onClick={() => setCibleChangementStatut({ medecin, action: determinerActionStatut(medecin) })}
                            >
                              <i className={`fa-solid ${medecin.statut_verification === "publie" ? "fa-ban" : "fa-circle-check"}`}></i>
                            </button>
                          )}
                          {peutSupprimer && (
                            <button
                              type="button"
                              className="btn btn-sm btn-light"
                              title="Supprimer"
                              onClick={() => setCibleSuppression(medecin)}
                            >
                              <i className="fa-solid fa-trash"></i>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* =========================================================
             PAGINATION (client, l'API ne pagine pas côté serveur)
             ========================================================= */}
        <div className="aps-card mt-3">
          <div className="aps-pagination">
            <div>Page <strong>{pageCourante}</strong> sur <strong>{nbPages}</strong></div>
            <div className="pages">
              <button type="button" disabled={pageCourante <= 1} onClick={() => setPage(pageCourante - 1)}>
                <i className="fa-solid fa-chevron-left"></i>
              </button>
              {Array.from({ length: nbPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === nbPages || Math.abs(n - pageCourante) <= 1)
                .reduce((acc, n) => {
                  if (acc.length && n - acc[acc.length - 1] > 1) acc.push("…");
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) => n === "…" ? (
                  <button type="button" key={`ellipse-${i}`} disabled>…</button>
                ) : (
                  <button type="button" key={n} className={n === pageCourante ? "is-active" : ""} onClick={() => setPage(n)}>{n}</button>
                ))}
              <button type="button" disabled={pageCourante >= nbPages} onClick={() => setPage(pageCourante + 1)}>
                <i className="fa-solid fa-chevron-right"></i>
              </button>
            </div>
            <div className="d-flex gap-2 align-items-center">
              <span>Par page :</span>
              <select className="form-select form-select-sm" style={{ width: "auto" }} value={parPage}
                      onChange={(e) => { setParPage(Number(e.target.value)); setPage(1); }}>
                {TAILLES_PAGE.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        </div>
      </main>

      {/* =========================================================
           MODALE — FICHE DÉTAIL
           ========================================================= */}
      {medecinSelectionne && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={() => setMedecinSelectionne(null)}>
            <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content aps-fiche-detail">
                <div className="modal-header aps-fiche-header">
                  <div>
                    <h5 className="modal-title mb-1">Dr {medecinSelectionne.prenom} {medecinSelectionne.nom}</h5>
                    <div className="aps-text-muted aps-fiche-souscritre">
                      <i className="fa-solid fa-location-dot me-1"></i>
                      {medecinSelectionne.ville_exercice?.nom || medecinSelectionne.ville?.nom || "Ville non renseignée"}
                      {(medecinSelectionne.pays_exercice?.nom || medecinSelectionne.pays?.nom)
                        ? `, ${medecinSelectionne.pays_exercice?.nom || medecinSelectionne.pays?.nom}`
                        : ""}
                    </div>
                  </div>
                  <button type="button" className="btn-close" onClick={() => setMedecinSelectionne(null)}></button>
                </div>
                <div className="modal-body pt-3">
                  <div className="row g-4">
                    {/* ── Colonne avatar + spécialité + n° d'ordre ─── */}
                    <div className="col-md-5">
                      <div className="aps-fiche-avatar-wrap">
                        <span className={`aps-badge aps-fiche-statut-flottant ${STATUT_META[medecinSelectionne.statut_verification]?.badge || "is-info"}`}>
                          <i className={`fa-solid ${STATUT_META[medecinSelectionne.statut_verification]?.detailIcone || "fa-circle"}`}></i>
                          {STATUT_META[medecinSelectionne.statut_verification]?.libelle || "—"}
                        </span>
                        <div
                          className="aps-fiche-avatar"
                          style={medecinSelectionne.photo_url ? { padding: 0, overflow: "hidden" } : undefined}
                        >
                          {medecinSelectionne.photo_url ? (
                            <img
                              src={medecinSelectionne.photo_url}
                              alt={`Dr ${medecinSelectionne.prenom} ${medecinSelectionne.nom}`}
                              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                            />
                          ) : (
                            <i className="fa-solid fa-user-doctor"></i>
                          )}
                        </div>
                        <div className="aps-fiche-nom">Dr {medecinSelectionne.prenom} {medecinSelectionne.nom}</div>
                        <div className="aps-fiche-specialite">{medecinSelectionne.specialite?.nom || "Spécialité non renseignée"}</div>
                        {/* Affiché seulement si l'API renvoie ces champs
                            agrégés sur la fiche elle-même — aucun appel
                            à /avis-medecin n'est fait depuis cette page,
                            voir en-tête du fichier. */}
                        {medecinSelectionne.note_moyenne != null && (
                          <div className="aps-fiche-note">
                            <i className="fa-solid fa-star"></i>
                            {Number(medecinSelectionne.note_moyenne).toFixed(1)} / 5
                            {medecinSelectionne.nombre_avis != null && (
                              <span>({medecinSelectionne.nombre_avis} avis)</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="aps-fiche-type-chip">
                        <span
                          className="aps-fiche-type-icone"
                          style={{ background: "var(--aps-primary-100)", color: "var(--aps-primary)" }}
                        >
                          <i className="fa-solid fa-id-card"></i>
                        </span>
                        <div>
                          <div className="fw-semibold" style={{ fontSize: 14 }}>
                            {medecinSelectionne.numero_ordre || "—"}
                          </div>
                          <div className="aps-text-muted" style={{ fontSize: 12 }}>N° d'ordre</div>
                        </div>
                      </div>

                      {/* Vérification ONMC — action explicite, pas
                          automatique (voir onmcVerificationService.js :
                          l'appel pilote un navigateur headless côté
                          serveur, donc plus coûteux qu'un simple fetch). */}
                      {medecinSelectionne.numero_ordre && (
                        <div className="mt-2">
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-sm w-100"
                            onClick={lancerVerificationOrdre}
                            disabled={verificationOrdre.enCours}
                          >
                            {verificationOrdre.enCours ? (
                              <>
                                <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                Vérification en cours…
                              </>
                            ) : (
                              <>
                                <i className="fa-solid fa-shield-halved me-1"></i>
                                Vérifier l'appartenance à l'ONMC
                              </>
                            )}
                          </button>

                          {verificationOrdre.erreur && (
                            <div className="alert alert-warning py-2 px-2 mt-2 mb-0" style={{ fontSize: 12 }}>
                              <i className="fa-solid fa-triangle-exclamation me-1"></i>
                              {verificationOrdre.erreur}
                            </div>
                          )}

                          {verificationOrdre.resultat && (
                            verificationOrdre.resultat.appartient_ordre ? (
                              <div className="alert alert-success py-2 px-2 mt-2 mb-0" style={{ fontSize: 12 }}>
                                <i className="fa-solid fa-circle-check me-1"></i>
                                Inscrit au Tableau de l'Ordre National des Médecins du Cameroun
                                {verificationOrdre.resultat.nom_complet && (
                                  <div className="aps-text-muted mt-1">
                                    Nom au tableau : {verificationOrdre.resultat.nom_complet}
                                    {verificationOrdre.resultat.numero_ordre_onmc
                                      ? ` (${verificationOrdre.resultat.numero_ordre_onmc})`
                                      : ""}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="alert alert-danger py-2 px-2 mt-2 mb-0" style={{ fontSize: 12 }}>
                                <i className="fa-solid fa-circle-xmark me-1"></i>
                                Ce numéro d'ordre n'a pas été retrouvé au Tableau de l'Ordre National des Médecins du Cameroun
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── Colonne infos + pièces justificatives ────── */}
                    <div className="col-md-7">
                      <div className="aps-fiche-info-grid">
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-phone"></i>
                          <div>
                            <div className="aps-fiche-info-label">Téléphone</div>
                            <div className="aps-fiche-info-valeur">{medecinSelectionne.telephone || "—"}</div>
                          </div>
                        </div>
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-city"></i>
                          <div>
                            <div className="aps-fiche-info-label">Ville</div>
                            <div className="aps-fiche-info-valeur">{medecinSelectionne.ville_exercice?.nom || medecinSelectionne.ville?.nom || "—"}</div>
                          </div>
                        </div>
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-flag"></i>
                          <div>
                            <div className="aps-fiche-info-label">Pays</div>
                            <div className="aps-fiche-info-valeur">{medecinSelectionne.pays_exercice?.nom || medecinSelectionne.pays?.nom || "—"}</div>
                          </div>
                        </div>
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-map-pin"></i>
                          <div>
                            <div className="aps-fiche-info-label">Localisation</div>
                            <div className="aps-fiche-info-valeur">
                              {medecinSelectionne.geolocalisation
                                ? `${medecinSelectionne.geolocalisation.latitude.toFixed(4)}, ${medecinSelectionne.geolocalisation.longitude.toFixed(4)}`
                                : "Non renseignée"}
                            </div>
                          </div>
                        </div>
                        <div className="aps-fiche-info-item">
                          <i className="fa-solid fa-house-medical"></i>
                          <div>
                            <div className="aps-fiche-info-label">Cabinet</div>
                            <div className="aps-fiche-info-valeur">{medecinSelectionne.adresse_cabinet || "—"}</div>
                          </div>
                        </div>
                      </div>

                      <div className="aps-fiche-section-titre">
                        <i className="fa-solid fa-folder-open me-1"></i> Pièces justificatives
                      </div>

                      <div className="aps-accordion">
                        {[
                          { id: "photo", label: "Photo de profil", icone: "fa-image", url: medecinSelectionne.photo_url },
                          { id: "cni", label: "Carte nationale d'identité (CNI)", icone: "fa-id-card", url: medecinSelectionne.cni_url },
                          { id: "attestation", label: "Attestation d'exercice", icone: "fa-file-shield", url: medecinSelectionne.attestation_url },
                        ].filter((piece) => piece.url).map((piece) => {
                          const ouvert = !!piecesOuvertes[piece.id];
                          return (
                            <div className={`aps-accordion-item ${ouvert ? "is-open" : ""}`} key={piece.id}>
                              <button
                                type="button"
                                className="aps-accordion-trigger"
                                onClick={() => setPiecesOuvertes((p) => ({ ...p, [piece.id]: !p[piece.id] }))}
                                aria-expanded={ouvert}
                              >
                                <span className="aps-accordion-icone"><i className={`fa-solid ${piece.icone}`}></i></span>
                                <span className="aps-accordion-libelle">{piece.label}</span>
                                <a
                                  href={piece.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="aps-accordion-lien-externe"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Ouvrir dans un nouvel onglet"
                                >
                                  <i className="fa-solid fa-up-right-from-square"></i>
                                </a>
                                <i className="fa-solid fa-chevron-down aps-accordion-chevron"></i>
                              </button>
                              {ouvert && (
                                <div className="aps-accordion-panel">
                                  <ApercuPieceJustificative url={piece.url} label={piece.label} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {!medecinSelectionne.photo_url && !medecinSelectionne.cni_url && !medecinSelectionne.attestation_url && (
                          <div className="aps-text-muted" style={{ fontSize: 13 }}>Aucune pièce justificative fournie.</div>
                        )}
                      </div>

                      {/* ── Moyens de paiement (lecture seule) ─────
                          Simple liste des Mobile Money / comptes
                          bancaires du médecin. La gestion complète
                          (ajout/édition/suppression) reste dans son
                          propre écran, cette fiche ne fait qu'informer. */}
                      <div className="aps-fiche-section-titre">
                        <i className="fa-solid fa-money-check-dollar me-1"></i> Moyens de paiement
                      </div>

                      {moyensPaiementChargement ? (
                        <div className="aps-text-muted" style={{ fontSize: 13 }}>
                          <i className="fa-solid fa-spinner fa-spin me-1"></i>Chargement…
                        </div>
                      ) : moyensPaiementErreur ? (
                        <div className="aps-text-muted" style={{ fontSize: 13 }}>{moyensPaiementErreur}</div>
                      ) : moyensPaiement.mobileMoney.length === 0 && moyensPaiement.comptesBancaires.length === 0 ? (
                        <div className="aps-text-muted" style={{ fontSize: 13 }}>Aucun moyen de paiement enregistré.</div>
                      ) : (
                        <ul className="list-unstyled mb-0" style={{ fontSize: 13 }}>
                          {moyensPaiement.mobileMoney.map((mm) => (
                            <li key={`mm-${mm.id}`} className="d-flex align-items-center gap-2 mb-1">
                              <i className="fa-solid fa-mobile-screen-button aps-text-muted"></i>
                              <span>
                                {mm.type_mobile_money?.libelle || "Mobile Money"} — {mm.numero}
                                {mm.titulaire ? ` (${mm.titulaire})` : ""}
                              </span>
                            </li>
                          ))}
                          {moyensPaiement.comptesBancaires.map((cb) => (
                            <li key={`cb-${cb.id}`} className="d-flex align-items-center gap-2 mb-1">
                              <i className="fa-solid fa-building-columns aps-text-muted"></i>
                              <span>
                                {cb.nom_banque} — {cb.iban}
                                {cb.titulaire ? ` (${cb.titulaire})` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  {estAdmin && (
                    <button
                      type="button"
                      className={`btn ${medecinSelectionne.statut_verification === "publie" ? "btn-outline-danger" : "btn-outline-success"}`}
                      onClick={() =>
                        setCibleChangementStatut({
                          medecin: medecinSelectionne,
                          action: determinerActionStatut(medecinSelectionne),
                        })
                      }
                    >
                      <i className={`fa-solid ${medecinSelectionne.statut_verification === "publie" ? "fa-ban" : "fa-circle-check"} me-1`}></i>
                      {medecinSelectionne.statut_verification === "publie" ? "Suspendre" : "Publier"}
                    </button>
                  )}
                  {peutModifierFiche(medecinSelectionne) && (
                    <button type="button" className="btn btn-primary" onClick={() => ouvrirEdition(medecinSelectionne)}>
                      <i className="fa-solid fa-pen me-1"></i> Modifier
                    </button>
                  )}
                  <button type="button" className="btn btn-light" onClick={() => setMedecinSelectionne(null)}>Fermer</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — ÉDITION (fiche propriétaire ou admin/superadmin)
           ========================================================= */}
      {modaleOuverte && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={fermerModale}>
            <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
              <form className="modal-content" onSubmit={soumettreFormulaire}>
                <div className="modal-header">
                  <h5 className="modal-title">
                    {formulaire.medecin_id ? "Modifier la fiche médecin" : "Nouvelle fiche médecin"}
                  </h5>
                  <button type="button" className="btn-close" onClick={fermerModale}></button>
                </div>
                <div className="modal-body">
                  {erreurFormulaire && (
                    <div className="aps-notice is-danger mb-3"><i className="fa-solid fa-circle-exclamation"></i><div>{erreurFormulaire}</div></div>
                  )}
                  {!formulaire.medecin_id && (
                    <div className="aps-notice is-info mb-3">
                      <i className="fa-solid fa-circle-info"></i>
                      <div>
                        Un compte utilisateur (rôle « médecin ») sera créé en même temps que cette
                        fiche, avec un mot de passe temporaire généré automatiquement et affiché
                        une seule fois après validation.
                      </div>
                    </div>
                  )}
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Nom</label>
                      <input type="text" className="form-control" required value={formulaire.nom}
                             onChange={(e) => modifierChampFormulaire("nom", e.target.value)} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Prénom</label>
                      <input type="text" className="form-control" required value={formulaire.prenom}
                             onChange={(e) => modifierChampFormulaire("prenom", e.target.value)} />
                    </div>

                    {/* Compte utilisateur : uniquement à la création
                        (voir en-tête du fichier) — non modifiable
                        ensuite depuis cet écran. */}
                    {!formulaire.medecin_id && (
                      <div className="col-md-6">
                        <label className="form-label">Email</label>
                        <input type="email" className="form-control" required value={formulaire.email}
                               placeholder="medecin@exemple.com"
                               onChange={(e) => modifierChampFormulaire("email", e.target.value)} />
                      </div>
                    )}

                    <div className="col-md-6">
                      <label className="form-label d-flex align-items-center justify-content-between">
                        <span>Spécialité</span>
                        {estAdmin && (
                          <button
                            type="button"
                            className="btn btn-link p-0"
                            style={{ fontSize: 12 }}
                            onClick={ouvrirGestionSpecialites}
                          >
                            <i className="fa-solid fa-plus me-1"></i>Gérer
                          </button>
                        )}
                      </label>
                      <select className="form-select" required value={formulaire.specialite_id}
                              disabled={chargementSpecialites}
                              onChange={(e) => modifierChampFormulaire("specialite_id", e.target.value)}>
                        <option value="" disabled>
                          {chargementSpecialites ? "Chargement…" : "Choisir…"}
                        </option>
                        {specialitesReferentiel.map((s) => (
                          <option key={s.specialite_id} value={s.specialite_id}>{s.nom}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Téléphone</label>
                      <input type="tel" className="form-control" required value={formulaire.telephone}
                             onChange={(e) => modifierChampFormulaire("telephone", e.target.value)} />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">N° d'ordre</label>
                      <input type="text" className="form-control" required value={formulaire.numero_ordre}
                             onChange={(e) => modifierChampFormulaire("numero_ordre", e.target.value)} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">
                        Statut de vérification
                        {!estAdmin && <span className="aps-text-muted"> (réservé à un administrateur)</span>}
                      </label>
                      {/* Désactivé pour un médecin qui édite sa propre
                          fiche : d'après le commentaire de
                          medecinService.js, seul un admin/superadmin
                          fait vraisemblablement autorité sur ce champ
                          côté serveur — on évite de laisser croire
                          qu'un changement ici sera pris en compte. */}
                      <select className="form-select" required value={formulaire.statut_verification} disabled={!estAdmin}
                              onChange={(e) => modifierChampFormulaire("statut_verification", e.target.value)}>
                        {STATUTS_VERIFICATION_MEDECIN.map((s) => <option key={s.valeur} value={s.valeur}>{s.libelle}</option>)}
                      </select>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Pays d'exercice</label>
                      <select className="form-select" required value={formulaire.pays_exercice_id}
                              onChange={(e) => modifierChampFormulaire("pays_exercice_id", e.target.value)}>
                        <option value="" disabled>Choisir…</option>
                        {pays.map((p) => <option key={p.pays_id} value={p.pays_id}>{p.nom}</option>)}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Ville d'exercice</label>
                      <select className="form-select" required value={formulaire.ville_exercice_id}
                              onChange={(e) => modifierChampFormulaire("ville_exercice_id", e.target.value)} disabled={!formulaire.pays_exercice_id}>
                        <option value="" disabled>Choisir…</option>
                        {villesFormulaire.map((v) => <option key={v.ville_id} value={v.ville_id}>{v.nom}</option>)}
                      </select>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Tarif indicatif (consultation)</label>
                      <input type="number" step="0.01" min="0" className="form-control" required
                             value={formulaire.tarif_indicatif}
                             onChange={(e) => modifierChampFormulaire("tarif_indicatif", e.target.value)} />
                    </div>
                    <div className="col-md-6 d-flex align-items-end">
                      <div className="form-check form-switch">
                        <input className="form-check-input" type="checkbox" role="switch" id="teleconsultationActivee"
                               checked={formulaire.teleconsultation_activee}
                               onChange={(e) => modifierChampFormulaire("teleconsultation_activee", e.target.checked)} />
                        <label className="form-check-label" htmlFor="teleconsultationActivee">
                          Téléconsultation activée
                        </label>
                      </div>
                    </div>

                    <div className="col-12">
                      <label className="form-label">Biographie</label>
                      {/* biographie : NOT NULL en base (schema.prisma),
                          rejetée par le contrôleur si vide/absente,
                          aussi bien à la création qu'en édition — voir
                          medecin.controller.js (champsManquants /
                          "Le champ biographie ne peut pas être vide."). */}
                      <textarea className="form-control" rows={4} required
                                placeholder="Parcours, expérience, approche de la médecine…"
                                value={formulaire.biographie}
                                onChange={(e) => modifierChampFormulaire("biographie", e.target.value)} />
                    </div>

                    <div className="col-12">
                      <label className="form-label">Adresse du cabinet <span className="aps-text-muted">(optionnel)</span></label>
                      <input type="text" className="form-control" value={formulaire.adresse_cabinet}
                             onChange={(e) => modifierChampFormulaire("adresse_cabinet", e.target.value)} />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Latitude <span className="aps-text-muted">(optionnel)</span></label>
                      <input type="number" step="any" className="form-control" value={formulaire.latitude}
                             onChange={(e) => modifierChampFormulaire("latitude", e.target.value)} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Longitude <span className="aps-text-muted">(optionnel)</span></label>
                      <input type="number" step="any" className="form-control" value={formulaire.longitude}
                             onChange={(e) => modifierChampFormulaire("longitude", e.target.value)} />
                    </div>

                    {/* ── Pièces justificatives ─────────────────────
                         Obligatoires à la création (cni/attestation,
                         voir creerMedecin dans medecinService.js) ;
                         optionnelles en édition — un champ laissé vide
                         conserve le fichier déjà enregistré côté
                         serveur. */}
                    <div className="col-12">
                      <hr />
                      <div className="aps-text-muted mb-2" style={{ fontSize: 13 }}>
                        {formulaire.medecin_id
                          ? "Pièces justificatives (laisser vide pour conserver le fichier actuel)"
                          : "Pièces justificatives (cni/attestation obligatoires, photo optionnelle)"}
                      </div>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Carte nationale d'identité (CNI)</label>
                      <input type="file" className="form-control" accept="image/jpeg,image/png,image/webp,application/pdf"
                             required={!formulaire.medecin_id}
                             onChange={(e) => modifierFichierFormulaire("cni", e.target.files?.[0])} />
                      {fichiersExistants?.cni_url && (
                        <a href={fichiersExistants.cni_url} target="_blank" rel="noreferrer" className="d-block mt-1" style={{ fontSize: 12 }}>
                          Voir le fichier actuel
                        </a>
                      )}
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Attestation d'exercice</label>
                      <input type="file" className="form-control" accept="image/jpeg,image/png,image/webp,application/pdf"
                             required={!formulaire.medecin_id}
                             onChange={(e) => modifierFichierFormulaire("attestation", e.target.files?.[0])} />
                      {fichiersExistants?.attestation_url && (
                        <a href={fichiersExistants.attestation_url} target="_blank" rel="noreferrer" className="d-block mt-1" style={{ fontSize: 12 }}>
                          Voir le fichier actuel
                        </a>
                      )}
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">
                        Photo de profil <span className="aps-text-muted">(optionnel)</span>
                      </label>
                      <input type="file" className="form-control" accept="image/jpeg,image/png,image/webp"
                             onChange={(e) => modifierFichierFormulaire("photo", e.target.files?.[0])} />
                      {fichiersExistants?.photo_url && (
                        <a href={fichiersExistants.photo_url} target="_blank" rel="noreferrer" className="d-block mt-1" style={{ fontSize: 12 }}>
                          Voir le fichier actuel
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={fermerModale}>Annuler</button>
                  <button type="submit" className="btn btn-primary" disabled={envoiEnCours}>
                    {envoiEnCours
                      ? "Enregistrement…"
                      : formulaire.medecin_id ? "Enregistrer" : "Créer la fiche"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — CONFIRMATION DE SUPPRESSION (superadmin)
           ========================================================= */}
      {cibleSuppression && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={() => setCibleSuppression(null)}>
            <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Supprimer cette fiche médecin ?</h5>
                  <button type="button" className="btn-close" onClick={() => setCibleSuppression(null)}></button>
                </div>
                <div className="modal-body">
                  <p className="mb-0">
                    La fiche « Dr {cibleSuppression.prenom} {cibleSuppression.nom} » sera définitivement
                    supprimée de l'annuaire. Cette action est irréversible.
                  </p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={() => setCibleSuppression(null)}>Annuler</button>
                  <button type="button" className="btn btn-danger" onClick={confirmerSuppression} disabled={suppressionEnCours}>
                    {suppressionEnCours ? "Suppression…" : "Supprimer définitivement"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — CONFIRMATION PUBLICATION / SUSPENSION
           (admin/superadmin uniquement — voir publierMedecin /
           suspendreMedecin dans medecinService.js). Le contenu (titre,
           texte, bouton) s'adapte à `cibleChangementStatut.action`.
           suspendreMedecin bloque aussi la connexion du médecin (pas
           seulement sa visibilité dans l'annuaire) : avertissement
           explicite dans ce cas précis.
           ========================================================= */}
      {cibleChangementStatut && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div
            className="modal fade show"
            style={{ display: "block" }}
            tabIndex={-1}
            onClick={() => setCibleChangementStatut(null)}
          >
            <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    {cibleChangementStatut.action === "publier"
                      ? "Publier cette fiche médecin ?"
                      : "Suspendre cette fiche médecin ?"}
                  </h5>
                  <button type="button" className="btn-close" onClick={() => setCibleChangementStatut(null)}></button>
                </div>
                <div className="modal-body">
                  {cibleChangementStatut.action === "publier" ? (
                    <p className="mb-0">
                      La fiche « Dr {cibleChangementStatut.medecin.prenom} {cibleChangementStatut.medecin.nom} » sera
                      visible dans l'annuaire public.
                    </p>
                  ) : (
                    <>
                      <p className="mb-2">
                        La fiche « Dr {cibleChangementStatut.medecin.prenom} {cibleChangementStatut.medecin.nom} » sera
                        retirée de l'annuaire public.
                      </p>
                      <p className="mb-0 aps-text-muted" style={{ fontSize: 13 }}>
                        <i className="fa-solid fa-triangle-exclamation me-1"></i>
                        Le compte utilisateur du médecin sera également suspendu : il ne pourra plus se connecter
                        tant que le compte n'aura pas été réactivé.
                      </p>
                    </>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={() => setCibleChangementStatut(null)}>
                    Annuler
                  </button>
                  <button
                    type="button"
                    className={`btn ${cibleChangementStatut.action === "publier" ? "btn-success" : "btn-danger"}`}
                    onClick={confirmerChangementStatut}
                    disabled={changementStatutEnCours}
                  >
                    {changementStatutEnCours
                      ? (cibleChangementStatut.action === "publier" ? "Publication…" : "Suspension…")
                      : (cibleChangementStatut.action === "publier" ? "Publier" : "Suspendre")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — GESTION DES SPÉCIALITÉS (référentiel, CRUD complet)
           Réservée admin/superadmin (voir ouvrirGestionSpecialites) :
           liste des spécialités existantes + formulaire d'ajout/édition
           inline + suppression (superadmin uniquement, cf. peutSupprimer).
           ========================================================= */}
      {modaleSpecialitesOuverte && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={fermerGestionSpecialites}>
            <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    <i className="fa-solid fa-stethoscope me-2"></i>Gérer les spécialités
                  </h5>
                  <button type="button" className="btn-close" onClick={fermerGestionSpecialites}></button>
                </div>
                <div className="modal-body">
                  {erreurSpecialites && (
                    <div className="aps-notice is-danger mb-3">
                      <i className="fa-solid fa-circle-exclamation"></i><div>{erreurSpecialites}</div>
                    </div>
                  )}

                  {/* ── Formulaire ajout / édition ─────────────── */}
                  <form className="row g-2 align-items-end mb-3" onSubmit={soumettreFormulaireSpecialite}>
                    {erreurFormulaireSpecialite && (
                      <div className="col-12">
                        <div className="aps-notice is-danger mb-2">
                          <i className="fa-solid fa-circle-exclamation"></i><div>{erreurFormulaireSpecialite}</div>
                        </div>
                      </div>
                    )}
                    <div className="col-md-4">
                      <label className="form-label">Nom</label>
                      <input type="text" className="form-control" required value={formulaireSpecialite.nom}
                             placeholder="Ex. Cardiologie"
                             onChange={(e) => modifierChampFormulaireSpecialite("nom", e.target.value)} />
                    </div>
                    <div className="col-md-5">
                      <label className="form-label">Description <span className="aps-text-muted">(optionnel)</span></label>
                      <input type="text" className="form-control" value={formulaireSpecialite.description}
                             onChange={(e) => modifierChampFormulaireSpecialite("description", e.target.value)} />
                    </div>
                    <div className="col-md-3 d-flex gap-2">
                      <button type="submit" className="btn btn-primary flex-grow-1" disabled={envoiSpecialiteEnCours}>
                        {envoiSpecialiteEnCours
                          ? "Enregistrement…"
                          : formulaireSpecialite.specialite_id ? "Enregistrer" : "Ajouter"}
                      </button>
                      {formulaireSpecialite.specialite_id && (
                        <button
                          type="button"
                          className="btn btn-light"
                          title="Annuler l'édition"
                          onClick={() => { setFormulaireSpecialite(SPECIALITE_VIDE); setErreurFormulaireSpecialite(null); }}
                        >
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      )}
                    </div>
                  </form>

                  <hr />

                  {/* ── Liste des spécialités existantes ───────── */}
                  {chargementSpecialites ? (
                    <div className="aps-text-muted text-center py-4">Chargement…</div>
                  ) : specialitesReferentiel.length === 0 ? (
                    <div className="aps-text-muted text-center py-4">Aucune spécialité enregistrée pour le moment.</div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table align-middle">
                        <thead>
                          <tr>
                            <th>Nom</th>
                            <th>Description</th>
                            <th className="text-end">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {specialitesReferentiel.map((s) => (
                            <tr key={s.specialite_id}>
                              <td className="fw-semibold">{s.nom}</td>
                              <td className="aps-text-muted">{s.description || "—"}</td>
                              <td className="text-end">
                                <div className="d-flex gap-2 justify-content-end">
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-light"
                                    title="Modifier"
                                    onClick={() => ouvrirEditionSpecialite(s)}
                                  >
                                    <i className="fa-solid fa-pen"></i>
                                  </button>
                                  {/* DELETE /specialites/:id réservé
                                      superadmin (voir medecinService.js) —
                                      le contrôleur renvoie 409 si des
                                      fiches médecin référencent encore
                                      cette spécialité. */}
                                  {peutSupprimer && (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-light"
                                      title="Supprimer"
                                      onClick={() => setCibleSuppressionSpecialite(s)}
                                    >
                                      <i className="fa-solid fa-trash"></i>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={fermerGestionSpecialites}>Fermer</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — CONFIRMATION DE SUPPRESSION D'UNE SPÉCIALITÉ
           (superadmin uniquement)
           ========================================================= */}
      {cibleSuppressionSpecialite && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1} onClick={() => setCibleSuppressionSpecialite(null)}>
            <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Supprimer cette spécialité ?</h5>
                  <button type="button" className="btn-close" onClick={() => setCibleSuppressionSpecialite(null)}></button>
                </div>
                <div className="modal-body">
                  <p className="mb-0">
                    La spécialité « {cibleSuppressionSpecialite.nom} » sera définitivement supprimée
                    du référentiel. Si une ou plusieurs fiches médecin y font encore référence, la
                    suppression sera refusée par le serveur.
                  </p>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-light" onClick={() => setCibleSuppressionSpecialite(null)}>Annuler</button>
                  <button type="button" className="btn btn-danger" onClick={confirmerSuppressionSpecialite} disabled={suppressionSpecialiteEnCours}>
                    {suppressionSpecialiteEnCours ? "Suppression…" : "Supprimer définitivement"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* =========================================================
           MODALE — MOT DE PASSE TEMPORAIRE (juste après création)
           Le backend ne renvoie `mot_de_passe_temporaire` qu'une seule
           fois dans la réponse de creerMedecin (voir en-tête du
           fichier) : cette modale est donc la seule occasion de le
           récupérer, à communiquer au médecin manuellement.
           ========================================================= */}
      {compteMedecinCree && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show" style={{ display: "block" }} tabIndex={-1}>
            <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    <i className="fa-solid fa-circle-check text-success me-2"></i>
                    Fiche médecin créée
                  </h5>
                </div>
                <div className="modal-body">
                  <p>
                    Le compte utilisateur de <strong>{compteMedecinCree.nomComplet}</strong> a été créé
                    avec le mot de passe temporaire ci-dessous. Communiquez-le-lui dès maintenant :
                    il ne sera plus jamais affiché ensuite.
                  </p>
                  <div className="aps-fiche-info-item mb-2">
                    <i className="fa-solid fa-envelope"></i>
                    <div>
                      <div className="aps-fiche-info-label">Email</div>
                      <div className="aps-fiche-info-valeur">{compteMedecinCree.email}</div>
                    </div>
                  </div>
                  <div className="aps-fiche-info-item">
                    <i className="fa-solid fa-key"></i>
                    <div>
                      <div className="aps-fiche-info-label">Mot de passe temporaire</div>
                      <div className="aps-fiche-info-valeur" style={{ fontFamily: "monospace", fontSize: 16 }}>
                        {compteMedecinCree.motDePasseTemporaire}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-light"
                    onClick={() => navigator.clipboard?.writeText(compteMedecinCree.motDePasseTemporaire)}
                  >
                    <i className="fa-solid fa-copy me-1"></i> Copier
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => setCompteMedecinCree(null)}>
                    J'ai communiqué ce mot de passe
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}