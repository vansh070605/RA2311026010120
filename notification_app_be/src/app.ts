import express from 'express';
import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { config } from './config/env.js';
import { createLogger } from './utils/logger.js';
import { NotificationRepository } from './repositories/notificationRepository.js';
import { NotificationService } from './services/notificationService.js';
import { NotificationController } from './controllers/notificationController.js';
import { createNotificationRouter } from './controllers/notificationRoutes.js';
import { RealtimeHandler } from './realtime/sseHandler.js';
import { createRequestLogger } from './middleware/requestLogger.js';

export function buildApp() {
  const app = express();
  app.use(express.json());

  const logger = createLogger({
    logApiUrl: config.log.apiUrl,
    logApiToken: config.log.token,
    serviceName: config.log.serviceName,
  });

  const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.name,
    user: config.db.user,
    password: config.db.password,
  });

  const emitter = new EventEmitter();

  const repo = new NotificationRepository(pool, logger);
  const service = new NotificationService(repo, logger, emitter);
  const controller = new NotificationController(service, logger);
  const realtimeHandler = new RealtimeHandler(emitter, logger);

  app.use(createRequestLogger(logger));

  app.use('/notifications', createNotificationRouter(controller));

  app.get('/realtime/stream', realtimeHandler.stream);

  app.get('/status', (_req, res) => res.json({ status: 'Notification Service is running.' }));

  return { app, logger };
}
