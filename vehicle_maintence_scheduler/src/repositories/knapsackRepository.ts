import { Depot, DepotResult } from '../types/index.js';
import { solveKnapsack } from '../utils/knapsack.js';
import { Logger } from '../utils/logger.js';

export class KnapsackRepository {
  constructor(private readonly logger: Logger) { }

  async optimizeDepot(depot: Depot): Promise<DepotResult> {
    const { depotId, tasks, capacity } = depot;

    await this.logger.Log(
      'backend',
      'info',
      'knapsack-service',
      'Knapsack optimization starting',
      { depotId, taskCount: tasks.length, capacity },
    );

    const start = Date.now();
    const result = solveKnapsack(tasks, capacity);
    const elapsed = Date.now() - start;

    await this.logger.Log(
      'backend',
      'info',
      'knapsack-service',
      'Knapsack optimization complete',
      {
        depotId,
        selectedCount: result.selectedTasks.length,
        totalImpact: result.totalImpact,
        totalDuration: result.totalDuration,
        elapsedMs: elapsed,
      },
    );

    return { depotId, ...result };
  }
}
