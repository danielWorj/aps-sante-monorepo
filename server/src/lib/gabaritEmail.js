// src/lib/gabaritEmail.js
//
// Gabarit HTML commun des e-mails d'APS Santé.
//
// Contraintes des clients de messagerie (Gmail, Outlook, Apple Mail, webmails
// mobiles) : mise en page en tableaux, styles EN LIGNE uniquement, largeur
// fixe 600 px qui se réduit sur mobile, polices système, pas de CSS externe
// ni de JavaScript. Le logo est joint à l'e-mail (Content-ID, voir
// LOGO_EMAIL_CID et lib/emailService.js) : il s'affiche même quand le client
// bloque les images distantes.
//
// Structure :
//   en-tête      logo + nom de la plateforme, liseré vert
//   corps        titre, salutation, paragraphes, encadré d'informations,
//                étapes numérotées, bouton principal, boutons secondaires
//   signature    « L'équipe APS Santé »
//   pied         contact, mention légale, raison de l'envoi

export const LOGO_EMAIL_CID = "logo-aps@apssante";

const COULEURS = {
  vert: "#16996C",
  vertFonce: "#0F6B4C",
  vertClair: "#E7F6EE",
  encre: "#0F1C17",
  texte: "#33413B",
  doux: "#6B7A73",
  ligne: "#E3E9E6",
  fond: "#F2F5F4",
  blanc: "#FFFFFF",
};
const POLICE = "'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";

export const echapper = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Les URL du texte deviennent des liens cliquables.
const avecLiens = (s) =>
  echapper(s).replace(
    /https?:\/\/[^\s<]+/g,
    (url) => `<a href="${url}" style="color:${COULEURS.vert};text-decoration:underline;word-break:break-all;">${url}</a>`
  );

function paragraphe(texte) {
  return `<p style="margin:0 0 16px;font-family:${POLICE};font-size:15px;line-height:24px;color:${COULEURS.texte};">${avecLiens(texte)}</p>`;
}

function encadreDetails(details) {
  if (!details.length) return "";
  const lignes = details
    .map(([libelle, valeur], i) => {
      const bord = i ? `border-top:1px solid ${COULEURS.ligne};` : "";
      return (
        `<tr>` +
        `<td style="padding:12px 16px;${bord}font-family:${POLICE};font-size:13px;line-height:18px;color:${COULEURS.doux};">${echapper(libelle)}</td>` +
        `<td align="right" style="padding:12px 16px;${bord}font-family:${POLICE};font-size:14px;line-height:18px;color:${COULEURS.encre};font-weight:600;">${echapper(valeur)}</td>` +
        `</tr>`
      );
    })
    .join("");
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="margin:4px 0 22px;border:1px solid ${COULEURS.ligne};border-radius:10px;border-collapse:separate;background:#FAFCFB;">${lignes}</table>`
  );
}

function listeEtapes(etapes) {
  if (!etapes.length) return "";
  const lignes = etapes
    .map(
      (etape, i) =>
        `<tr>` +
        `<td width="36" valign="top" style="padding:0 0 14px;">` +
        `<div style="width:26px;height:26px;border-radius:13px;background:${COULEURS.vertClair};color:${COULEURS.vertFonce};` +
        `font-family:${POLICE};font-size:13px;line-height:26px;font-weight:700;text-align:center;">${i + 1}</div></td>` +
        `<td valign="top" style="padding:3px 0 14px;font-family:${POLICE};font-size:14px;line-height:21px;color:${COULEURS.texte};">${avecLiens(etape)}</td>` +
        `</tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 10px;">${lignes}</table>`;
}

function boutonPrincipal(bouton) {
  if (!bouton) return "";
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 26px;">` +
    `<tr><td align="center" bgcolor="${COULEURS.vert}" style="border-radius:10px;">` +
    `<a href="${echapper(bouton.url)}" target="_blank" ` +
    `style="display:inline-block;padding:14px 32px;font-family:${POLICE};font-size:15px;line-height:20px;font-weight:600;` +
    `color:${COULEURS.blanc};text-decoration:none;border-radius:10px;">${echapper(bouton.libelle)}</a>` +
    `</td></tr></table>`
  );
}

// Boutons empilés (une ligne chacun) : jamais de débordement sur mobile.
function blocSecondaire(titre, boutons) {
  if (!boutons.length) return "";
  const lignes = boutons
    .map(
      (b) =>
        `<tr><td align="center" style="padding:0 0 10px;">` +
        `<a href="${echapper(b.url)}" target="_blank" ` +
        `style="display:block;max-width:260px;margin:0 auto;padding:11px 16px;border:1px solid ${COULEURS.vert};border-radius:10px;background:${COULEURS.blanc};` +
        `font-family:${POLICE};font-size:14px;line-height:18px;font-weight:600;color:${COULEURS.vertFonce};text-decoration:none;text-align:center;">` +
        `${echapper(b.libelle)}</a></td></tr>`
    )
    .join("");
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="margin:0 0 24px;background:${COULEURS.fond};border-radius:12px;">` +
    `<tr><td align="center" style="padding:20px 16px 12px;font-family:${POLICE};font-size:15px;line-height:22px;font-weight:700;color:${COULEURS.encre};">${echapper(titre)}</td></tr>` +
    `<tr><td style="padding:0 16px 8px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${lignes}</table>` +
    `</td></tr></table>`
  );
}

