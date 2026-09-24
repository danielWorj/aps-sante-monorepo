// src/routes/visioWebhook.routes.js
// Même patron que paiementWebhook.routes.js : express.raw() car la
// vérification de signature HMAC (jitsiWebhookService.js) exige le
// corps brut exact, octet pour octet — express.json() global
// consommerait et parserait le body avant que ce middleware ne le
// reçoive. D'où le montage AVANT express.json() dans index.js.
import express, { Router } from "express";
import { traiterFinSessionVisio } from "../controllers/visio.controller.js";

const router = Router();
router.post("/", express.raw({ type: "application/json" }), traiterFinSessionVisio);
export default router;