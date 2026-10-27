// src/utils/apkVersion.js
//
// Lit la version (versionName / versionCode) d'une APK directement dans son
// AndroidManifest.xml compilé, sans dépendance : une APK est une archive ZIP
// (lue via son répertoire central + zlib) et le manifeste y est stocké au
// format « XML binaire » Android (pool de chaînes + éléments typés).
//
// Utilisé au téléversement d'une APK (gestionapk.controller.js) pour que
// l'application mobile sache, sans saisie manuelle, si une version plus
// récente est publiée (écran « Mises à jour »).

import zlib from "node:zlib";

const SIG_FIN_REPERTOIRE = 0x06054b50;
const SIG_ENTREE_CENTRALE = 0x02014b50;
const SIG_ENTETE_LOCALE = 0x04034b50;

const XML_POOL_CHAINES = 0x0001;
const XML_CARTE_RESSOURCES = 0x0180;
const XML_DEBUT_ELEMENT = 0x0102;

// Identifiants des attributs android:versionCode / android:versionName.
const RES_VERSION_CODE = 0x0101021b;
const RES_VERSION_NAME = 0x0101021c;

const TYPE_CHAINE = 0x03;
const TYPE_ENTIER_DEC = 0x10;
const TYPE_ENTIER_HEX = 0x11;

/** Extrait un fichier de l'archive ZIP (null s'il est absent). */
function lireEntreeZip(buffer, nomRecherche) {
  // Fin du répertoire central : dans les 64 Ko + 22 octets de queue.
  const debutRecherche = Math.max(0, buffer.length - 0xffff - 22);
  let fin = -1;
  for (let i = buffer.length - 22; i >= debutRecherche; i--) {
    if (buffer.readUInt32LE(i) === SIG_FIN_REPERTOIRE) { fin = i; break; }
  }
  if (fin < 0) throw new Error("Archive APK illisible (fin de répertoire introuvable).");

  const nbEntrees = buffer.readUInt16LE(fin + 10);
  let pos = buffer.readUInt32LE(fin + 16);

  for (let n = 0; n < nbEntrees; n++) {
    if (buffer.readUInt32LE(pos) !== SIG_ENTREE_CENTRALE) break;
    const methode = buffer.readUInt16LE(pos + 10);
    const tailleCompressee = buffer.readUInt32LE(pos + 20);
    const longNom = buffer.readUInt16LE(pos + 28);
    const longExtra = buffer.readUInt16LE(pos + 30);
    const longCommentaire = buffer.readUInt16LE(pos + 32);
    const offsetLocal = buffer.readUInt32LE(pos + 42);
    const nom = buffer.toString("utf8", pos + 46, pos + 46 + longNom);

    if (nom === nomRecherche) {
      if (buffer.readUInt32LE(offsetLocal) !== SIG_ENTETE_LOCALE) {
        throw new Error("Archive APK illisible (en-tête local invalide).");
      }
      const debutDonnees =
        offsetLocal + 30 + buffer.readUInt16LE(offsetLocal + 26) + buffer.readUInt16LE(offsetLocal + 28);
      const donnees = buffer.subarray(debutDonnees, debutDonnees + tailleCompressee);
      if (methode === 0) return donnees;
      if (methode === 8) return zlib.inflateRawSync(donnees);
      throw new Error(`Compression ZIP non gérée (${methode}).`);
    }
    pos += 46 + longNom + longExtra + longCommentaire;
  }
  return null;
}

/** Décode le pool de chaînes d'un XML binaire Android. */
function lirePoolChaines(buf, debut) {
  const tailleEntete = buf.readUInt16LE(debut + 2);
  const nbChaines = buf.readUInt32LE(debut + 8);
  const flags = buf.readUInt32LE(debut + 16);
  const debutChaines = debut + buf.readUInt32LE(debut + 20);
  const utf8 = (flags & 0x100) !== 0;
  const chaines = new Array(nbChaines);

  for (let i = 0; i < nbChaines; i++) {
    let p = debutChaines + buf.readUInt32LE(debut + tailleEntete + i * 4);
    if (utf8) {
      // Longueur UTF-16 puis longueur UTF-8, chacune sur 1 ou 2 octets.
      p += buf[p] & 0x80 ? 2 : 1;
      let long = buf[p];
      if (long & 0x80) { long = ((long & 0x7f) << 8) | buf[p + 1]; p += 2; } else { p += 1; }
      chaines[i] = buf.toString("utf8", p, p + long);
    } else {
      let long = buf.readUInt16LE(p);
      if (long & 0x8000) { long = ((long & 0x7fff) << 16) | buf.readUInt16LE(p + 2); p += 4; } else { p += 2; }
      chaines[i] = buf.toString("utf16le", p, p + long * 2);
    }
  }
  return chaines;
}

