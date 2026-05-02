import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Production-grade logging middleware
 * Captures request details and response times
 */
export const loggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = uuidv4();
  const startTime = Date.now();

  // Log request start
  console.log(`[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.url}`);

  // Capture response finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });

  next();
};
