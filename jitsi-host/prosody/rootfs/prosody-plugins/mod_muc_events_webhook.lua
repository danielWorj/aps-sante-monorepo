-- mod_muc_events_webhook
--
-- Notifie le backend APS (server/, voir src/routes/visioWebhook.routes.js
-- et src/controllers/visio.controller.js, traiterFinSessionVisio) de deux
-- événements d'une room de téléconsultation :
--
--   * muc-occupant-joined : un participant IDENTIFIÉ PAR SON JWT entre dans
--     la room (politique de fonds v2 §5, étape 6). Le backend en déduit sa
--     partie (médecin / patient) et enregistre sa PRÉSENCE. Les occupants
--     sans identité JWT (jicofo, jibri…) sont ignorés.
--
--   * muc-room-destroyed : la room est détruite — c'est-à-dire, en
--     pratique, quand le dernier participant l'a quittée. C'est ce signal
--     qui déclenche la libération de l'escrow côté backend (politique de
--     gestion des fonds §2 : "la libération intervient à la clôture de la
--     session"), si les deux présences sont enregistrées.
--
-- ⚠️ Limite connue (à signaler côté produit, pas résolue par ce
-- module) : cet événement ne se déclenche que quand TOUS les
-- participants sont partis, pas spécifiquement à la sortie du
-- médecin. Si seul le patient quitte, la room reste ouverte et la
-- libération n'a pas encore lieu.
--
-- Activation : ce module se charge lui-même dans modules_enabled du
-- composant MUC principal UNIQUEMENT si MUC_EVENTS_WEBHOOK_URL est
-- défini (voir jitsi-meet.cfg.lua) — sinon il ne fait rien
-- (aucune configuration = aucun envoi, jamais d'erreur au démarrage).
--
-- Format envoyé : POST JSON { event, room, domain, timestamp }, avec
-- un en-tête X-Aps-Signature = HMAC-SHA256(corps_brut, secret) en
-- hexadécimal — même principe qu'un webhook Stripe, mais défini par
-- nous puisque Prosody/Jitsi n'a pas de webhook signé natif.

local http = require "net.http";
local json = require "util.json";
local hashes = require "util.hashes";
local jid_split = require "util.jid".split;

local webhook_url = module:get_option_string("muc_events_webhook_url");
local webhook_secret = module:get_option_string("muc_events_webhook_secret");

if not webhook_url or webhook_url == "" then
	module:log("info", "muc_events_webhook_url non configuré — mod_muc_events_webhook inactif.");
	return;
end
if not webhook_secret or webhook_secret == "" then
	module:log(
		"error",
		"muc_events_webhook_url défini mais muc_events_webhook_secret manquant — mod_muc_events_webhook inactif."
	);
	return;
end

local function envoyer_evenement(nom_evenement, room_jid, extra)
	local node = jid_split(room_jid);
	if not node then
		return;
	end

	local charge = {
		event = nom_evenement,
		room = node,
		domain = module.host,
		timestamp = os.time(),
	};
	if extra then
		for cle, valeur in pairs(extra) do
			charge[cle] = valeur;
		end
	end
	local corps = json.encode(charge);

	local signature = hashes.hmac_sha256(webhook_secret, corps, true); -- true = sortie hex

	local ok, err = pcall(function ()
		http.request(webhook_url, {
			method = "POST",
			headers = {
				["Content-Type"] = "application/json",
				["X-Aps-Signature"] = signature,
			},
			body = corps,
		}, function (response_body, response_code)
			if not response_code or response_code >= 300 then
				module:log(
					"warn",
					"webhook %s (room=%s) a échoué : code=%s corps=%s",
					nom_evenement, node, tostring(response_code), tostring(response_body)
				);
			end
		end);
	end);
	if not ok then
		-- Ne jamais faire remonter d'erreur jusqu'au cycle de vie de la
		-- room : un webhook qui échoue ne doit pas empêcher la room de
		-- se détruire normalement, ni un participant d'y entrer.
		module:log("error", "échec d'envoi du webhook %s (room=%s) : %s", nom_evenement, node, tostring(err));
	end
end

-- Déclenché par mod_muc (core Prosody) quand une room non persistante
-- devient vide et est détruite. C'est le signal le plus proche de
-- "fin de la téléconsultation" disponible nativement, sans coupler ce
-- module à la logique applicative des occupants un par un.
module:hook("muc-room-destroyed", function (event)
	envoyer_evenement("muc-room-destroyed", event.room.jid);
end);

-- Étape 6 (politique de fonds v2 §5) — présence en téléconsultation.
-- Déclenché quand un occupant entre dans la room. L'identité vient du JWT
-- vérifié à la connexion : mod_auth_token pose `jitsi_meet_context_user`
-- (= context.user du JWT généré par server/src/services/jitsi.service.js,
-- qui porte `id` = utilisateur_id et `email`) sur la session de l'occupant.
-- Sans identité (jicofo, jibri, transcriber…), on n'envoie rien : ce ne
-- sont pas des parties au rendez-vous.
--
-- ⚠️ À valider sur l'instance Jitsi réelle : ce hook n'a pas pu être exécuté
-- dans l'environnement de développement de l'étape 6 (voir rapport).
module:hook("muc-occupant-joined", function (event)
	local session = event.origin;
	local utilisateur = session and session.jitsi_meet_context_user;
	if not utilisateur then
		return;
	end
	envoyer_evenement("muc-occupant-joined", event.room.jid, {
		user_id = utilisateur.id,
		email = utilisateur.email,
	});
end);