/** Lit versionCode / versionName / package sur l'élément <manifest> du XML binaire. */
function lireVersionManifeste(buf) {
  let chaines = [];
  let ressources = [];
  let pos = buf.readUInt16LE(2); // après l'en-tête du document

  while (pos + 8 <= buf.length) {
    const type = buf.readUInt16LE(pos);
    const tailleEntete = buf.readUInt16LE(pos + 2);
    const taille = buf.readUInt32LE(pos + 4);
    if (taille <= 0) break;

    if (type === XML_POOL_CHAINES) {
      chaines = lirePoolChaines(buf, pos);
    } else if (type === XML_CARTE_RESSOURCES) {
      const nb = (taille - tailleEntete) / 4;
      ressources = Array.from({ length: nb }, (_, i) => buf.readUInt32LE(pos + tailleEntete + i * 4));
    } else if (type === XML_DEBUT_ELEMENT) {
      const ext = pos + tailleEntete;
      const nomElement = chaines[buf.readUInt32LE(ext + 4)];
      if (nomElement === "manifest") {
        const debutAttributs = ext + buf.readUInt16LE(ext + 8);
        const tailleAttribut = buf.readUInt16LE(ext + 10);
        const nbAttributs = buf.readUInt16LE(ext + 12);
        const version = { versionCode: null, versionName: null, packageName: null };

        for (let i = 0; i < nbAttributs; i++) {
          const a = debutAttributs + i * tailleAttribut;
          const indexNom = buf.readUInt32LE(a + 4);
          const valeurBrute = buf.readInt32LE(a + 8);
          const typeDonnee = buf[a + 15];
          const donnee = buf.readUInt32LE(a + 16);
          const nom = chaines[indexNom];
          const idRessource = ressources[indexNom];

          if (idRessource === RES_VERSION_CODE || nom === "versionCode") {
            if (typeDonnee === TYPE_ENTIER_DEC || typeDonnee === TYPE_ENTIER_HEX) version.versionCode = donnee;
            else if (typeDonnee === TYPE_CHAINE) version.versionCode = Number(chaines[donnee]) || null;
          } else if (idRessource === RES_VERSION_NAME || nom === "versionName") {
            if (typeDonnee === TYPE_CHAINE) version.versionName = chaines[donnee];
            else if (valeurBrute >= 0) version.versionName = chaines[valeurBrute];
          } else if (nom === "package" && valeurBrute >= 0) {
            // Attribut sans espace de noms android : identifiant de l'application.
            version.packageName = chaines[valeurBrute];
          }
        }
        return version;
      }
    }
    pos += taille;
  }
  throw new Error("Élément <manifest> introuvable dans l'APK.");
}

/**
 * @param {Buffer} buffer - contenu complet du fichier .apk
 * @returns {{ versionCode: number|null, versionName: string|null, packageName: string|null }}
 * @throws si l'archive ou le manifeste sont illisibles
 */
export function lireVersionApk(buffer) {
  const manifeste = lireEntreeZip(buffer, "AndroidManifest.xml");
  if (!manifeste) throw new Error("AndroidManifest.xml absent de l'APK.");
  return lireVersionManifeste(manifeste);
}

/**
 * Numéro de build comparable entre APK : Flutter, en « split-per-abi »,
 * publie versionCode = abi × 1000 + build (ex. 2003 pour arm64-v8a, build 3).
 * On compare donc le build seul, ce qui suppose un build inférieur à 1000.
 */
export function numeroBuild(versionCode) {
  if (!Number.isInteger(versionCode)) return null;
  return versionCode >= 1000 ? versionCode % 1000 : versionCode;
}
