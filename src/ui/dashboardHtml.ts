import type { DashboardData, Task } from '../types';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function taskRow(task: Task): string {
  return `
      <div class="task-row">
        <span class="icon">${esc(task.icon)}</span>
        <span class="id">${esc(task.id)}</span>
        <span class="title">${esc(task.title)}</span>
        <span class="status ${esc(task.status)}">${esc(task.status)}</span>
        <span class="progress">${task.progress}%</span>
        <span class="parent">${esc(task.parent ?? '-')}</span>
      </div>`;
}

export function exportDashboardHtml(data: DashboardData): string {
  const tasks = Object.values(data.tasks);
  const root = data.tasks.ROOT;
  const milestones = tasks.filter((task) => task.type === 'milestone');

  const kanbanGroups = {
    not_started: tasks.filter((task) => task.status === 'not_started'),
    analyzing: tasks.filter((task) => task.status === 'analyzing'),
    ongoing: tasks.filter((task) => task.status === 'ongoing'),
    done: tasks.filter((task) => task.status === 'done'),
    blocked: tasks.filter((task) => task.status === 'blocked')
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RCS X Strategy Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 24px; }
    .header { text-align: center; margin-bottom: 32px; }
    .header h1 { font-size: 28px; margin-bottom: 8px; }
    .header .meta { color: #64748b; font-size: 14px; }

    .tabs { display: flex; gap: 8px; margin-bottom: 24px; justify-content: center; }
    .tab { padding: 10px 20px; background: #1e293b; border: none; border-radius: 8px; color: #94a3b8; cursor: pointer; font-size: 14px; transition: all 0.2s; }
    .tab:hover { background: #334155; }
    .tab.active { background: #3b82f6; color: white; }

    .view { display: none; }
    .view.active { display: block; }

    .timeline { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding: 24px 0; overflow-x: auto; }
    .milestone-node { display: flex; flex-direction: column; align-items: center; min-width: 140px; position: relative; }
    .milestone-node:not(:last-child)::after { content: ''; position: absolute; top: 24px; left: calc(50% + 30px); width: calc(100% - 60px); height: 3px; background: #334155; }
    .milestone-node.completed:not(:last-child)::after { background: #22c55e; }
    .milestone-icon { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; background: #1e293b; border: 3px solid #334155; z-index: 1; }
    .milestone-node.ongoing .milestone-icon { border-color: #3b82f6; box-shadow: 0 0 20px rgba(59, 130, 246, 0.4); }
    .milestone-node.done .milestone-icon { border-color: #22c55e; background: #22c55e; }
    .milestone-info { margin-top: 12px; text-align: center; }
    .milestone-info h3 { font-size: 14px; margin-bottom: 4px; }
    .milestone-info .progress-bar { width: 80px; height: 6px; background: #334155; border-radius: 3px; margin: 8px auto; overflow: hidden; }
    .milestone-info .progress-fill { height: 100%; background: #3b82f6; border-radius: 3px; transition: width 0.3s; }
    .milestone-info .progress-fill.done { background: #22c55e; }
    .milestone-info .due { font-size: 12px; color: #64748b; }

    .kanban { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }
    .kanban-col { background: #1e293b; border-radius: 12px; padding: 16px; min-height: 400px; }
    .kanban-col h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid; }
    .kanban-col.not_started h2 { border-color: #64748b; color: #94a3b8; }
    .kanban-col.analyzing h2 { border-color: #f59e0b; color: #fbbf24; }
    .kanban-col.ongoing h2 { border-color: #3b82f6; color: #60a5fa; }
    .kanban-col.done h2 { border-color: #22c55e; color: #4ade80; }
    .kanban-col.blocked h2 { border-color: #ef4444; color: #f87171; }

    .kanban-card { background: #0f172a; border-radius: 8px; padding: 12px; margin-bottom: 12px; border-left: 3px solid #334155; }
    .kanban-card .icon { font-size: 16px; margin-bottom: 6px; }
    .kanban-card h4 { font-size: 13px; margin-bottom: 6px; }
    .kanban-card .meta { font-size: 11px; color: #64748b; }
    .kanban-card .progress { height: 4px; background: #334155; border-radius: 2px; margin-top: 8px; }
    .kanban-card .progress-fill { height: 100%; background: #3b82f6; border-radius: 2px; }
    .kanban-card .progress-fill.done { background: #22c55e; }

    .task-list { display: flex; flex-direction: column; gap: 8px; }
    .task-row { display: flex; align-items: center; gap: 12px; background: #1e293b; padding: 12px 16px; border-radius: 8px; }
    .task-row .icon { font-size: 18px; }
    .task-row .id { font-family: monospace; color: #64748b; font-size: 12px; width: 60px; }
    .task-row .title { flex: 1; font-size: 14px; }
    .task-row .status { font-size: 12px; padding: 4px 10px; border-radius: 12px; }
    .task-row .status.not_started { background: #334155; color: #94a3b8; }
    .task-row .status.analyzing { background: #451a03; color: #fbbf24; }
    .task-row .status.ongoing { background: #1e3a5f; color: #60a5fa; }
    .task-row .status.done { background: #14532d; color: #4ade80; }
    .task-row .status.blocked { background: #450a0a; color: #f87171; }
    .task-row .progress { width: 80px; font-size: 12px; color: #64748b; }
    .task-row .parent { font-size: 11px; color: #475569; }

    .section { margin-bottom: 32px; }
    .section h2 { font-size: 18px; margin-bottom: 16px; color: #94a3b8; }

    @media (max-width: 768px) {
      .kanban { grid-template-columns: 1fr; }
      .timeline { flex-direction: column; align-items: center; }
      .milestone-node:not(:last-child)::after { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${esc(root?.icon ?? data.root.icon)} ${esc(root?.title ?? data.root.title)}</h1>
    <div class="meta">Last updated: ${new Date(data.meta.lastUpdated).toLocaleString()} | Total tasks: ${tasks.length}</div>
  </div>

  <div class="tabs">
    <button class="tab active" onclick="showView('timeline', event)">Timeline</button>
    <button class="tab" onclick="showView('kanban', event)">Kanban</button>
    <button class="tab" onclick="showView('list', event)">List</button>
  </div>

  <div id="timeline" class="view active">
    <div class="timeline">
      ${milestones.map((task) => `
      <div class="milestone-node ${esc(task.status)}">
        <div class="milestone-icon">${esc(task.icon)}</div>
        <div class="milestone-info">
          <h3>${esc(task.title)}</h3>
          <div class="progress-bar"><div class="progress-fill ${task.status === 'done' ? 'done' : ''}" style="width: ${task.progress}%"></div></div>
          <div class="due">${esc(task.dueDate ?? 'No due date')}</div>
        </div>
      </div>`).join('')}
    </div>

    <div class="section">
      <h2>Initiatives & Tasks</h2>
      <div class="task-list">
        ${tasks.filter((task) => task.type !== 'milestone' && task.id !== 'ROOT').map(taskRow).join('')}
      </div>
    </div>
  </div>

  <div id="kanban" class="view">
    <div class="kanban">
      ${Object.entries(kanbanGroups).map(([status, items]) => `
      <div class="kanban-col ${esc(status)}">
        <h2>${esc(status.replace('_', ' '))} (${items.length})</h2>
        ${items.map((task) => `
        <div class="kanban-card">
          <div class="icon">${esc(task.icon)}</div>
          <h4>${esc(task.title)}</h4>
          <div class="meta">${esc(task.id)} | ${esc(task.parent ?? '')}</div>
          <div class="progress"><div class="progress-fill ${task.status === 'done' ? 'done' : ''}" style="width: ${task.progress}%"></div></div>
        </div>`).join('')}
      </div>`).join('')}
    </div>
  </div>

  <div id="list" class="view">
    <div class="task-list">
      ${tasks.filter((task) => task.id !== 'ROOT').map(taskRow).join('')}
    </div>
  </div>

  <script>
    function showView(viewId, event) {
      document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.getElementById(viewId).classList.add('active');
      event.target.classList.add('active');
    }
  </script>
</body>
</html>`;
}
