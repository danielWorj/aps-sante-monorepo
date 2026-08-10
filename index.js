import express from "express";
import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import authentificationRoutes from "./src/routes/authentification.routes.js";
import referentielsRoutes from "./src/routes/referentiels.routes.js";
import centreSanteRoutes from "./src/routes/centreSante.routes.js";
import pharmacieRoutes from "./src/routes/pharmacie.routes.js";
import avisRoutes from "./src/routes/avis.routes.js";
import abonnementRoutes from "./src/routes/abonnement.routes.js";
import publiciteRoutes from "./src/routes/publicite.routes.js";
import assuranceRoutes from "./src/routes/assurance.routes.js";
import urgencesRoutes from "./src/routes/urgences.routes.js";
import medecinRoutes from "./src/routes/medecin.routes.js";

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Sécurité HTTP de base ─────────────────────────────────────
app.use(helmet());

// CORS : liste blanche explicite via CORS_ORIGINS (séparées par des
// virgules) plutôt qu'un accès ouvert par défaut. En dev sans
// CORS_ORIGINS défini, on autorise tout pour ne pas bloquer le
// développement local, mais il FAUT configurer cette variable en prod.
// NB : maintenant que le refresh token voyage dans un cookie httpOnly,
// `credentials: true` ci-dessous n'a d'effet que si `origin` est une
// valeur explicite (jamais "*", et éviter aussi `origin: true` en
// prod) — le navigateur refuse sinon d'exposer/envoyer les cookies
// cross-site. `origin: true` (reflète l'origine de la requête) reste
// toléré ici uniquement en dev quand CORS_ORIGINS n'est pas défini.
const origines = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: origines.length > 0 ? origines : true,
    credentials: true,
  })
);

// Limite de taille du body pour éviter les payloads abusifs.
app.use(express.json({ limit: "100kb" }));

// Requis pour lire req.cookies dans les contrôleurs (refresh_token).
app.use(cookieParser());

// ─── Rate limiting sur les routes sensibles ────────────────────
// Empêche le brute-force sur la connexion, l'inscription et
// l'amorçage du superadmin.
const limiteurAuth = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives, réessayez plus tard." },
});

app.use("/api/auth/login", limiteurAuth);
app.use("/api/auth/register", limiteurAuth);
app.use("/api/auth/bootstrap-superadmin", limiteurAuth);

// ─── Route de test ────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({ message: "Serveur lancé sans erreur" });
});

// ─── Routes ───────────────────────────────────────────────────
app.use("/api/auth", authentificationRoutes);
app.use("/api/referentiels", referentielsRoutes);
app.use("/api", centreSanteRoutes);
app.use("/api", pharmacieRoutes);
app.use("/api", avisRoutes);
app.use("/api", abonnementRoutes);
app.use("/api", publiciteRoutes);
app.use("/api", assuranceRoutes);
app.use("/api", urgencesRoutes);
app.use("/api", medecinRoutes);
// ─── Gestion d'erreurs centralisée ─────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Erreur interne du serveur." });
});

// ─── Démarrage ────────────────────────────────────────────────
app.listen(PORT, () => console.log(`✅ Serveur démarré sur http://localhost:${PORT}`));