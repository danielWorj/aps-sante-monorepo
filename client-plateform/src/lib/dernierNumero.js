// src/lib/dernierNumero.js
//
// Dernier numéro de téléphone (et son pays) avec lequel une connexion a
// abouti dans ce navigateur : FormulaireConnexion le préremplit. Enregistré
// seulement une fois le numéro accepté par le serveur ; « Utiliser un autre
// numéro » l'oublie. Le code PIN n'est jamais conservé.
// Simple confort : toute erreur de stockage (navigation privée…) est ignorée.

const CLE = 'aps_dernier_numero';

export function lireDernierNumero() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) || 'null');
    const telephone = typeof brut?.telephone === 'string' ? brut.telephone.trim() : '';
    if (!telephone) return null;
    return { telephone, pays_iso2: typeof brut.pays_iso2 === 'string' && brut.pays_iso2 ? brut.pays_iso2 : null };
  } catch {
    return null;
  }
}

export function enregistrerDernierNumero(telephone, pays_iso2) {
  const numero = (telephone || '').trim();
  if (!numero) return;
  try {
    localStorage.setItem(CLE, JSON.stringify({ telephone: numero, pays_iso2 }));
  } catch { /* stockage indisponible */ }
}

export function oublierDernierNumero() {
  try {
    localStorage.removeItem(CLE);
  } catch { /* stockage indisponible */ }
}
