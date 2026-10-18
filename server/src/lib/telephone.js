// src/lib/telephone.js
// Normalisation des numéros de téléphone au format international E.164
// SANS le « + » (ex. 237690000000) : c'est le format attendu par
// WhatsApp (champ `to`) et celui stocké pour les numéros WhatsApp.
//
// Les téléphones saisis par les utilisateurs (utilisateur.telephone) sont
// libres : souvent au format local (« 690 00 00 00 »). L'indicatif est
// alors déduit du pays du compte (pays.code_iso2). Un numéro déjà
// international (« +237… » ou « 00237… ») est pris tel quel.

// Indicatifs des pays couverts ou proches. Un pays absent de la table
// impose une saisie internationale (+…).
export const INDICATIFS_PAYS = {
  CM: "237", GA: "241", CG: "242", CD: "243", TD: "235", CF: "236", GQ: "240",
  NG: "234", CI: "225", SN: "221", BJ: "229", TG: "228", BF: "226", ML: "223",
  NE: "227", GN: "224", GH: "233", RW: "250", KE: "254",
  MA: "212", DZ: "213", TN: "216",
  FR: "33", BE: "32", CH: "41", CA: "1", US: "1",
};

const FORMAT_E164 = /^[1-9]\d{7,14}$/;

/** true si `numero` est déjà au format international sans « + » (8 à 15 chiffres). */
export function estNumeroInternational(numero) {
  return FORMAT_E164.test(String(numero ?? ""));
}

/**
 * Saisie libre -> format international sans « + », ou null si le numéro
 * ne peut pas être interprété sans ambiguïté.
 *
 * @param {string} saisie   ex. "+237 690 00 00 00", "00237690000000", "690000000"
 * @param {string|null} [codeIso2]  pays servant à compléter un numéro local (ex. "CM")
 * @returns {string|null}
 */
export function normaliserNumeroInternational(saisie, codeIso2 = null) {
  const brut = String(saisie ?? "").trim().replace(/[\s.\-()/]/g, "");
  if (!brut) return null;

  let chiffres;
  if (brut.startsWith("+")) {
    chiffres = brut.slice(1);
  } else if (brut.startsWith("00")) {
    chiffres = brut.slice(2);
  } else {
    const indicatif = codeIso2 ? INDICATIFS_PAYS[String(codeIso2).toUpperCase()] : null;
    if (!indicatif || !/^\d+$/.test(brut)) return null;
    // Déjà préfixé de l'indicatif (ex. « 237690000000 » saisi sans « + »).
    if (brut.startsWith(indicatif) && brut.length >= indicatif.length + 8) {
      chiffres = brut;
    } else {
      // Préfixe national « 0 » (France, Côte d'Ivoire avant 2021…) retiré.
      chiffres = indicatif + brut.replace(/^0/, "");
    }
  }

  return FORMAT_E164.test(chiffres) ? chiffres : null;
}
