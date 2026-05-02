# Notification System Design

---

## Stage 1

### REST API Contracts

All endpoints require:
```
Authorization: Bearer <token>
Content-Type: application/json
```

---

#### `GET /notifications`

Fetch notifications with optional filters and pagination.

**Query Parameters**

| Param              | Type    | Required | Description                                          |
|--------------------|---------|----------|------------------------------------------------------|
| `studentId`        | string  | No       | Filter by student                                    |
| `isRead`           | boolean | No       | Filter by read status                                |
| `notificationType` | string  | No       | One of `Placement`, `Result`, `Event`                |
| `page`             | integer | No       | Default: 1                                           |
| `limit`            | integer | No       | Default: 20, max: 100                                |

**Response — 200 OK**

```json
{
  "success": true,
  "data": [
    {
      "id": "3f7a1c00-0001-0001-0001-000000000001",
      "studentId": "STU001",
      "notificationType": "Placement",
      "title": "Infosys Drive",
      "message": "You are shortlisted for the Infosys campus drive.",
      "isRead": false,
      "createdAt": "2024-01-15T10:30:00Z",
      "metadata": {}
    }
  ],
  "total": 142,
  "page": 1,
  "limit": 20
}
```

**Status Codes:** `200`, `400` (invalid query params), `401` (missing/invalid token)

---

#### `POST /notifications`

Create a notification for a single student.

**Request Body**

```json
{
  "studentId": "STU001",
  "notificationType": "Placement",
  "title": "Infosys Drive",
  "message": "You are shortlisted.",
  "metadata": { "companyId": "inf-001" }
}
```

| Field              | Type   | Required | Notes                                    |
|--------------------|--------|----------|------------------------------------------|
| `notificationType` | string | Yes      | `Placement` \| `Result` \| `Event`       |
| `title`            | string | Yes      | Max 255 chars                            |
| `message`          | string | Yes      |                                          |
| `studentId`        | string | No       | Omit to create a broadcast notification  |
| `metadata`         | object | No       | Arbitrary JSON                           |

**Response — 201 Created**

