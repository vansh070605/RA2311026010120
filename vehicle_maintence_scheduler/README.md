# Vehicle Scheduling Service

Vehicle maintenance scheduling using optimized 0/1 Knapsack DP.

## Architecture

```
src/
  config/     env.ts          — env variable loading
  types/      index.ts        — shared TypeScript types
  utils/      logger.ts       — external Log API wrapper
              knapsack.ts     — space-optimized DP solver
  clients/    apiClient.ts    — HTTP transport for Depot/Vehicles APIs
  repositories/ knapsackRepository.ts — optimization wrapper with logging
  services/   schedulerService.ts    — pipeline orchestration
  controllers/ schedulerController.ts — HTTP adapter
  middleware/ requestLogger.ts
  app.ts      — DI wiring
  server.ts   — HTTP server bootstrap
  schedule.ts — CLI entrypoint
```

## Algorithm: Space-Optimized 0/1 Knapsack

**Time complexity:** O(n × W)  
**Space complexity:** O(n × W) for the keep[][] reconstruction table, O(W) for the DP array.

The standard 1-D rolling-array DP loses item provenance. This implementation adds a boolean `keep[i][w]` table (Uint8Array for memory efficiency) that records exactly which items were selected at each capacity level. Reconstruction walks backwards from capacity to zero in O(n) time.

## Setup

```bash
cp .env.example .env
# fill in all values in .env
npm install
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with hot-reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run compiled server |
| `npm run schedule:vehicles` | CLI run — no HTTP server needed |

## API

### `GET /status`
Returns service health.

### `POST /schedule`
Runs the full scheduling pipeline. Returns results and writes to `output/depot-results.json`.

## Assumptions

| Variable | Assumption |
|----------|------------|
| `DEPOT_API_URL` | Returns array of `{ depotId, name, capacity, tasks[] }` |
| `VEHICLES_API_URL` | If tasks not embedded in depot, accepts `?depotId=` query param |
| `API_AUTH_TOKEN` | Single bearer token used for both APIs |
| Task `duration` | Non-negative integer (knapsack weight) |
| Task `impact` | Non-negative integer (knapsack value) |

## Logging

All logs are shipped to `LOG_API_URL` via HTTP POST. No `console.log` is used as the primary logging mechanism.
