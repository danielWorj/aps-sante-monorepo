// src/lib/whatsappService.js
// Seul point d'accès à l'API WhatsApp Cloud de Meta (même convention que
// campayService.js / stripeService.js). Aucun accès base ici : le choix du
// numéro expéditeur et le journal des envois sont faits par
// services/whatsapp.service.js, que les services métier doivent utiliser.
//
// Configuration (variables d'environnement) :
//   WHATSAPP_ACCESS_TOKEN  jeton d'accès permanent (utilisateur système Meta Business) — SECRET
//   WHATSAPP_API_VERSION   version de l'API Graph (défaut v21.0)
//   WHATSAPP_GRAPH_URL     défaut https://graph.facebook.com
// Le numéro expéditeur (phone_number_id) vient de la base (table numero_whatsapp).

const VERSION_API = process.env.WHATSAPP_API_VERSION || "v21.0";
const GRAPH_URL = (process.env.WHATSAPP_GRAPH_URL || "https://graph.facebook.com").replace(/\/$/, "");
const DELAI_APPEL_MS = 15_000;

// Codes d'erreur Meta pour lesquels réessayer plus tard a un sens
// (limite de débit, indisponibilité temporaire). Tout autre refus est
// définitif : réessayer produirait le même résultat.
// https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
const CODES_TRANSITOIRES = new Set([1, 2, 4, 80007, 130429, 131000, 131016, 131048, 131056, 133004]);

const MESSAGES = {
  131047: "Hors de la fenêtre de 24 h : un message libre n'est plus possible, utilisez un modèle approuvé.",
  131026: "Message non délivrable à ce numéro (pas de compte WhatsApp ou version obsolète).",
  131030: "Numéro destinataire non autorisé (compte Meta en mode test : ajoutez-le à la liste des destinataires).",
  132000: "Le nombre de paramètres ne correspond pas au modèle.",
  132001: "Modèle introuvable ou pas encore approuvé dans cette langue.",
  133010: "Le numéro expéditeur n'est pas enregistré auprès de WhatsApp.",
  190: "Jeton d'accès WhatsApp invalide ou expiré.",
};

export class WhatsappError extends Error {
  // transitoire : l'échec peut disparaître en réessayant plus tard (débit,
  // réseau, panne Meta) — le job de relance s'en charge.
  constructor(message, { status = 502, code = null, payload = null, transitoire = false } = {}) {
    super(message);
    this.name = "WhatsappError";
    this.status = status;
    this.code = code;
    this.payload = payload;
    this.transitoire = transitoire;
  }
}

/** true si le jeton d'accès est configuré (affiché au back-office, jamais sa valeur). */
export function whatsappConfigure() {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN);
}

export function versionApiWhatsapp() {
  return VERSION_API;
}

// Lu à l'appel (et non à l'import) : un jeton absent ne doit pas empêcher le
// serveur de démarrer, seulement les envois WhatsApp d'échouer proprement.
function jetonWhatsapp() {
  const jeton = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!jeton) {
    throw new WhatsappError("WhatsApp n'est pas configuré (WHATSAPP_ACCESS_TOKEN manquant).", {
      status: 503, code: "NON_CONFIGURE",
    });
  }
  return jeton;
}

async function appelGraph(chemin, { method = "GET", body } = {}) {
  const jeton = jetonWhatsapp();
  let res;
  try {
    res = await fetch(`${GRAPH_URL}/${VERSION_API}${chemin}`, {
      method,
      headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(DELAI_APPEL_MS),
    });
  } catch (err) {
    throw new WhatsappError("WhatsApp (Meta) est momentanément injoignable.", {
      code: "INJOIGNABLE", payload: String(err), transitoire: true,
    });
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Corps illisible : traité comme une panne côté Meta.
  }

  if (!res.ok || data?.error) {
    const e = data?.error ?? {};
    const code = e.code ?? res.status;
    throw new WhatsappError(MESSAGES[code] || e.error_data?.details || e.message || `Erreur WhatsApp (HTTP ${res.status}).`, {
      status: res.status >= 500 ? 502 : res.status,
      code: String(code),
      payload: data,
      transitoire: res.status >= 500 || res.status === 429 || CODES_TRANSITOIRES.has(Number(code)),
    });
  }
  return data;
}

/**
 * Corps « messages » de l'API Cloud.
 * @param {{ destinataire: string, type: "texte"|"modele", contenu: object }} m
 */
export function construireCorpsMessage({ destinataire, type, contenu }) {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: destinataire };
  if (type === "texte") {
    return { ...base, type: "text", text: { preview_url: false, body: contenu.texte } };
  }
  return {
    ...base,
    type: "template",
    template: {
      name: contenu.nom,
      language: { code: contenu.langue },
      ...(contenu.composants?.length && { components: contenu.composants }),
    },
  };
}

/**
 * Envoie un message depuis le numéro `phone_number_id`.
 * @returns {Promise<{ identifiant: string, wa_id: string|null }>} identifiant = wamid du message
 * @throws {WhatsappError}
 */
export async function envoyerMessageMeta({ phone_number_id, destinataire, type, contenu }) {
  const data = await appelGraph(`/${encodeURIComponent(phone_number_id)}/messages`, {
    method: "POST",
    body: construireCorpsMessage({ destinataire, type, contenu }),
  });
  const identifiant = data?.messages?.[0]?.id;
  if (!identifiant) {
    throw new WhatsappError("Réponse WhatsApp inattendue (identifiant du message absent).", {
      code: "REPONSE_INATTENDUE", payload: data, transitoire: false,
    });
  }
  return { identifiant, wa_id: data?.contacts?.[0]?.wa_id ?? null };
}

/**
 * Informations du numéro chez Meta : sert à vérifier depuis le back-office
 * qu'un phone_number_id correspond bien au numéro saisi.
 * @returns {Promise<{ display_phone_number: string, verified_name: string, quality_rating: string, code_verification_status?: string }>}
 */
export function lireNumeroMeta(phone_number_id) {
  return appelGraph(
    `/${encodeURIComponent(phone_number_id)}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`
  );
}
