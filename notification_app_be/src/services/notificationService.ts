import { v4 as uuidv4 } from 'uuid';
import {
  Notification,
  CreateNotificationDto,
  ListNotificationsQuery,
  PaginatedResponse,
} from '../types/index.js';
import { NotificationRepository } from '../repositories/notificationRepository.js';
import { Logger } from '../utils/logger.js';
import { EventEmitter } from 'events';

export class NotificationService {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly logger: Logger,
    private readonly emitter: EventEmitter,
  ) { }

  async list(query: ListNotificationsQuery): Promise<PaginatedResponse<Notification>> {
    await this.logger.Log('backend', 'info', 'notification-service', 'Listing notifications', { query });
    return this.repo.findMany(query);
  }

  async create(dto: CreateNotificationDto): Promise<Notification> {
    await this.logger.Log('backend', 'info', 'notification-service', 'Creating notification', {
      type: dto.type,
      studentId: dto.studentId,
    });

    const notification = await this.repo.create(dto);
    this.emitter.emit('notification:new', notification);
    return notification;
  }

  async markAsRead(id: string): Promise<Notification> {
    const updated = await this.repo.markAsRead(id);
    if (!updated) {
      await this.logger.Log('backend', 'warn', 'notification-service', 'markAsRead — not found', { id });
      throw Object.assign(new Error('Notification not found'), { statusCode: 404 });
    }
    return updated;
  }


  async notifyAll(dto: Omit<CreateNotificationDto, 'studentId'>): Promise<{ queued: number }> {
    await this.logger.Log('backend', 'info', 'notification-service', 'notifyAll started', {
      type: dto.type,
    });

    await this.repo.create({ ...dto, studentId: 'broadcast' });

    const studentIds = await this.repo.findAllStudentIds();

    await this.logger.Log('backend', 'info', 'notification-service', 'notifyAll queued', {
      count: studentIds.length,
    });

    return { queued: studentIds.length };
  }

  async getById(id: string): Promise<Notification> {
    const n = await this.repo.findById(id);
    if (!n) {
      throw Object.assign(new Error('Notification not found'), { statusCode: 404 });
    }
    return n;
  }
}
