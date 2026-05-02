import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  Notification,
  CreateNotificationDto,
  ListNotificationsQuery,
  PaginatedResponse,
} from '../types/index.js';
import { Logger } from '../utils/logger.js';

/**
 * PostgreSQL-backed notification repository.
 *
 * Column names match the evaluation's schema exactly (camelCase):
 *   studentID, notificationType, isRead, createdAt
 *
 * Schema (run once to initialise):
 *
 *   CREATE TYPE notification_type AS ENUM ('Placement', 'Result', 'Event');
 *
 *   CREATE TABLE users (
 *     "studentID"          TEXT PRIMARY KEY,
 *     name                 TEXT NOT NULL,
 *     email                TEXT NOT NULL UNIQUE,
 *     "registrationNumber" TEXT NOT NULL UNIQUE,
 *     program              TEXT NOT NULL,
 *     "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *   );
 *
 *   CREATE TABLE notifications (
 *     id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *     "studentID"        TEXT NOT NULL REFERENCES users("studentID") ON DELETE CASCADE,
 *     "notificationType" notification_type NOT NULL,
 *     title              TEXT NOT NULL,
 *     message            TEXT NOT NULL,
 *     "isRead"           BOOLEAN NOT NULL DEFAULT FALSE,
 *     "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     metadata           JSONB
 *   );
 *
 *   -- Primary access pattern: unread notifications for a student, newest first
 *   CREATE INDEX idx_notifications_student_unread
 *     ON notifications ("studentID", "isRead", "createdAt" DESC);
 *
 *   -- Type + time queries (e.g., placement notifications in last 7 days)
 *   CREATE INDEX idx_notifications_type_time
 *     ON notifications ("notificationType", "createdAt" DESC);
 *
 *   -- Partial index — only unread rows, further reduces index size
 *   CREATE INDEX idx_notifications_unread_partial
 *     ON notifications ("studentID", "createdAt" DESC)
 *     WHERE "isRead" = FALSE;
 */
export class NotificationRepository {
  constructor(
    private readonly pool: Pool,
    private readonly logger: Logger,
  ) {}

  async create(dto: CreateNotificationDto): Promise<Notification> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const { rows } = await this.pool.query<Notification>(
      `INSERT INTO notifications
         (id, "studentID", "notificationType", title, message, "isRead", "createdAt", metadata)
       VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7)
       RETURNING
         id,
         "studentID"        AS "studentId",
         "notificationType" AS type,
         title,
         message,
         "isRead",
         "createdAt",
         metadata`,
      [id, dto.studentId ?? 'broadcast', dto.type, dto.title, dto.message, now, dto.metadata ?? null],
    );

    await this.logger.Log('backend', 'info', 'notification-repo', 'Notification created', { id });
    return rows[0];
  }

  async findMany(query: ListNotificationsQuery): Promise<PaginatedResponse<Notification>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (query.studentId) {
      conditions.push(`"studentID" = $${paramIdx++}`);
      params.push(query.studentId);
    }
    if (query.isRead !== undefined) {
      conditions.push(`"isRead" = $${paramIdx++}`);
      params.push(query.isRead);
    }
    if (query.type) {
      conditions.push(`"notificationType" = $${paramIdx++}`);
      params.push(query.type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notifications ${where}`,
      params,
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const { rows } = await this.pool.query<Notification>(
      `SELECT
         id,
         "studentID"        AS "studentId",
         "notificationType" AS type,
         title,
         message,
         "isRead",
         "createdAt",
         metadata
       FROM notifications
       ${where}
       ORDER BY "createdAt" DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      [...params, limit, offset],
    );

    return { data: rows, total, page, limit };
  }

  async findById(id: string): Promise<Notification | null> {
    const { rows } = await this.pool.query<Notification>(
      `SELECT
         id,
         "studentID"        AS "studentId",
         "notificationType" AS type,
         title,
         message,
         "isRead",
         "createdAt",
         metadata
       FROM notifications WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async markAsRead(id: string): Promise<Notification | null> {
    const { rows } = await this.pool.query<Notification>(
      `UPDATE notifications SET "isRead" = TRUE
       WHERE id = $1
       RETURNING
         id,
         "studentID"        AS "studentId",
         "notificationType" AS type,
         title,
         message,
         "isRead",
         "createdAt",
         metadata`,
      [id],
    );
    if (rows[0]) {
      await this.logger.Log('backend', 'info', 'notification-repo', 'Notification marked as read', { id });
    }
    return rows[0] ?? null;
  }

  async findAllStudentIds(): Promise<string[]> {
    const { rows } = await this.pool.query<{ studentID: string }>(
      `SELECT DISTINCT "studentID" FROM users`,
    );
    return rows.map((r) => r.studentID);
  }

  async bulkCreate(notifications: CreateNotificationDto[]): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      let created = 0;
      for (const dto of notifications) {
        await client.query(
          `INSERT INTO notifications
             (id, "studentID", "notificationType", title, message, "isRead", "createdAt", metadata)
           VALUES ($1, $2, $3, $4, $5, FALSE, NOW(), $6)`,
          [uuidv4(), dto.studentId, dto.type, dto.title, dto.message, dto.metadata ?? null],
        );
        created++;
      }
      await client.query('COMMIT');
      return created;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
