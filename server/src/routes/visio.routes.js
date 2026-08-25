// src/routes/visio.routes.js
import { Router } from "express";
import { obtenirTokenVisio } from "../controllers/visio.controller.js";
import { authentifier } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/visio/token", authentifier, obtenirTokenVisio);

export default router;
