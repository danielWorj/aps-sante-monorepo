// src/lib/prisma.js
import { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { extensionPerimetrePays } from "./perimetrePays.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const base = new PrismaClient({
  adapter,
  // Filet de sécurité : qr_token_secret n'est plus lu ni exposé par aucun code
  // (le scan du QR a été remplacé par la saisie du code de consultation). Même
  // un findMany/include oublié ne peut plus le faire fuir. La colonne est
  // conservée en base (NOT NULL, renseignée à la création du RDV).
  // code_unique, lui, n'est PAS omis : le patient le lit légitimement ; son
  // masquage au médecin est fait par rôle (visibiliteRole.service.js).
  omit: { rendezVous: { qr_token_secret: true } },
});

// ABAC back-office : un admin ne voit que les données de son pays (voir
// perimetrePays.js). Sans contexte admin, l'extension ne change rien.
const prisma = base.$extends(extensionPerimetrePays(base));

export default prisma;