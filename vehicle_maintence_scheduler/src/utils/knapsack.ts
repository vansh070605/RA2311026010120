import { Task, DepotResult } from '../types/index.js';
import { Logger } from '../utils/logger.js';

export function solveKnapsack(tasks: Task[], capacity: number): Omit<DepotResult, 'depotId'> {
  const n = tasks.length;

  if (n === 0 || capacity <= 0) {
    return { selectedTasks: [], totalDuration: 0, totalImpact: 0 };
  }

  const dp: number[] = new Array(capacity + 1).fill(0);

  const keep: Uint8Array[] = Array.from({ length: n }, () => new Uint8Array(capacity + 1));

  for (let i = 0; i < n; i++) {
    const { duration, impact } = tasks[i];

    for (let w = capacity; w >= duration; w--) {
      const withItem = dp[w - duration] + impact;
      if (withItem > dp[w]) {
        dp[w] = withItem;
        keep[i][w] = 1;
      }
    }
  }

  const selectedTasks: string[] = [];
  let remainingCapacity = capacity;

  for (let i = n - 1; i >= 0; i--) {
    if (keep[i][remainingCapacity] === 1) {
      selectedTasks.push(tasks[i].taskId);
      remainingCapacity -= tasks[i].duration;
    }
  }

  const totalDuration = tasks
    .filter((t) => selectedTasks.includes(t.taskId))
    .reduce((sum, t) => sum + t.duration, 0);

  return {
    selectedTasks,
    totalDuration,
    totalImpact: dp[capacity],
  };
}
