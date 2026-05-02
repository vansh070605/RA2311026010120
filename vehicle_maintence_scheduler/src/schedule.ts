import dotenv from 'dotenv';
dotenv.config();

import { config } from './config/env.js';
import { createLogger } from './utils/logger.js';
import { ApiClient } from './clients/apiClient.js';
import { KnapsackRepository } from './repositories/knapsackRepository.js';
import { SchedulerService } from './services/schedulerService.js';

async function run() {
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

  const service = new SchedulerService(
    apiClient,
    knapsackRepo,
    config.outputPath,
    logger,
  );

  const results = await service.runScheduling();
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
}

run().catch((err) => {
  process.stderr.write(`[CLI ERROR] ${err.message}\n`);
  process.exit(1);
});
