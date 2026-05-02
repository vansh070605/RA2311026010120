import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { LogStack, LogLevel, LogPayload } from '../types/index.js';

const VALID_BACKEND_PACKAGES = new Set([
  'vehicle-scheduler',
  'depot-client',
  'knapsack-service',
  'scheduler-controller',
  'notification-service',
  'notification-controller',
  'priority-inbox',
  'realtime',
  'notification-repo',
]);

const VALID_FRONTEND_PACKAGES = new Set([
  'ui-app',
  'web-client',
]);

const VALID_LEVELS = new Set<LogLevel>(['debug', 'info', 'warn', 'error', 'fatal']);
const VALID_STACKS = new Set<LogStack>(['backend', 'frontend']);

interface LoggerConfig {
  logApiUrl: string;
  logApiToken: string;
  serviceName: string;
}

export class Logger {
  private readonly config: LoggerConfig;

  constructor(cfg: LoggerConfig) {
    this.config = cfg;
  }

  async Log(
    stack: LogStack,
    level: LogLevel,
    pkg: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!VALID_STACKS.has(stack)) {
      throw new Error(`Invalid log stack: "${stack}". Must be one of: ${[...VALID_STACKS].join(', ')}`);
    }
    if (!VALID_LEVELS.has(level)) {
      throw new Error(`Invalid log level: "${level}". Must be one of: ${[...VALID_LEVELS].join(', ')}`);
    }

    const validPackages = stack === 'backend' ? VALID_BACKEND_PACKAGES : VALID_FRONTEND_PACKAGES;
    if (!validPackages.has(pkg)) {
      metadata = { ...metadata, _unregisteredPackage: pkg };
    }

    const payload: LogPayload = {
      stack,
      level,
      package: pkg,
      message,
      timestamp: new Date().toISOString(),
      requestId: uuidv4(),
      serviceName: this.config.serviceName,
      metadata,
    };

    try {
      await axios.post(this.config.logApiUrl, payload, {
        headers: {
          Authorization: `Bearer ${this.config.logApiToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      });
    } catch (err) {
      process.stderr.write(
        `[LOGGER-FALLBACK] Failed to ship log to API. Payload: ${JSON.stringify(payload)}\n`,
      );
    }
  }
}

export function createLogger(cfg: LoggerConfig): Logger {
  return new Logger(cfg);
}
