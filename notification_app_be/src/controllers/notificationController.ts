import { Request, Response } from 'express';
import { NotificationService } from '../services/notificationService.js';
import { Logger } from '../utils/logger.js';
import { CreateNotificationDto, ListNotificationsQuery } from '../types/index.js';

export class NotificationController {
  constructor(
    private readonly service: NotificationService,
    private readonly logger: Logger,
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const query: ListNotificationsQuery = {
        studentId: req.query['studentId'] as string | undefined,
        isRead: req.query['isRead'] !== undefined ? req.query['isRead'] === 'true' : undefined,
        type: req.query['type'] as ListNotificationsQuery['type'],
        page: req.query['page'] ? Number(req.query['page']) : undefined,
        limit: req.query['limit'] ? Number(req.query['limit']) : undefined,
      };

      const result = await this.service.list(query);
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      await this.handleError(err, res, 'list');
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const dto: CreateNotificationDto = req.body;
      const notification = await this.service.create(dto);
      res.status(201).json({ success: true, data: notification });
    } catch (err) {
      await this.handleError(err, res, 'create');
    }
  };

  markAsRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const notification = await this.service.markAsRead(id);
      res.status(200).json({ success: true, data: notification });
    } catch (err) {
      await this.handleError(err, res, 'markAsRead');
    }
  };

  notifyAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const dto = req.body as Omit<CreateNotificationDto, 'studentId'>;
      const result = await this.service.notifyAll(dto);
      res.status(202).json({ success: true, ...result });
    } catch (err) {
      await this.handleError(err, res, 'notifyAll');
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const notification = await this.service.getById(id);
      res.status(200).json({ success: true, data: notification });
    } catch (err) {
      await this.handleError(err, res, 'getById');
    }
  };

  private async handleError(err: unknown, res: Response, method: string): Promise<void> {
    const error = err as Error & { statusCode?: number };
    const statusCode = error.statusCode ?? 500;

    await this.logger.Log('backend', 'error', 'notification-controller', `Error in ${method}`, {
      error: error.message,
    });

    res.status(statusCode).json({ success: false, error: error.message });
  }
}
