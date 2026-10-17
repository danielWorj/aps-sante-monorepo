// src/lib/audit.js
// Journal d'audit immuable (EF-AUD-01 — guide abonnements assurances v3,
// §1.1.1). La table journal_audit est en AJOUT SEUL : un déclencheur SQL
// refuse UPDATE et DELETE (migration 20261013100000_journal_audit).

/**
 * Écrit une ligne d'audit.
 * `client` = prisma OU `tx` : passer `tx` pour que l'audit soit écrit dans
 * la même transaction que l'action journalisée (pas d'action sans trace,
 * pas de trace sans action).
 *
 * @param {object} client  prisma ou tx
 * @param {{ acteur_id?: string|null, type: string, objet_type: string, objet_id?: string|null, details?: object|null }} entree
 *   acteur_id null = système (webhook, cron).
 */
export async function journaliserAudit(client, { acteur_id = null, type, objet_type, objet_id = null, details = null }) {
  return client.journalAudit.create({ data: { acteur_id, type, objet_type, objet_id, details } });
}
