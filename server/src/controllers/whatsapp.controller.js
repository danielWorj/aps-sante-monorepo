// src/controllers/whatsapp.controller.js
// WhatsApp — API d'administration : numéros expéditeurs, message de test,
// journal des envois. Toute la logique vit dans numeroWhatsapp.service.js
// et whatsapp.service.js (point unique d'envoi des services métier).

import {
  ErreurWhatsapp,
  listerNumerosWhatsapp,
  creerNumeroWhatsapp,
  modifierNumeroWhatsapp,
  activerNumeroWhatsapp,
  desactiverNumeroWhatsapp,
  supprimerNumeroWhatsapp,
  verifierNumeroWhatsapp,
  obtenirNumeroWhatsappActif,
} from "../services/numeroWhatsapp.service.js";
import {
  envoyerWhatsapp,
  listerMessagesWhatsapp,
  renvoyerMessageWhatsapp,
  RELANCE_MAX_TENTATIVES,
  RELANCE_FENETRE_H,
} from "../services/whatsapp.service.js";
import { WhatsappError, whatsappConfigure, versionApiWhatsapp } from "../lib/whatsappService.js";
import { listerModelesMessage, modifierModeleMessage, VARIABLES_MODELES } from "../services/modeleMessageWhatsapp.service.js";

const STATUTS_MESSAGE = ["en_attente", "envoye", "echec"];
const TAILLE_PAGE_MAX = 100;

function repondreErreur(err, res, next) {
  if (err instanceof ErreurWhatsapp) {
    return res.status(err.status).json({ message: err.message, code: err.code });
  }
  // Erreur renvoyée par Meta (vérification d'un numéro).
  if (err instanceof WhatsappError) {
    return res.status(err.status).json({ message: err.message, code: err.code });
  }
  if (err?.code === "P2002") {
    return res.status(409).json({
      message: "Ce numéro ou ce phone_number_id est déjà enregistré (ou un autre numéro vient d'être activé). Réessayez.",
      code: "NUMERO_WHATSAPP_CONFLIT",
    });
  }
  return next(err);
}

/**
 * GET /api/whatsapp/configuration
 * État du socle pour le back-office : jeton présent (jamais sa valeur),
 * numéro actif, règles de relance.
 */
