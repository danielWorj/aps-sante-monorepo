// src/lib/prisma.js
import { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({
  adapter,
  // Filet de sécurité : qr_token_secret n'est plus lu ni exposé par aucun code
  // (le scan du QR a été remplacé par la saisie du code de consultation). Même
  // un findMany/include oublié ne peut plus le faire fuir. La colonne est
  // conservée en base (NOT NULL, renseignée à la création du RDV).
  // code_unique, lui, n'est PAS omis : le patient le lit légitimement ; son
  // masquage au médecin est fait par rôle (visibiliteRole.service.js).
  omit: { rendezVous: { qr_token_secret: true } },
});

export default prisma;