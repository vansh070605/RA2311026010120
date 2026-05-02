import axios, { AxiosInstance } from 'axios';
import { Depot, Task } from '../types/index.js';
import { Logger } from '../utils/logger.js';


export class ApiClient {
  private readonly http: AxiosInstance;
  private readonly logger: Logger;

  constructor(
    private readonly depotApiUrl: string,
    private readonly vehiclesApiUrl: string,
    private readonly authToken: string,
    logger: Logger,
  ) {
    this.logger = logger;
    this.http = axios.create({
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  // ---- Response envelope unwrapper ----
  // Handles: plain array, { data: [] }, { depots: [] }, { vehicles: [] },
  // { notifications: [] }, { result: [] }, { response: [] }
  private unwrap(raw: unknown): unknown {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      const arrayKeys = ['data', 'depots', 'vehicles', 'notifications', 'result', 'results', 'response', 'items'];
      for (const key of arrayKeys) {
        if (Array.isArray(obj[key])) return obj[key];
      }
    }
    return raw;
  }

  // ---- Validation helpers ----

  async fetchDepots(): Promise<Depot[]> {
    await this.logger.Log('backend', 'info', 'depot-client', 'Fetching depots from API', {
      url: this.depotApiUrl,
    });

    const response = await this.http.get<unknown>(this.depotApiUrl);
    const raw = this.unwrap(response.data);

    if (!Array.isArray(raw)) {
      await this.logger.Log('backend', 'error', 'depot-client', 'Depot API returned non-array', {
        received: typeof raw,
        keys: raw && typeof raw === 'object' ? Object.keys(raw as object) : undefined,
      });
      throw new Error(`Depot API response is not an array. Keys: ${raw && typeof raw === 'object' ? Object.keys(raw as object).join(', ') : typeof raw}`);
    }

    const depots = raw.map((item, idx) => this.validateDepot(item, idx));
    await this.logger.Log('backend', 'info', 'depot-client', `Fetched ${depots.length} depots`);
    return depots;
  }

  async fetchVehiclesForDepot(depotId: string): Promise<Task[]> {
    const url = `${this.vehiclesApiUrl}?depotId=${encodeURIComponent(depotId)}`;
    await this.logger.Log('backend', 'info', 'depot-client', 'Fetching vehicles for depot', {
      depotId,
      url,
    });

    const response = await this.http.get<unknown>(url);
    const raw = this.unwrap(response.data);

    if (!Array.isArray(raw)) {
      await this.logger.Log('backend', 'warn', 'depot-client', 'Vehicles API returned non-array', {
        depotId,
        received: typeof raw,
      });
      return [];
    }

    const tasks = raw.map((item, idx) => this.validateTask(item, idx, depotId));
    await this.logger.Log('backend', 'info', 'depot-client', `Fetched ${tasks.length} vehicles for depot`, {
      depotId,
    });
    return tasks;
  }


  private validateDepot(raw: unknown, idx: number): Depot {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`Depot at index ${idx} is not an object`);
    }
    const d = raw as Record<string, unknown>;

    // Log the first depot shape for debugging
    if (idx === 0) {
      void this.logger.Log('backend', 'debug', 'depot-client', 'Depot item shape (first)', {
        keys: Object.keys(d),
        sample: JSON.stringify(d).slice(0, 300),
      });
    }

    // Accept common field name variants for depot ID
    // Real API uses: ID, MechanicHours
    const depotId = String(
      d['depotId'] ?? d['ID'] ?? d['id'] ?? d['depot_id'] ?? d['_id'] ?? d['depotID'] ?? idx,
    );

    // Accept common capacity variants (real API: MechanicHours)
    const capacity = Number(
      d['capacity'] ?? d['MechanicHours'] ?? d['mechanicHours'] ?? d['maxCapacity'] ?? d['max_capacity'] ?? d['weight'] ?? 100,
    );

    const tasks: Task[] = Array.isArray(d['tasks'])
      ? d['tasks'].map((t: unknown, ti: number) => this.validateTask(t, ti, depotId))
      : [];

    return {
      depotId,
      name: typeof d['name'] === 'string' ? d['name'] : depotId,
      capacity: isNaN(capacity) || capacity <= 0 ? 100 : capacity,
      tasks,
    };
  }

  private validateTask(raw: unknown, idx: number, depotId: string): Task {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`Task at index ${idx} for depot ${depotId} is not an object`);
    }
    const t = raw as Record<string, unknown>;

    // Log first vehicle shape for debugging
    if (idx === 0) {
      void this.logger.Log('backend', 'debug', 'depot-client', 'Vehicle item shape (first)', {
        keys: Object.keys(t),
        sample: JSON.stringify(t).slice(0, 300),
      });
    }

    // Accept common task ID variants
    // Real API field names will be logged above on first run
    const taskId = String(
      t['taskId'] ?? t['TaskID'] ?? t['ID'] ?? t['id'] ?? t['task_id'] ?? t['_id'] ?? t['vehicleId'] ?? t['VehicleID'] ?? `${depotId}-${idx}`,
    );

    // Accept common duration/weight variants (real API: may use Hours, Duration, MechanicHours)
    const duration = Number(
      t['duration'] ?? t['Duration'] ?? t['Hours'] ?? t['hours'] ?? t['MechanicHours'] ?? t['time'] ?? t['timeDuration'] ?? t['weight'] ?? t['size'] ?? 1,
    );

    // Accept common value/profit variants (real API: may use Impact, Value, Profit)
    const impact = Number(
      t['impact'] ?? t['Impact'] ?? t['value'] ?? t['Value'] ?? t['profit'] ?? t['Profit'] ?? t['benefit'] ?? t['score'] ?? 1,
    );

    return {
      taskId,
      vehicleId: typeof t['vehicleId'] === 'string' ? t['vehicleId'] : taskId,
      duration: isNaN(duration) || duration < 0 ? 1 : duration,
      impact: isNaN(impact) || impact < 0 ? 1 : impact,
    };
  }
}
