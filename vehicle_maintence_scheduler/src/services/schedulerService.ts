import fs from 'fs/promises';
import path from 'path';
import { ApiClient } from '../clients/apiClient.js';
import { KnapsackRepository } from '../repositories/knapsackRepository.js';
import { DepotResult } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export class SchedulerService {
  constructor(
    private readonly apiClient: ApiClient,
    private readonly knapsackRepo: KnapsackRepository,
    private readonly outputPath: string,
    private readonly logger: Logger,
  ) { }

  async runScheduling(): Promise<DepotResult[]> {
    await this.logger.Log('backend', 'info', 'vehicle-scheduler', 'Scheduler run started');

    let depots = await this.apiClient.fetchDepots();

    depots = await Promise.all(
      depots.map(async (depot) => {
        if (depot.tasks.length === 0) {
          const tasks = await this.apiClient.fetchVehiclesForDepot(depot.depotId);
          return { ...depot, tasks };
        }
        return depot;
      }),
    );

    const results: DepotResult[] = [];

    for (const depot of depots) {
      try {
        const result = await this.knapsackRepo.optimizeDepot(depot);
        results.push(result);
      } catch (err) {
        await this.logger.Log(
          'backend',
          'error',
          'vehicle-scheduler',
          `Optimization failed for depot ${depot.depotId}`,
          { error: (err as Error).message },
        );
      }
    }

    await this.writeResults(results);

    await this.logger.Log(
      'backend',
      'info',
      'vehicle-scheduler',
      'Scheduler run complete',
      { totalDepots: results.length },
    );

    return results;
  }

  private async writeResults(results: DepotResult[]): Promise<void> {
    const absPath = path.resolve(this.outputPath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, JSON.stringify(results, null, 2), 'utf-8');
    await this.logger.Log('backend', 'info', 'vehicle-scheduler', 'Results written to disk', {
      path: absPath,
    });
  }
}
