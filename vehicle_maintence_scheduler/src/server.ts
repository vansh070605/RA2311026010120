import { buildApp } from './app.js';
import { config } from './config/env.js';

async function main() {
  const { app, logger } = buildApp();

  app.listen(config.port, () => {
    logger.Log('backend', 'info', 'vehicle-scheduler', `Server listening on port ${config.port}`).catch(() => {
      process.stderr.write(`[BOOTSTRAP] Vehicle scheduler running on port ${config.port}\n`);
    });
  });
}

main().catch((err) => {
  process.stderr.write(`[FATAL] Server failed to start: ${err.message}\n`);
  process.exit(1);
});
