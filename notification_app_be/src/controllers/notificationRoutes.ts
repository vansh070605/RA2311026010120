import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController.js';
import {
  validateCreateNotification,
  validateListNotifications,
  validateNotificationId,
  validateNotifyAll,
} from '../middleware/validation.js';

export function createNotificationRouter(controller: NotificationController): Router {
  const router = Router();

  router.get('/', validateListNotifications, controller.list);

  router.get('/:id', validateNotificationId, controller.getById);

  router.post('/', validateCreateNotification, controller.create);

  router.patch('/:id/read', validateNotificationId, controller.markAsRead);

  router.post('/notify-all', validateNotifyAll, controller.notifyAll);

  return router;
}