export async function obtenirConfigurationWhatsappCtrl(_req, res, next) {
  try {
    const actif = await obtenirNumeroWhatsappActif();
    return res.status(200).json({
      configuration: {
        jeton_configure: whatsappConfigure(),
        version_api: versionApiWhatsapp(),
        numero_actif: actif,
        relance_max_tentatives: RELANCE_MAX_TENTATIVES,
        relance_fenetre_heures: RELANCE_FENETRE_H,
      },
    });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** GET /api/whatsapp/numeros */
export async function listerNumerosWhatsappCtrl(_req, res, next) {
  try {
    const numeros = await listerNumerosWhatsapp();
    return res.status(200).json({
      numeros_whatsapp: numeros.map(({ _count, ...n }) => ({ ...n, nombre_messages: _count.messages })),
    });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** POST /api/whatsapp/numeros  Body : { libelle, numero, phone_number_id, waba_id?, actif? } */
export async function creerNumeroWhatsappCtrl(req, res, next) {
  try {
    const numero = await creerNumeroWhatsapp(req.body ?? {}, req.utilisateur.utilisateur_id);
    return res.status(201).json({ message: "Numéro WhatsApp enregistré.", numero_whatsapp: numero });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** PATCH /api/whatsapp/numeros/:id  Body : { libelle?, numero?, phone_number_id?, waba_id? } */
export async function modifierNumeroWhatsappCtrl(req, res, next) {
  try {
    const { libelle, numero, phone_number_id, waba_id } = req.body ?? {};
    const modifie = await modifierNumeroWhatsapp(
      req.params.id,
      { libelle, numero, phone_number_id, waba_id },
      req.utilisateur.utilisateur_id
    );
    return res.status(200).json({ message: "Numéro WhatsApp modifié.", numero_whatsapp: modifie });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** POST /api/whatsapp/numeros/:id/activer */
export async function activerNumeroWhatsappCtrl(req, res, next) {
  try {
    const numero = await activerNumeroWhatsapp(req.params.id, req.utilisateur.utilisateur_id);
    return res.status(200).json({
      message: "Numéro activé : tous les messages WhatsApp partent désormais de ce numéro.",
      numero_whatsapp: numero,
    });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** POST /api/whatsapp/numeros/:id/desactiver */
export async function desactiverNumeroWhatsappCtrl(req, res, next) {
  try {
    const numero = await desactiverNumeroWhatsapp(req.params.id, req.utilisateur.utilisateur_id);
    return res.status(200).json({
      message: "Numéro désactivé : aucun message WhatsApp ne part tant qu'aucun numéro n'est actif.",
      numero_whatsapp: numero,
    });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** DELETE /api/whatsapp/numeros/:id */
export async function supprimerNumeroWhatsappCtrl(req, res, next) {
  try {
    await supprimerNumeroWhatsapp(req.params.id, req.utilisateur.utilisateur_id);
    return res.status(200).json({ message: "Numéro WhatsApp supprimé." });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** POST /api/whatsapp/numeros/:id/verifier  -> { correspond, meta } (interroge Meta, ne modifie rien) */
export async function verifierNumeroWhatsappCtrl(req, res, next) {
  try {
    const verification = await verifierNumeroWhatsapp(req.params.id);
    return res.status(200).json({ verification });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/**
 * POST /api/whatsapp/test
 * Body : { destinataire, texte } ou { destinataire, modele: { nom, langue, parametres } }
 * Envoie depuis le numéro actif et renvoie le résultat (journalisé, origine
 * « test_back_office »). Rappel : un texte libre n'arrive que si le
 * destinataire a écrit au numéro dans les dernières 24 h ; sinon tester avec
 * un modèle (ex. hello_world, langue en_US).
 */
export async function envoyerMessageTestWhatsappCtrl(req, res, next) {
  try {
    const { destinataire, texte, modele } = req.body ?? {};
    const r = await envoyerWhatsapp({ destinataire, texte, modele, origine: "test_back_office" });
    const ok = r.statut === "envoye";
    return res.status(ok ? 200 : 502).json({
      message: ok ? "Message accepté par WhatsApp." : r.erreur || "Échec de l'envoi.",
      code: ok ? undefined : r.erreur_code,
      resultat: r,
    });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** GET /api/whatsapp/messages?statut=&origine=&recherche=&page=&taille= */
export async function listerMessagesWhatsappCtrl(req, res, next) {
  try {
    const { statut, origine, recherche } = req.query;
    if (statut !== undefined && !STATUTS_MESSAGE.includes(statut)) {
      return res.status(400).json({ message: `statut invalide. Valeurs acceptées : ${STATUTS_MESSAGE.join(", ")}.` });
    }
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const taille = Math.min(TAILLE_PAGE_MAX, Math.max(1, Number.parseInt(req.query.taille, 10) || 50));
    const journal = await listerMessagesWhatsapp({
      statut,
      origine: origine || undefined,
      recherche: recherche || undefined,
      page,
      taille,
    });
    return res.status(200).json(journal);
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** POST /api/whatsapp/messages/:id/renvoyer (message en échec uniquement) */
export async function renvoyerMessageWhatsappCtrl(req, res, next) {
  try {
    const r = await renvoyerMessageWhatsapp(req.params.id);
    const ok = r.statut === "envoye";
    return res.status(ok ? 200 : 502).json({
      message: ok ? "Message renvoyé." : r.erreur || "Nouvel échec de l'envoi.",
      code: ok ? undefined : r.erreur_code,
      resultat: r,
    });
  } catch (err) {
    return repondreErreur(err, res, next);
  }
}

/** GET /api/whatsapp/modeles-messages — textes éditables et variables disponibles. */
export async function listerModelesMessageCtrl(_req, res, next) {
  try {
    const modeles = await listerModelesMessage();
    return res.status(200).json({ modeles: modeles.map((m) => ({ ...m, variables: VARIABLES_MODELES[m.code] ?? [] })) });
  } catch (err) {
    repondreErreur(err, res, next);
  }
}

/** PUT /api/whatsapp/modeles-messages/:code   body: { libelle?, texte?, nom_modele_meta?, langue?, actif? } */
export async function modifierModeleMessageCtrl(req, res, next) {
  try {
    const modele = await modifierModeleMessage(req.params.code, req.body ?? {}, req.utilisateur.utilisateur_id);
    return res.status(200).json({ message: "Message enregistré.", modele: { ...modele, variables: VARIABLES_MODELES[modele.code] ?? [] } });
  } catch (err) {
    repondreErreur(err, res, next);
  }
}
