import { Request, Response } from 'express';
import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';

export class RealtimeHandler {
  private clients: Map<string, Response> = new Map();

  constructor(
    private readonly emitter: EventEmitter,
    private readonly logger: Logger,
  ) {
    this.emitter.on('notification:new', (notification: unknown) => {
      this.broadcast('notification:new', notification);
    });
  }


  stream = async (req: Request, res: Response): Promise<void> => {
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(': heartbeat\n\n');

    this.clients.set(clientId, res);

    await this.logger.Log('backend', 'info', 'realtime', 'SSE client connected', {
      clientId,
      totalClients: this.clients.size,
    });

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(clientId);
      this.logger.Log('backend', 'info', 'realtime', 'SSE client disconnected', {
        clientId,
        totalClients: this.clients.size,
      }).catch(() => { });
    });
  };

  private broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [, res] of this.clients) {
      try {
        res.write(payload);
      } catch {
      }
    }
  }
}
