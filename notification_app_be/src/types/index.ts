export type NotificationType = 'Placement' | 'Result' | 'Event';

export interface Notification {
  id: string;
  studentId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface User {
  studentId: string;
  name: string;
  email: string;
  registrationNumber: string;
  program: string;
  createdAt: string;
}


export interface CreateNotificationDto {
  studentId?: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ListNotificationsQuery {
  studentId?: string;
  isRead?: boolean;
  type?: NotificationType;
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}


export interface ScoredNotification extends Notification {
  priorityScore: number;
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
