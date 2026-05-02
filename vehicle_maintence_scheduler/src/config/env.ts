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
  depot: {
    apiUrl: required('DEPOT_API_URL'),
    authToken: required('API_AUTH_TOKEN'),
  },
  vehicles: {
    apiUrl: required('VEHICLES_API_URL'),
  },
  log: {
    apiUrl: required('LOG_API_URL'),
    token: required('LOG_API_TOKEN'),
    serviceName: optional('SERVICE_NAME', 'vehicle-scheduler'),
  },
  outputPath: optional('OUTPUT_PATH', 'output/depot-results.json'),
  port: parseInt(optional('PORT', '3001'), 10),
} as const;
