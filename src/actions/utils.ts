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
