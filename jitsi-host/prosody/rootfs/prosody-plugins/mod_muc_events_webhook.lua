-- mod_muc_events_webhook
--
-- Notifie le backend APS (server/, voir src/routes/visioWebhook.routes.js
-- et src/controllers/visio.controller.js, traiterFinSessionVisio) quand
-- une room de téléconsultation est détruite — c'est-à-dire, en
-- pratique, quand le dernier participant l'a quittée. C'est ce signal
-- qui déclenche la libération de l'escrow côté backend (politique de
-- gestion des fonds §2 : "la libération intervient à la clôture de la
-- session").
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

local function envoyer_evenement(room_jid)
	local node = jid_split(room_jid);
	if not node then
		return;
	end

	local corps = json.encode({
		event = "muc-room-destroyed",
		room = node,
		domain = module.host,
		timestamp = os.time(),
	});

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
					"webhook fin de session (room=%s) a échoué : code=%s corps=%s",
					node, tostring(response_code), tostring(response_body)
				);
			end
		end);
	end);
	if not ok then
		-- Ne jamais faire remonter d'erreur jusqu'au cycle de vie de la
		-- room : un webhook qui échoue ne doit pas empêcher la room de
		-- se détruire normalement.
		module:log("error", "échec d'envoi du webhook fin de session (room=%s) : %s", node, tostring(err));
	end
end

-- Déclenché par mod_muc (core Prosody) quand une room non persistante
-- devient vide et est détruite. C'est le signal le plus proche de
-- "fin de la téléconsultation" disponible nativement, sans coupler ce
-- module à la logique applicative des occupants un par un.
module:hook("muc-room-destroyed", function (event)
	envoyer_evenement(event.room.jid);
end);