/**
 * Construit le HTML d'un e-mail APS Santé.
 *
 * @param {object} p
 * @param {string} p.titre                       titre principal (et <title>)
 * @param {string} [p.preentete]                 aperçu affiché par la boîte de réception
 * @param {string} [p.salutation]                ex. « Bonjour Dr Ayuk, »
 * @param {string[]} [p.paragraphes]             texte (les URL deviennent des liens)
 * @param {Array<[string, string]>} [p.details]  encadré libellé / valeur
 * @param {string[]} [p.etapes]                  étapes numérotées
 * @param {{ libelle: string, url: string }|null} [p.bouton]   bouton principal
 * @param {{ titre: string, boutons: Array<{ libelle: string, url: string }> }|null} [p.secondaire]
 * @param {string[]} [p.apresBouton]             paragraphes après les boutons
 * @param {boolean} [p.signature=true]           « L'équipe APS Santé »
 * @param {string} [p.pied]                      raison de l'envoi (pied de page)
 */
export function construireEmailHtml({
  titre,
  preentete = "",
  salutation = "",
  paragraphes = [],
  details = [],
  etapes = [],
  bouton = null,
  secondaire = null,
  apresBouton = [],
  signature = true,
  pied = null,
}) {
  const contact = process.env.CONTACT_EMAIL || "";
  const site = process.env.FRONTEND_URL || "";
  const annee = new Date().getFullYear();

  const corps = [
    `<h1 class="aps-titre" style="margin:0 0 18px;font-family:${POLICE};font-size:22px;line-height:30px;font-weight:700;color:${COULEURS.encre};">${echapper(titre)}</h1>`,
    salutation ? paragraphe(salutation) : "",
    ...paragraphes.filter(Boolean).map(paragraphe),
    encadreDetails(details),
    listeEtapes(etapes),
    boutonPrincipal(bouton),
    secondaire ? blocSecondaire(secondaire.titre, secondaire.boutons ?? []) : "",
    ...apresBouton.filter(Boolean).map(paragraphe),
    signature
      ? `<p style="margin:8px 0 0;font-family:${POLICE};font-size:15px;line-height:24px;color:${COULEURS.texte};">` +
        `Cordialement,<br><strong style="color:${COULEURS.encre};">L'équipe APS Santé</strong></p>`
      : "",
  ].join("");

  const liensPied = [
    site ? `<a href="${echapper(site)}" style="color:${COULEURS.vertFonce};text-decoration:none;">${echapper(site.replace(/^https?:\/\//, ""))}</a>` : "",
    contact ? `<a href="mailto:${echapper(contact)}" style="color:${COULEURS.vertFonce};text-decoration:none;">${echapper(contact)}</a>` : "",
  ]
    .filter(Boolean)
    .join(" &nbsp;·&nbsp; ");

  return `<!doctype html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${echapper(titre)}</title>
<style>
  @media only screen and (max-width:620px) {
    .aps-contenu { padding:24px 20px 22px !important; }
    .aps-titre { font-size:20px !important; line-height:27px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COULEURS.fond};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${echapper(preentete || titre)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COULEURS.fond};">
<tr><td align="center" style="padding:28px 12px;">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
  <!-- En-tête -->
  <tr><td align="center" style="padding:0 0 18px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle" style="padding-right:12px;">
        <img src="cid:${LOGO_EMAIL_CID}" width="64" height="64" alt="APS Santé" style="display:block;width:64px;height:64px;border:0;border-radius:12px;">
      </td>
      <td valign="middle" style="font-family:${POLICE};">
        <div style="font-size:20px;line-height:24px;font-weight:800;color:${COULEURS.encre};">APS Santé</div>
        <div style="font-size:12px;line-height:16px;color:${COULEURS.doux};">Santé à portée de tous</div>
      </td>
    </tr></table>
  </td></tr>

  <!-- Carte -->
  <tr><td style="background:${COULEURS.blanc};border:1px solid ${COULEURS.ligne};border-radius:16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="height:5px;line-height:5px;font-size:0;background:${COULEURS.vert};border-radius:16px 16px 0 0;">&nbsp;</td></tr>
      <tr><td class="aps-contenu" style="padding:32px 36px 30px;">${corps}</td></tr>
    </table>
  </td></tr>

  <!-- Pied -->
  <tr><td align="center" style="padding:22px 24px 6px;font-family:${POLICE};font-size:12px;line-height:19px;color:${COULEURS.doux};">
    ${echapper(pied ?? "Vous recevez cet e-mail en lien avec votre compte APS Santé.")}
  </td></tr>
  ${liensPied ? `<tr><td align="center" style="padding:2px 24px;font-family:${POLICE};font-size:12px;line-height:19px;">${liensPied}</td></tr>` : ""}
  <tr><td align="center" style="padding:6px 24px 0;font-family:${POLICE};font-size:11px;line-height:17px;color:#9AA7A1;">
    © ${annee} APS Santé — AZA Santé Assurances. Merci de ne pas répondre directement à cet e-mail automatique.
  </td></tr>
</table>

</td></tr>
</table>
</body>
</html>`;
}
