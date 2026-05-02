/**
 * Priority Inbox — Stage 6
 *
 * Fetches notifications from the Notification API (no DB queries),
 * scores them by type weight + recency, and outputs the top-N unread
 * notifications to notifications/output/priority-top10.json.
 *
 * N is configurable: defaults to 10, override via --top=<n> CLI arg
 * or TOP_N env var (e.g., 10, 15, 20 as per user's choice).
 *
 * SCORING FUNCTION
 * ----------------
 * score = typeWeight × WEIGHT_MULTIPLIER + recencyScore
 *
 * typeWeight (per evaluation spec — placement > result > event):
 *   Placement = 3
 *   Result    = 2
 *   Event     = 1
 *
 * recencyScore = 1 / (ageInHours + 1)
 *   → 1.0 for brand-new, decays toward 0 as notification ages
 *   → WEIGHT_MULTIPLIER = 100 ensures type always dominates recency
 *     within the same type, recency acts as a tie-breaker
 *
 * EFFICIENT TOP-N MAINTENANCE FOR STREAMING DATA
 * -----------------------------------------------
 * For continuously arriving notifications, a bounded min-heap of size N
 * is the optimal structure:
 *   - On each new notification, compute its score.
 *   - If heap.size < N: push unconditionally.
 *   - Else if score > heap.peekMin().score: pop the min, push the new item.
 *   - Else: discard — the new item is not in the top N.
 *
 * Cost per arrival: O(log N) — effectively O(1) since N is a small constant.
 * Cost to query top N: O(N log N) ≈ O(1) for small N.
 *
 * This is better than sorting the full list on every arrival (O(n log n)).
 *
 * A MinHeap class is implemented below for demonstration.
 */

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './src/utils/logger.js';
import { Notification, NotificationType, ScoredNotification } from './src/types/index.js';

// ---- Parse N from CLI args or env ----
// Usage: tsx priority_inbox.ts --top=15
// Or:    TOP_N=20 tsx priority_inbox.ts

function parseTopN(): number {
  const cliArg = process.argv.find((a) => a.startsWith('--top='));
  if (cliArg) {
    const n = parseInt(cliArg.split('=')[1], 10);
    if (!isNaN(n) && n > 0) return n;
  }
  const envN = parseInt(process.env['TOP_N'] ?? '', 10);
  if (!isNaN(envN) && envN > 0) return envN;
  return 10; // default as per evaluation
}

// ---- Configuration (from env — no hard-coded values) ----

const NOTIFICATION_API_URL = process.env['NOTIFICATION_API_URL'];
const API_AUTH_TOKEN = process.env['API_AUTH_TOKEN'];
const LOG_API_URL = process.env['LOG_API_URL'];
const LOG_API_TOKEN = process.env['LOG_API_TOKEN'];
const SERVICE_NAME = process.env['SERVICE_NAME'] ?? 'priority-inbox';

if (!NOTIFICATION_API_URL || !API_AUTH_TOKEN || !LOG_API_URL || !LOG_API_TOKEN) {
  process.stderr.write(
    '[FATAL] Missing required environment variables: NOTIFICATION_API_URL, API_AUTH_TOKEN, LOG_API_URL, LOG_API_TOKEN\n',
  );
  process.exit(1);
}

const TOP_N = parseTopN();

const logger = createLogger({
  logApiUrl: LOG_API_URL,
  logApiToken: LOG_API_TOKEN,
  serviceName: SERVICE_NAME,
});

// ---- Scoring ----

/**
 * Type weights per evaluation spec: placement > result > event
 * "General" is not part of the notification_type enum in the evaluation.
 */
const TYPE_WEIGHTS: Record<NotificationType, number> = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

const WEIGHT_MULTIPLIER = 100;

function computeScore(notification: Notification): number {
  const typeWeight = TYPE_WEIGHTS[notification.type] ?? 0;
  const ageMs = Date.now() - new Date(notification.createdAt).getTime();
  const ageInHours = ageMs / (1000 * 60 * 60);
  const recencyScore = 1 / (ageInHours + 1); // (0, 1]
  return typeWeight * WEIGHT_MULTIPLIER + recencyScore;
}

