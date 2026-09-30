// src/routes/remboursement.routes.js
// Politique de fonds v2 §2 — remboursements CamPay (admin/superadmin).
import { Router } from "express";
import { authentifier } from "../middlewares/auth.middleware.js";
import { autoriser } from "../middlewares/autorisation.middleware.js";
import { cloturerRemboursement, listerRemboursements } from "../controllers/remboursement.controller.js";

const router = Router();
const admin = [authentifier, autoriser("admin", "superadmin")];

router.get("/remboursements-campay", ...admin, listerRemboursements);
router.post("/remboursements-campay/:id/cloturer", ...admin, cloturerRemboursement);

export default router;