```json
{
  "success": true,
  "data": {
    "id": "3f7a1c00-0001-0001-0001-000000000001",
    "studentId": "STU001",
    "notificationType": "Placement",
    "title": "Infosys Drive",
    "message": "You are shortlisted.",
    "isRead": false,
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

**Status Codes:** `201`, `400`, `401`

---

#### `PATCH /notifications/:id/read`

Mark a single notification as read.

**Path Params:** `id` — UUID of the notification

**Response — 200 OK**

```json
{
  "success": true,
  "data": {
    "id": "3f7a1c00-0001-0001-0001-000000000001",
    "isRead": true,
    "studentId": "STU001",
    "notificationType": "Placement",
    "title": "Infosys Drive",
    "message": "You are shortlisted.",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

**Status Codes:** `200`, `401`, `404`

---

#### `POST /notifications/notify-all`

Fan-out a notification to all students. Returns immediately (async processing).

**Request Body**

```json
{
  "notificationType": "Event",
  "title": "Cultural Fest 2024",
  "message": "Cultural Fest is scheduled for Jan 20. All are invited!"
}
```

**Response — 202 Accepted**

```json
{
  "success": true,
  "queued": 50000
}
```

**Status Codes:** `202`, `400`, `401`

---

#### `GET /notifications/:id`

Retrieve a single notification by ID.

**Response — 200 OK:** Single notification object as above.

**Status Codes:** `200`, `401`, `404`

---

### Real-Time Notification Design — Server-Sent Events (SSE)

**Choice: SSE over WebSockets**

| Criterion           | SSE                                          | WebSocket                       |
|---------------------|----------------------------------------------|---------------------------------|
| Direction           | Server → Client (push only) ✅               | Bidirectional                   |
| Infrastructure      | Works over HTTP/2, no special LB config      | Needs sticky sessions or Redis adapter |
| Client API          | Native `EventSource` (zero client deps)      | Needs library                   |
| Use case fit        | Perfect — notifications are unidirectional push | Overkill for one-way push    |

**Endpoint:** `GET /realtime/stream`

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event Flow**

```
Client                           Server                          DB
  |                                |                              |
  |-- GET /realtime/stream ------->|                              |
  |<-- SSE headers + heartbeat ----|                              |
  |                                |                              |
  |    [POST /notifications called]                               |
  |                                |<-- INSERT notification -------|
  |                                |-- EventEmitter.emit() ------->|
  |<-- event: notification:new ----|                              |
  |    data: { id, notificationType, title, studentId, ... }      |
```

**SSE event payload:**

```
event: notification:new
data: {"id":"uuid","notificationType":"Placement","title":"...","studentId":"STU001","createdAt":"..."}

```

---

## Stage 2

### Database Choice: PostgreSQL

**Why PostgreSQL:**
- ACID compliance — notification persistence is transactional.
- Composite B-tree indexes on `("studentID", "isRead", "createdAt" DESC)` directly match the primary query pattern.
- Native `ENUM` type for `notificationType` — enforces data integrity at DB level.
- JSONB column for `metadata` — flexible without wide table schemas.
- Read replicas for horizontal read scaling when needed.

**Redis as a sidecar** is justified for:
- Caching unread counts per student: `HINCRBY unread:{studentID} count 1` — O(1) read with no DB hit.
- Short-TTL notification feed cache (30 seconds): acceptable for a campus system.

---

### Schema Design

```sql
-- Enum matching evaluation spec exactly
CREATE TYPE notification_type AS ENUM ('Placement', 'Result', 'Event');

-- Users table
CREATE TABLE users (
  "studentID"          TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  email                TEXT NOT NULL UNIQUE,
  "registrationNumber" TEXT NOT NULL UNIQUE,
  program              TEXT NOT NULL,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications table
-- Column names match the evaluation's query exactly:
-- studentID, notificationType, isRead, createdAt
CREATE TABLE notifications (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "studentID"        TEXT NOT NULL REFERENCES users("studentID") ON DELETE CASCADE,
  "notificationType" notification_type NOT NULL,
  title              TEXT NOT NULL,
  message            TEXT NOT NULL,
  "isRead"           BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata           JSONB
);

-- Primary access pattern: unread by student, newest first
CREATE INDEX idx_notifications_student_unread
  ON notifications ("studentID", "isRead", "createdAt" DESC);

-- Type + time-range queries
CREATE INDEX idx_notifications_type_time
  ON notifications ("notificationType", "createdAt" DESC);

-- Partial index — only unread rows, smaller and faster for the hottest path
CREATE INDEX idx_notifications_unread_partial
  ON notifications ("studentID", "createdAt" DESC)
  WHERE "isRead" = FALSE;
```

---

### Scale Issues as Data Grows

| Volume           | Problem                                               | Mitigation                                             |
|------------------|-------------------------------------------------------|--------------------------------------------------------|
| 10M+ rows        | Sequential scans on unindexed columns                 | Composite indexes above                                |
| 100M+ rows       | Index bloat, autovacuum lag                           | Range-partition by `createdAt` (monthly)               |
| 50k students     | notify-all blocks the API for minutes                 | Async queue (Kafka) — see Stage 5                      |
| High read load   | DB overwhelmed on every page load                     | Redis cache + SSE push (no polling) — see Stage 4      |

---

### Key Queries

**Unread notifications for a student:**

```sql
SELECT id, "studentID", "notificationType", title, message, "isRead", "createdAt"
FROM notifications
WHERE "studentID" = $1
  AND "isRead" = FALSE
ORDER BY "createdAt" DESC
LIMIT 20 OFFSET 0;
-- Uses: idx_notifications_unread_partial (smallest, fastest)
```

**Mark as read:**

```sql
UPDATE notifications
SET "isRead" = TRUE
WHERE id = $1
RETURNING *;
```

**Placement notifications in last 7 days (see Stage 3):**

```sql
SELECT DISTINCT u."studentID", u.name, u.email
FROM notifications n
JOIN users u ON u."studentID" = n."studentID"
WHERE n."notificationType" = 'Placement'
  AND n."createdAt" >= NOW() - INTERVAL '7 days';
-- Uses: idx_notifications_type_time
```

---

## Stage 3

### Query Analysis

**The slow query (from evaluation):**

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

---

**Is the query accurate?**

The query is **semantically correct** — it retrieves unread notifications for the given student ordered by recency. However it has several critical problems:

1. **`SELECT *`** — retrieves all columns including `metadata` (JSONB blob). Unnecessary data transfer and deserialization cost on every row.
2. **No `LIMIT`** — a student with 10,000 notifications will return all 10,000 rows to the application in a single response. This causes memory pressure on both DB and application server.
3. **`studentID = 1042`** — the value `1042` is an unquoted integer. If `studentID` is stored as `TEXT` (which it should be for student IDs), this causes a type mismatch and the DB may skip the index entirely.

---

**Why is it slow?**

| Cause                          | Explanation                                                               |
|--------------------------------|---------------------------------------------------------------------------|
| No composite index             | Without an index on `(studentID, isRead, createdAt DESC)`, PostgreSQL performs a sequential scan across all 5,000,000 rows |
| No LIMIT                       | The entire matching result set is materialised and sorted in memory        |
| Sort without covering index    | `ORDER BY createdAt DESC` forces a Sort node if the index doesn't cover the output |
| `SELECT *` with JSONB          | Deserialising the `metadata` JSONB column for every row is CPU-expensive  |

**Estimated cost before fix:**
- Sequential scan: O(5,000,000) rows read → 300–800ms under load, often timing out at 50k concurrent students.
- In-memory sort: O(n log n) where n = all rows matching studentID.

---

**What should change?**

```sql
-- Fixed query
SELECT id, "studentID", "notificationType", title, message, "isRead", "createdAt"
FROM notifications
WHERE "studentID" = '1042'       -- quoted TEXT match
  AND "isRead" = FALSE
ORDER BY "createdAt" DESC
LIMIT 20 OFFSET 0;               -- always paginate
```

Create the index:

```sql
CREATE INDEX idx_notifications_student_unread
  ON notifications ("studentID", "isRead", "createdAt" DESC);

-- Or even better — partial index covering only unread rows:
CREATE INDEX idx_notifications_unread_partial
  ON notifications ("studentID", "createdAt" DESC)
  WHERE "isRead" = FALSE;
```

**Estimated cost after fix:**
- Index seek: O(log 5,000,000) ≈ ~23 comparisons to find the student bucket.
- Range scan: O(20) rows fetched (the LIMIT).
- Total: **1–3ms** under load.

---

**Should you index every column?**

**No — that is not effective advice.** Reasons:

- Every index adds **write amplification**: each INSERT, UPDATE, or DELETE must update every relevant index. On a 50k-student campus with frequent notifications, excessive indexes slow writes significantly.
- More indexes consume more disk space and buffer pool, potentially evicting hot data from memory.
- The PostgreSQL query planner can choose **wrong** indexes if too many exist — leading to worse plans than a single well-chosen index.
- Columns like `title`, `message`, `metadata` carry high selectivity variation and are never used in `WHERE` clauses — indexing them wastes resources entirely.

**Index only what query patterns demand:**
- Columns used in `WHERE` or `JOIN` with high selectivity (e.g., `studentID`).
- Columns used in `ORDER BY` in hot paths.
- Use **composite indexes** when multiple columns appear together in queries.
- Use **partial indexes** (`WHERE "isRead" = FALSE`) to further reduce index size.

---

**SQL: All students who received a Placement notification in the last 7 days**

```sql
SELECT DISTINCT u."studentID", u.name, u.email
FROM notifications n
JOIN users u ON u."studentID" = n."studentID"
WHERE n."notificationType" = 'Placement'
  AND n."createdAt" >= NOW() - INTERVAL '7 days'
ORDER BY u."studentID";
-- Uses: idx_notifications_type_time on (notificationType, createdAt DESC)
```

---

## Stage 4

### The "Notifications Fetched on Every Page Load" Problem

**Root cause:** Each page load triggers a fresh DB query with no caching, no incremental update, and no client-side state management. At 50,000 students × multiple page loads per minute, this overwhelms the database.

---

### Strategy 1: Redis Unread Counter Cache

**Approach:**
- On notification creation: `HINCRBY unread:{studentID} count 1`
- On mark-as-read: `HINCRBY unread:{studentID} count -1`
- The notification badge on the UI calls a lightweight `/notifications/unread-count` endpoint that reads Redis — no DB query involved.

**Tradeoffs:**

| Pro | Con |
|-----|-----|
| O(1) read — DB never touched for the badge | Counter drifts if Redis restarts (needs periodic DB reconciliation) |
| Scales to any read volume | Adds Redis as an operational dependency |
| Near-zero latency | |

---

### Strategy 2: Client-Side Caching with ETag / Last-Modified

**Approach:**
- Server sends `ETag` (hash of MAX(updatedAt) or response fingerprint) with response.
- Client stores ETag and sends `If-None-Match: <etag>` on subsequent requests.
- Server returns `304 Not Modified` if nothing changed — zero payload.

**Tradeoffs:**

| Pro | Con |
|-----|-----|
| Zero bandwidth on cache hits | DB still runs the query to compute ETag |
| No extra infrastructure | Only saves serialisation + bandwidth, not DB compute |
| Works with existing HTTP stack | Useless if notifications change very frequently |

---

### Strategy 3: SSE Push — Eliminate Polling Entirely

**Approach:**
- Client connects once to `GET /realtime/stream`.
- On new notifications, server pushes only the delta (the new item).
- Client merges into local state — no page-load polling needed at all.

**Tradeoffs:**

| Pro | Con |
|-----|-----|
| Eliminates all polling DB load | Each client holds an open HTTP connection |
| True real-time UX | Multi-node deployment needs Redis pub/sub adapter |
| Simple browser EventSource API | Offline clients miss events and need a one-time catch-up fetch on reconnect |

---

### Strategy 4: Cursor-Based Pagination

**Approach:**
- Never load all notifications. Fetch page 1 (20 items) on initial load.
- Use `WHERE "createdAt" < :lastSeen` cursor pagination instead of OFFSET for deep pages.
- OFFSET pagination degrades as pages grow; cursor pagination stays O(1) per page.

**Tradeoffs:**

| Pro | Con |
|-----|-----|
| Reduces per-request data volume significantly | Does not eliminate DB calls |
| Cursor pagination is O(1) per page regardless of depth | Requires cursor state management on client |
| Simple implementation | |

---

### Recommended Combination

1. **Redis unread counter** for the badge (zero DB reads on page load).
2. **SSE push** for real-time delivery of new notifications (eliminates polling).
3. **Cursor-based pagination** for the notification list, fetched on demand (not on every page load).
4. **30-second TTL API response cache** in Redis for list responses — acceptable staleness for a campus notification system.

---

## Stage 5

### Critique of the Provided `notify_all` Implementation

**The given pseudocode:**

```
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)   # calls Email API
        save_to_db(student_id, message)   # DB insert
        push_to_app(student_id, message)  # real-time push
```

---

**Shortcomings:**

| Problem | Impact |
|---------|--------|
| **Sequential loop over 50,000 students** | At ~50ms per iteration (email + DB + push): 50,000 × 50ms = **41 minutes** blocking the API |
| **`send_email` is synchronous and first** | A single SMTP timeout or provider rate-limit (e.g., after student 800) kills the entire loop |
| **No idempotency** | If the function is retried after a partial failure, students who already received the email get it again |
| **`save_to_db` after `send_email`** | If DB insert fails, email was already sent — student has no in-app notification. Inconsistent state. |
| **No retry or dead-letter handling** | The 200 failed emails from the scenario are silently lost — no way to identify or redeliver them |
| **No observability** | No logging of which students succeeded or failed |

---

**What happened with the 200 failed emails?**

The `send_email` call failed for students 801–1000 (for example — a rate limit was hit). Since there is no retry, no dead-letter queue, and no delivery tracking, those 200 students:
- **Did not receive an email.**
- **May or may not have had their DB row saved** (depends on whether the loop continued or aborted).
- **Cannot be identified** from the system state — there is no delivery log.

---

**Should DB save and email send happen together?**

**No — they must be decoupled, and DB must come first.**

- The DB save is **fast, synchronous, and rollback-safe** — do it first to guarantee durability.
- The email send is **slow, external, and unreliable** — do it asynchronously after the DB save succeeds.
- If the email send fails, the notification still exists in the DB and can be retried independently.
- Doing both in one synchronous step means an email failure causes an application-level inconsistency.

---

### Redesigned Architecture for Reliability and Speed

**Core principle:** Save to DB → enqueue a delivery job → return immediately. Workers handle delivery asynchronously with retry and dead-letter support.

**Queue choice: RabbitMQ** (simpler operational model than Kafka for a campus-scale fanout; Kafka is preferable at 500k+ scale).

---

### Revised Pseudocode

**Producer (API handler — runs in milliseconds):**

```
function handle_notify_all(type, title, message):
    validate(type, title, message)

    broadcast_id = generate_uuid()

    # Step 1: Save broadcast record to DB first (durable)
    BEGIN TRANSACTION
      INSERT INTO notifications (id, studentID, notificationType, title, message, isRead, createdAt)
        VALUES (broadcast_id, 'broadcast', type, title, message, false, NOW())
    COMMIT

    # Step 2: Publish a single fanout job to queue (non-blocking)
    rabbitmq.publish(
      exchange = 'notifications',
      routing_key = 'fanout',
      payload = {
        broadcastId:    broadcast_id,
        type:           type,
        title:          title,
        message:        message,
        publishedAt:    now()
      },
      persistent = true   # survives broker restart
    )

    log('info', 'notify_all enqueued', { broadcastId: broadcast_id })
    return HTTP 202 { success: true, queued: true, broadcastId: broadcast_id }
```

**Fanout Worker (reads from queue, pages through students):**

```
function consume_fanout_jobs():
    for each job in rabbitmq.subscribe('notifications.fanout'):
        { broadcastId, type, title, message } = job

        page = 1
        while true:
            student_batch = db.get_students(page=page, limit=500)
            if student_batch is empty: break

            rows = []
            for student in student_batch:
                rows.append({
                    id:               generate_uuid(),
                    studentID:        student.studentID,
                    broadcastId:      broadcastId,
                    notificationType: type,
                    title:            title,
                    message:          message,
                    isRead:           false,
                    createdAt:        now()
                })

            # Bulk insert — ON CONFLICT DO NOTHING for idempotency
            db.bulk_insert('notifications', rows,
                           on_conflict = '(studentID, broadcastId) DO NOTHING')

            # Enqueue individual email delivery jobs in batches
            for each student in student_batch:
                rabbitmq.publish(
                  exchange = 'notifications',
                  routing_key = 'email.delivery',
                  payload = {
                    studentID:  student.studentID,
                    email:      student.email,
                    broadcastId: broadcastId,
                    title:      title,
                    message:    message
                  }
                )

            page += 1

        rabbitmq.ack(job)
```

**Email Delivery Worker (handles individual sends with retry):**

```
MAX_RETRIES = 3

function consume_email_jobs():
    for each job in rabbitmq.subscribe('notifications.email.delivery'):
        { studentID, email, broadcastId, title, message } = job

        # Idempotency check — was this email already sent?
        delivery = db.get_delivery(broadcastId, studentID, channel='email')
        if delivery.status == 'sent':
            rabbitmq.ack(job)
            continue

        try:
            email_provider.send(
                to              = email,
                subject         = title,
                body            = message,
                idempotency_key = broadcastId + ':' + studentID
            )
            db.update_delivery(delivery.id, status='sent', deliveredAt=now())
            rabbitmq.ack(job)

        catch EmailError as err:
            delivery.attempts += 1
            log('warn', 'email delivery failed', { studentID, broadcastId, error: err, attempt: delivery.attempts })

            if delivery.attempts >= MAX_RETRIES:
                db.update_delivery(delivery.id, status='failed', lastError=err)
                rabbitmq.publish('notifications.email.dlq', job)  # dead-letter
                rabbitmq.ack(job)
            else:
                db.update_delivery(delivery.id,
                    status='pending',
                    lastError=err,
                    nextRetryAt = now() + exponential_backoff(delivery.attempts)
                )
                rabbitmq.nack(job, requeue=false)  # let retry scheduler re-enqueue
```

---

## Stage 6

### Top-N Priority Inbox Approach

The priority inbox surfaces the **top N most important unread notifications** for a student (N = 10, 15, 20, or any value as per user's choice — configurable via `--top=<n>` CLI argument or `TOP_N` environment variable).

**Scoring function:**

```
score = typeWeight × 100 + recencyScore

typeWeight (placement > result > event, per evaluation spec):
  Placement = 3
  Result    = 2
  Event     = 1

recencyScore = 1 / (ageInHours + 1)
  → 1.0 for a brand-new notification, approaches 0 as it ages

The × 100 multiplier guarantees type always dominates:
  A new Event (score ≈ 101) always ranks above a 2-hour-old Event (score ≈ 1.33)
  A new Placement (score ≈ 301) always outranks any Result (max ≈ 201)
```

---

### How to Maintain Top N Efficiently for Continuously Arriving Notifications

**Problem:** Sorting the full notification list on every new arrival is O(n log n) — unacceptable as n grows.

**Solution: Bounded Min-Heap of size N**

The min-heap always holds the N highest-scored notifications, with the **lowest-scoring item at the root** (O(1) access to the minimum). On each new notification:

```
Algorithm:
  heap = MinHeap(maxSize = N)

  for each new notification n:
      score = computeScore(n)
      if heap.size < N:
          heap.push(n, score)          # always add if heap not full
      elif score > heap.peekMin().score:
          heap.pop()                   # evict the lowest-priority item
          heap.push(n, score)          # insert the new higher-priority item
      # else: n is not in top N — discard

  topN = heap.toSortedDesc()           # O(N log N) — constant since N is small
```

**Cost analysis:**

| Operation          | Cost       |
|--------------------|------------|
| Per new notification | O(log N) — ~3 comparisons for N=10 |
| Query top N        | O(N log N) ≈ O(1) for constant N |
| vs. re-sorting full list | O(n log n) per arrival — much worse |

**Redis production alternative (for server-side persistence):**

```
# On new notification: add to sorted set with priority score
ZADD inbox:{studentID} <score> <notificationId>

# Trim to top N immediately after each insert
ZREMRANGEBYRANK inbox:{studentID} 0 -(N+1)

# Fetch top N (highest scores first)
ZREVRANGE inbox:{studentID} 0 (N-1) WITHSCORES
```

This gives O(log n) insert and O(N) retrieval using Redis native sorted sets.

---

### Code Reference

The complete working implementation is in:
**`notifications/priority_inbox.ts`**

Key components:
- `parseTopN()` — reads N from `--top=<n>` CLI arg or `TOP_N` env var, defaults to 10.
- `TYPE_WEIGHTS` — `Placement: 3, Result: 2, Event: 1` (matches evaluation spec exactly).
- `computeScore(notification)` — scoring function.
- `MinHeap<T>` class — bounded min-heap with `push`, `bubbleUp`, `sinkDown`, `toSortedDesc`.
- `fetchAllUnreadNotifications()` — paginated API fetcher (no DB queries, uses `NOTIFICATION_API_URL` from env).
- `run()` — full orchestration: fetch → score via heap → write JSON output.

**Output:** `notifications/output/priority-top10.json`

**Run:**
```bash
# Default top 10
npm run priority:inbox

# Top 15
tsx priority_inbox.ts --top=15

# Top 20 via env var
TOP_N=20 tsx priority_inbox.ts
```
