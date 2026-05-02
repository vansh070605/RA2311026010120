import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env variable: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  db: {
    host: required('DB_HOST'),
    port: parseInt(optional('DB_PORT', '5432'), 10),
    name: required('DB_NAME'),
    user: required('DB_USER'),
    password: optional('DB_PASSWORD', ''),
  },
  redis: {
    url: optional('REDIS_URL', 'redis://localhost:6379'),
  },
  log: {
    apiUrl: required('LOG_API_URL'),
    token: required('LOG_API_TOKEN'),
    serviceName: optional('SERVICE_NAME', 'notification-service'),
  },
  notification: {
    apiUrl: required('NOTIFICATION_API_URL'),
    authToken: required('API_AUTH_TOKEN'),
  },
  port: parseInt(optional('PORT', '3002'), 10),
} as const;
