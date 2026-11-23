// src/routes/whatsappWebhook.routes.js
// Même patron que visioWebhook.routes.js : express.raw() car la signature
// Meta (X-Hub-Signature-256) se calcule sur le corps brut exact. Monté
// AVANT express.json() dans index.js.
import express, { Router } from "express";
import { recevoirWebhookWhatsapp, verifierWebhookWhatsapp } from "../controllers/whatsappWebhook.controller.js";

const router = Router();
router.get("/", verifierWebhookWhatsapp);
router.post("/", express.raw({ type: "application/json", limit: "1mb" }), recevoirWebhookWhatsapp);
export default router;
