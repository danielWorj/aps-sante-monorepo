import express, { Router } from "express";
import { traiterWebhookStripe } from "../controllers/paiement.controller.js";

const router = Router();
router.post("/webhook", express.raw({ type: "application/json" }), traiterWebhookStripe);
export default router;