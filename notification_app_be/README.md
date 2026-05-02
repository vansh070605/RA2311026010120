# Notification Service

Campus notification system — REST API + SSE real-time + Priority Inbox.

## Architecture

```
src/
  config/       env.ts                — env loading
  types/        index.ts              — domain types + DTOs
  utils/        logger.ts             — external Log API wrapper
  middleware/   validation.ts         — express-validator rules
                requestLogger.ts      — request logging middleware
  repositories/ notificationRepository.ts — PostgreSQL queries
  services/     notificationService.ts    — business logic + EventEmitter
  controllers/  notificationController.ts — HTTP adapter
                notificationRoutes.ts    — Express router
  realtime/     sseHandler.ts            — SSE push layer
  app.ts        — DI wiring
  server.ts     — HTTP bootstrap

priority_inbox.ts  — Stage 6 CLI script (standalone)
notification_system_design.md — full system design (Stages 1–6)
```

## Setup

```bash
# Start PostgreSQL and create database
createdb notifications_db
psql notifications_db < schema.sql   # run CREATE TABLE / CREATE INDEX statements from Stage 2

cp .env.example .env
# fill in DB credentials, log API URL, and auth tokens
npm install
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Dev server with hot-reload |
| `npm run build` | Compile TypeScript |
| `npm run start` | Run compiled server |
| `npm run priority:inbox` | Compute top-10 priority inbox, write output/priority-top10.json |

## Real-Time

Connect to `GET /realtime/stream` with `EventSource`:

```javascript
const es = new EventSource('/realtime/stream', {
  headers: { Authorization: 'Bearer <token>' }
});
es.addEventListener('notification:new', (e) => {
  const notification = JSON.parse(e.data);
  // append to UI
});
```

## Priority Inbox

See `priority_inbox.ts` and Stage 6 in `notification_system_design.md`.

Scoring: `typeWeight × 100 + 1/(ageInHours + 1)`

Placement (3) > Result (2) > Event (1) > General (0)
