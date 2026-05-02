import express from 'express';
import { config } from './config/env.js';
import { createLogger } from './utils/logger.js';
import { ApiClient } from './clients/apiClient.js';
import { KnapsackRepository } from './repositories/knapsackRepository.js';
import { SchedulerService } from './services/schedulerService.js';
import { SchedulerController } from './controllers/schedulerController.js';
import { createRequestLogger } from './middleware/requestLogger.js';

export function buildApp() {
  const app = express();
  app.use(express.json());

  const logger = createLogger({
    logApiUrl: config.log.apiUrl,
    logApiToken: config.log.token,
    serviceName: config.log.serviceName,
  });

  const apiClient = new ApiClient(
    config.depot.apiUrl,
    config.vehicles.apiUrl,
    config.depot.authToken,
    logger,
  );

  const knapsackRepo = new KnapsackRepository(logger);

  const schedulerService = new SchedulerService(
    apiClient,
    knapsackRepo,
    config.outputPath,
    logger,
  );

  const controller = new SchedulerController(schedulerService, logger);

  app.use(createRequestLogger(logger));

  app.get('/status', controller.getStatus);
  app.post('/schedule', controller.runSchedule);

  return { app, logger };
}
