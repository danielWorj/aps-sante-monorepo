-- Accusé de réception WhatsApp envoyé à l'annonceur dès la création de sa
-- demande de publicité (texte modifiable au back-office).
INSERT INTO "modele_message_whatsapp" ("code", "libelle", "texte") VALUES
('publicite_soumise', 'Demande de publicité reçue',
 'Bonjour {annonceur}, nous avons bien reçu votre demande de publicité « {titre} » ({emplacement}, position {position}, du {date_debut} au {date_fin}). Elle est en cours d''examen par APS Santé. Vous serez notifié par WhatsApp dès son acceptation et pourrez alors payer ({montant}) pour que votre publicité soit visible sur le site.')
ON CONFLICT ("code") DO NOTHING;
