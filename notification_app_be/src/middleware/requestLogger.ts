import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger.js';

export function createRequestLogger(logger: Logger) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const start = Date.now();

    res.on('finish', () => {
      const elapsed = Date.now() - start;
      logger.Log('backend', 'info', 'notification-service', 'HTTP request completed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        elapsedMs: elapsed,
      }).catch(() => {});
    });

    next();
  };
}