// ---- Bounded Min-Heap for O(log N) streaming top-N ----

class MinHeap<T extends { priorityScore: number }> {
  private readonly heap: T[] = [];

  constructor(private readonly maxSize: number) {}

  push(item: T): void {
    if (this.heap.length < this.maxSize) {
      this.heap.push(item);
      this.bubbleUp(this.heap.length - 1);
    } else if (this.heap.length > 0 && item.priorityScore > this.heap[0].priorityScore) {
      // Replace the minimum with the new higher-priority item
      this.heap[0] = item;
      this.sinkDown(0);
    }
    // else: item is lower priority than everything in the heap — discard
  }

  toSortedDesc(): T[] {
    return [...this.heap].sort((a, b) => b.priorityScore - a.priorityScore);
  }

  get size(): number {
    return this.heap.length;
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.heap[parent].priorityScore <= this.heap[idx].priorityScore) break;
      [this.heap[parent], this.heap[idx]] = [this.heap[idx], this.heap[parent]];
      idx = parent;
    }
  }

  private sinkDown(idx: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left < n && this.heap[left].priorityScore < this.heap[smallest].priorityScore) {
        smallest = left;
      }
      if (right < n && this.heap[right].priorityScore < this.heap[smallest].priorityScore) {
        smallest = right;
      }
      if (smallest === idx) break;
      [this.heap[smallest], this.heap[idx]] = [this.heap[idx], this.heap[smallest]];
      idx = smallest;
    }
  }
}

// ---- Fetcher — paginated, fetches all unread notifications from API ----

async function fetchAllUnreadNotifications(): Promise<Notification[]> {
  await logger.Log('backend', 'info', 'priority-inbox', 'Fetching unread notifications from API', {
    url: NOTIFICATION_API_URL,
  });

  const allNotifications: Notification[] = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const response = await axios.get<{ data: Notification[]; total: number }>(NOTIFICATION_API_URL!, {
      headers: { Authorization: `Bearer ${API_AUTH_TOKEN}` },
      params: { isRead: false, page, limit },
      timeout: 15000,
    });

    const { data, total } = response.data;

    if (!Array.isArray(data) || data.length === 0) break;

    allNotifications.push(...data);

    await logger.Log('backend', 'debug', 'priority-inbox', `Fetched page ${page}`, {
      count: data.length,
      total,
    });

    if (allNotifications.length >= total) break;
    page++;
  }

  await logger.Log('backend', 'info', 'priority-inbox', 'Fetch complete', {
    totalFetched: allNotifications.length,
  });

  return allNotifications;
}

// ---- Main ----

async function run(): Promise<void> {
  await logger.Log('backend', 'info', 'priority-inbox', `Priority inbox started (top ${TOP_N})`);

  const notifications = await fetchAllUnreadNotifications();

  if (notifications.length === 0) {
    await logger.Log('backend', 'warn', 'priority-inbox', 'No unread notifications found');
    process.stdout.write('[]\n');
    return;
  }

  // Build top-N using a bounded min-heap — O(n log N) total
  const heap = new MinHeap<ScoredNotification>(TOP_N);

  for (const n of notifications) {
    heap.push({ ...n, priorityScore: computeScore(n) });
  }

  const topN = heap.toSortedDesc();

  await logger.Log('backend', 'info', 'priority-inbox', `Top ${TOP_N} computed`, {
    returned: topN.length,
    highestScore: topN[0]?.priorityScore,
    lowestScore: topN[topN.length - 1]?.priorityScore,
  });

  // Write output
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outputPath = path.resolve(__dirname, 'output', 'priority-top10.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(topN, null, 2), 'utf-8');

  await logger.Log('backend', 'info', 'priority-inbox', 'Results written to disk', {
    path: outputPath,
  });

  process.stdout.write(JSON.stringify(topN, null, 2) + '\n');
}

run().catch(async (err) => {
  await logger.Log('backend', 'fatal', 'priority-inbox', 'Priority inbox failed', {
    error: (err as Error).message,
  }).catch(() => {});
  process.stderr.write(`[FATAL] ${(err as Error).message}\n`);
  process.exit(1);
});
