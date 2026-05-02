export interface Depot {
  depotId: string;
  name: string;
  tasks: Task[];
  capacity: number;
}

export interface Task {
  taskId: string;
  vehicleId: string;
  duration: number;
  impact: number;
}

export interface DepotResult {
  depotId: string;
  selectedTasks: string[];
  totalDuration: number;
  totalImpact: number;
}


export type LogStack = 'backend' | 'frontend';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogPayload {
  stack: LogStack;
  level: LogLevel;
  package: string;
  message: string;
  timestamp: string;
  requestId: string;
  serviceName: string;
  metadata?: Record<string, unknown>;
}
