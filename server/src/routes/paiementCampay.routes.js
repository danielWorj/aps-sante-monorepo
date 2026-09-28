import { Router } from "express";
import { traiterWebhookCampay } from "../controllers/paiementCampay.controller.js";

const router = Router();
router.get("/webhook", traiterWebhookCampay);
export default router;
