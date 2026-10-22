// src/lib/paysNavigateur.js
//
// Devine le pays de l'utilisateur SANS lui demander d'autorisation, à
// partir de ce que le navigateur sait déjà : la région de sa langue
// (« fr-CM ») puis son fuseau horaire (« Africa/Douala »). C'est une
// première estimation, affinée ensuite par la position GPS si
// l'utilisateur l'accepte (voir PaysContext.jsx).

// Fuseau IANA -> code ISO 3166-1 alpha-2 (Afrique, puis quelques fuseaux
// de la diaspora). Les alias historiques renvoyés par certains navigateurs
// (ex. Africa/Dakar, lié à Africa/Abidjan) sont listés explicitement.
const FUSEAUX = {
  'Africa/Abidjan': 'CI', 'Africa/Accra': 'GH', 'Africa/Addis_Ababa': 'ET', 'Africa/Algiers': 'DZ',
  'Africa/Asmara': 'ER', 'Africa/Bamako': 'ML', 'Africa/Bangui': 'CF', 'Africa/Banjul': 'GM',
  'Africa/Bissau': 'GW', 'Africa/Blantyre': 'MW', 'Africa/Brazzaville': 'CG', 'Africa/Bujumbura': 'BI',
  'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA', 'Africa/Ceuta': 'ES', 'Africa/Conakry': 'GN',
  'Africa/Dakar': 'SN', 'Africa/Dar_es_Salaam': 'TZ', 'Africa/Djibouti': 'DJ', 'Africa/Douala': 'CM',
  'Africa/El_Aaiun': 'EH', 'Africa/Freetown': 'SL', 'Africa/Gaborone': 'BW', 'Africa/Harare': 'ZW',
  'Africa/Johannesburg': 'ZA', 'Africa/Juba': 'SS', 'Africa/Kampala': 'UG', 'Africa/Khartoum': 'SD',
  'Africa/Kigali': 'RW', 'Africa/Kinshasa': 'CD', 'Africa/Lagos': 'NG', 'Africa/Libreville': 'GA',
  'Africa/Lome': 'TG', 'Africa/Luanda': 'AO', 'Africa/Lubumbashi': 'CD', 'Africa/Lusaka': 'ZM',
  'Africa/Malabo': 'GQ', 'Africa/Maputo': 'MZ', 'Africa/Maseru': 'LS', 'Africa/Mbabane': 'SZ',
  'Africa/Mogadishu': 'SO', 'Africa/Monrovia': 'LR', 'Africa/Nairobi': 'KE', 'Africa/Ndjamena': 'TD',
  'Africa/Niamey': 'NE', 'Africa/Nouakchott': 'MR', 'Africa/Ouagadougou': 'BF', 'Africa/Porto-Novo': 'BJ',
  'Africa/Sao_Tome': 'ST', 'Africa/Tripoli': 'LY', 'Africa/Tunis': 'TN', 'Africa/Windhoek': 'NA',
  'Atlantic/Cape_Verde': 'CV', 'Indian/Antananarivo': 'MG', 'Indian/Comoro': 'KM', 'Indian/Mauritius': 'MU',
  'Indian/Mayotte': 'YT', 'Indian/Reunion': 'RE', 'Indian/Mahe': 'SC',
  'Europe/Paris': 'FR', 'Europe/Brussels': 'BE', 'Europe/Zurich': 'CH', 'America/Montreal': 'CA',
  'America/Toronto': 'CA', 'America/New_York': 'US',
};

function regionDeLangue(tag) {
  const morceaux = String(tag || '').split(/[-_]/);
  const region = morceaux.find((m, i) => i > 0 && /^[A-Za-z]{2}$/.test(m));
  return region ? region.toUpperCase() : null;
}

/**
 * @param {string[]} codesConnus codes ISO2 des pays ouverts par APS ; une
 *   estimation hors de cette liste est ignorée.
 * @returns {string|null} code ISO2 en majuscules
 */
export function codePaysDuNavigateur(codesConnus = []) {
  const connus = new Set(codesConnus.filter(Boolean).map((c) => c.toUpperCase()));
  const candidats = [];

  try {
    const langues = navigator.languages?.length ? navigator.languages : [navigator.language];
    langues.forEach((l) => candidats.push(regionDeLangue(l)));
  } catch {
    // navigator indisponible (rendu hors navigateur).
  }
  try {
    const fuseau = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Le fuseau prime sur la langue : « fr-FR » est courant hors de France.
    candidats.unshift(FUSEAUX[fuseau] ?? null);
  } catch {
    // Intl indisponible.
  }

  return candidats.find((c) => c && connus.has(c)) ?? null;
}
