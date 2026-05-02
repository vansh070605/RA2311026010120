import { Request, Response } from 'express';
import { SchedulerService } from '../services/schedulerService.js';
import { Logger } from '../utils/logger.js';

export class SchedulerController {
  constructor(
    private readonly schedulerService: SchedulerService,
    private readonly logger: Logger,
  ) {}

  runSchedule = async (req: Request, res: Response): Promise<void> => {
    await this.logger.Log(
      'backend',
      'info',
      'scheduler-controller',
      'POST /schedule received',
    );

    try {
      const results = await this.schedulerService.runScheduling();
      res.status(200).json({ success: true, data: results });
    } catch (err) {
      await this.logger.Log(
        'backend',
        'error',
        'scheduler-controller',
        'Schedule run failed',
        { error: (err as Error).message },
      );
      res.status(500).json({ success: false, error: 'Scheduling failed. Check logs for details.' });
    }
  };

  getStatus = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({ status: 'Vehicle Scheduler Service is running.' });
  };
}
