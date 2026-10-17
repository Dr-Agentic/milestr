import type { DashboardData, Task } from '../types';
import { NotFoundError } from '../errors';

export function getTaskOrThrow(data: DashboardData, taskId: string): Task {
  const task = data.tasks[taskId];
  if (!task) {
    throw new NotFoundError(`Task not found: ${taskId}`);
  }
  return task;
}

export function addActivityLog(data: DashboardData, taskId: string, note: string, agent: string): void {
  const task = getTaskOrThrow(data, taskId);
  if (!task.activityLog) {
    task.activityLog = [];
  }

  task.activityLog.unshift({
    date: new Date().toISOString(),
    agent,
    note
  });

  if (task.activityLog.length > 20) {
    task.activityLog = task.activityLog.slice(0, 20);
  }
}

export function recalculateProgress(data: DashboardData, taskId: string): void {
  const task = getTaskOrThrow(data, taskId);
  if (!task.children.length) {
    return;
  }

  let total = 0;
  let count = 0;
  for (const childId of task.children) {
    const child = data.tasks[childId];
    if (!child) {
      continue;
    }
    total += child.progress;
    count += 1;
  }

  if (count > 0) {
    task.progress = Math.round(total / count);
  }
}

export function updateParentStatus(data: DashboardData, taskId: string): void {
  const task = data.tasks[taskId];
  if (!task?.parent) {
    return;
  }

  const parent = data.tasks[task.parent];
  if (!parent?.children.length) {
    return;
  }

  let allDone = true;
  let anyOngoing = false;

  for (const childId of parent.children) {
    const child = data.tasks[childId];
    if (!child) {
      continue;
    }

    if (child.status !== 'done') {
      allDone = false;
    }
    if (child.status === 'ongoing') {
      anyOngoing = true;
    }
  }

  if (allDone) {
    parent.status = 'done';
    parent.progress = 100;
  } else if (anyOngoing && parent.status === 'not_started') {
    parent.status = 'ongoing';
  }
}

export function cascadeUpdate(data: DashboardData, taskId: string): void {
  let currentId: string | null = taskId;

  while (currentId) {
    const task: Task | undefined = data.tasks[currentId];
    if (!task?.parent) {
      break;
    }

    const parent: Task | undefined = data.tasks[task.parent];
    if (!parent?.children.length) {
      break;
    }

    let total = 0;
    let count = 0;
    let allDone = true;
    let anyOngoing = false;

    for (const childId of parent.children) {
      const child = data.tasks[childId];
      if (!child) {
        continue;
      }

      total += child.progress;
      count += 1;
      if (child.status !== 'done') {
        allDone = false;
      }
      if (child.status === 'ongoing') {
        anyOngoing = true;
      }
    }

    if (count > 0) {
      parent.progress = Math.round(total / count);
      if (allDone) {
        parent.status = 'done';
        parent.progress = 100;
      } else if (anyOngoing) {
        parent.status = 'ongoing';
      }
    }

    currentId = task.parent;
  }
}

export interface HealReport {
  fixed: string[];
  skipped: string[];
}

/**
 * Self-heal pass: for every parent with children, recompute the parent's
 * progress and status from the current state of its children. Fixes drift
 * caused by out-of-band edits to data.json (older agent runtimes without
 * the cascadeUpdate rule, or human edits that bypassed the CLI).
 *
 * Rules applied per parent:
 *   - If every child is `status='done'`, force `progress=100, status='done'`.
 *   - Otherwise, set `progress` to the unweighted mean of children's progress.
 *   - If any child is `ongoing` and the parent was `not_started`, flip to `ongoing`.
 *   - If `status='done'` but `progress != 100`, force `progress = 100`.
 *
 * Pure: mutates `data.tasks` in place and returns a report. Does not persist.
 */
export function healParentRollups(data: DashboardData): HealReport {
  const report: HealReport = { fixed: [], skipped: [] };

  // Sort task ids so leaves come before their parents. This makes a single
  // top-down pass correct: when we process a parent, all its children have
  // already been reconciled to their true state.
  const sortedIds = Object.keys(data.tasks).sort((a, b) => {
    const aChildren = data.tasks[a]?.children.length ?? 0;
    const bChildren = data.tasks[b]?.children.length ?? 0;
    return aChildren - bChildren; // fewer children first (leaves before parents)
  });

  for (const taskId of sortedIds) {
    const task = data.tasks[taskId];
    if (!task || !task.children.length) {
      if (task) report.skipped.push(taskId);
      continue;
    }

    let total = 0;
    let count = 0;
    let allDone = true;
    let anyOngoing = false;

    for (const childId of task.children) {
      const child = data.tasks[childId];
      if (!child) {
        continue;
      }
      total += child.progress;
      count += 1;
      if (child.status !== 'done') {
        allDone = false;
      }
      if (child.status === 'ongoing') {
        anyOngoing = true;
      }
    }

    if (count === 0) {
      report.skipped.push(taskId);
      continue;
    }

    const newProgress = Math.round(total / count);
    let fixed = false;

    if (allDone) {
      if (task.progress !== 100 || task.status !== 'done') {
        task.progress = 100;
        task.status = 'done';
        fixed = true;
      }
    } else {
      if (task.progress !== newProgress) {
        task.progress = newProgress;
        fixed = true;
      }
      if (anyOngoing && task.status === 'not_started') {
        task.status = 'ongoing';
        fixed = true;
      }
    }

    // Status=done but progress != 100 (inconsistent regardless of children).
    if (task.status === 'done' && task.progress !== 100) {
      task.progress = 100;
      fixed = true;
    }

    if (fixed) {
      report.fixed.push(taskId);
    }
  }

  return report;
}
