// src/controllers/notification.controller.js
// Politique de fonds v2 §5 (étape 6, point ouvert E) — lecture des
// notifications in-app de l'utilisateur connecté. Toujours scopé à
// req.utilisateur : on ne voit, ne marque et ne lit jamais celles d'autrui.

import prisma from "../lib/prisma.js";

const LIMITE_PAR_DEFAUT = 50;
const LIMITE_MAX = 200;

/**
 * GET /api/notifications?non_lues=true&limit=50
 * Plus récentes d'abord. Renvoie aussi le nombre total de non lues
 * (recalculé, non stocké).
 */
export async function listerNotifications(req, res, next) {
  try {
    const utilisateur_id = req.utilisateur.utilisateur_id;
    const seulementNonLues = req.query.non_lues === "true";

    let limite = Number.parseInt(req.query.limit, 10);
    if (!Number.isInteger(limite) || limite < 1) limite = LIMITE_PAR_DEFAUT;
    limite = Math.min(limite, LIMITE_MAX);

    const [notifications, non_lues] = await Promise.all([
      prisma.notification.findMany({
        where: { utilisateur_id, ...(seulementNonLues ? { lue_le: null } : {}) },
        orderBy: { date_creation: "desc" },
        take: limite,
        select: {
          notification_id: true, type: true, rdv_id: true, titre: true,
          message: true, donnees: true, lue_le: true, date_creation: true,
        },
      }),
      prisma.notification.count({ where: { utilisateur_id, lue_le: null } }),
    ]);

    return res.status(200).json({ notifications, non_lues });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/notifications/:id/lue — idempotent (déjà lue : inchangée).
 */
export async function marquerNotificationLue(req, res, next) {
  try {
    const utilisateur_id = req.utilisateur.utilisateur_id;
    const notification = await prisma.notification.findFirst({
      where: { notification_id: req.params.id, utilisateur_id },
      select: { notification_id: true },
    });
    if (!notification) return res.status(404).json({ message: "Notification introuvable." });

    await prisma.notification.updateMany({
      where: { notification_id: req.params.id, utilisateur_id, lue_le: null },
      data: { lue_le: new Date() },
    });
    return res.status(200).json({ message: "Notification marquée comme lue." });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notifications/lues — marque toutes les notifications non lues.
 */
export async function marquerToutesLues(req, res, next) {
  try {
    const { count } = await prisma.notification.updateMany({
      where: { utilisateur_id: req.utilisateur.utilisateur_id, lue_le: null },
      data: { lue_le: new Date() },
    });
    return res.status(200).json({ message: "Notifications marquées comme lues.", nombre: count });
  } catch (err) {
    next(err);
  }
}
