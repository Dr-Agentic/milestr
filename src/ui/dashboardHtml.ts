import type { DashboardData, KPI, Task } from '../types';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function taskRow(task: Task): string {
  return [
    '      <div class="task-row">',
    '        <span class="icon">' + esc(task.icon) + '</span>',
    '        <span class="id">' + esc(task.id) + '</span>',
    '        <span class="title">' + esc(task.title) + '</span>',
    '        <span class="status ' + esc(task.status) + '">' + esc(task.status) + '</span>',
    '        <span class="progress">' + task.progress + '%</span>',
    '        <span class="parent">' + esc(task.parent ?? '-') + '</span>',
    '      </div>'
  ].join('\n');
}

function kpiCard(kpi: KPI): string {
  const trendIcon = kpi.trend === 'up' ? '&#8593;' : kpi.trend === 'down' ? '&#8595;' : '&#8594;';
  const trendClass = kpi.trend ? 'trend-' + esc(kpi.trend) : '';
  const source = kpi.source ? '<span class="kpi-source">Source: ' + esc(kpi.source) + '</span>' : '';
  return [
    '    <div class="kpi-card">',
    '      <div class="kpi-icon">' + esc(kpi.icon) + '</div>',
    '      <div class="kpi-body">',
    '        <div class="kpi-title">' + esc(kpi.title) + '</div>',
    '        <div class="kpi-value-row">',
    '          <span class="kpi-value">' + esc(String(kpi.value)) + '</span>',
    (kpi.unit ? '          <span class="kpi-unit">' + esc(kpi.unit) + '</span>' : ''),
    (kpi.trend ? '          <span class="kpi-trend ' + trendClass + '">' + trendIcon + '</span>' : ''),
    '        </div>',
    source,
    '        <div class="kpi-updated">Updated ' + new Date(kpi.lastUpdated).toLocaleString() + '</div>',
    '      </div>',
    '    </div>'
  ].join('\n');
}

function milestoneNode(task: Task): string {
  const progressClass = task.status === 'done' ? ' done' : '';
  return [
    '      <div class="milestone-node ' + esc(task.status) + '">',
    '        <div class="milestone-icon">' + esc(task.icon) + '</div>',
    '        <div class="milestone-info">',
    '          <h3>' + esc(task.title) + '</h3>',
    '          <div class="progress-bar"><div class="progress-fill' + progressClass + '" style="width: ' + task.progress + '%"></div></div>',
    '          <div class="due">' + esc(task.dueDate ?? 'No due date') + '</div>',
    '        </div>',
    '      </div>'
  ].join('\n');
}

function kanbanCol(status: string, items: Task[]): string {
  const itemsHtml = items.map(function(task) {
    const progressClass = task.status === 'done' ? ' done' : '';
    return [
      '        <div class="kanban-card">',
      '          <div class="icon">' + esc(task.icon) + '</div>',
      '          <h4>' + esc(task.title) + '</h4>',
      '          <div class="meta">' + esc(task.id) + ' | ' + esc(task.parent ?? '') + '</div>',
      '          <div class="progress"><div class="progress-fill' + progressClass + '" style="width: ' + task.progress + '%"></div></div>',
      '        </div>'
    ].join('\n');
  }).join('\n');
  return [
    '      <div class="kanban-col ' + esc(status) + '">',
    '        <h2>' + esc(status.replace('_', ' ')) + ' (' + items.length + ')</h2>',
    itemsHtml,
    '      </div>'
  ].join('\n');
}

export function exportDashboardHtml(data: DashboardData): string {
  const tasks = Object.values(data.tasks);
  const root = data.tasks.ROOT;
  const milestones = tasks.filter(function(task) { return task.type === 'milestone'; });
  const kpis = data.kpis ? Object.values(data.kpis) : [];

  const kanbanGroups = {
    not_started: tasks.filter(function(task) { return task.status === 'not_started'; }),
    analyzing: tasks.filter(function(task) { return task.status === 'analyzing'; }),
    ongoing: tasks.filter(function(task) { return task.status === 'ongoing'; }),
    done: tasks.filter(function(task) { return task.status === 'done'; }),
    blocked: tasks.filter(function(task) { return task.status === 'blocked'; })
  };

  const kpiGridHtml = kpis.length > 0
    ? '<div class="kpi-grid">' + kpis.map(kpiCard).join('\n') + '\n    </div>'
    : '<div class="kpi-empty">No KPIs configured yet. Add them via:\n  npm run dev -- --agent your-agent create-kpi --id my-kpi --title "Sign-ups" --value 0 --unit users</div>';

  const timelineMilestonesHtml = milestones.map(milestoneNode).join('\n');

  const initiativesTasksHtml = tasks
    .filter(function(task) { return task.type !== 'milestone' && task.id !== 'ROOT'; })
    .map(taskRow)
    .join('\n');

  const kanbanColsHtml = Object.entries(kanbanGroups).map(function(entry) {
    return kanbanCol(entry[0], entry[1]);
  }).join('\n');

  const listTasksHtml = tasks
    .filter(function(task) { return task.id !== 'ROOT'; })
    .map(taskRow)
    .join('\n');

  const kpiTabClass = kpis.length === 0 ? ' active' : '';
  const timelineTabClass = kpis.length > 0 ? ' active' : '';

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <title>Milestr Dashboard</title>',
    '  <style>',
    '    * { margin: 0; padding: 0; box-sizing: border-box; }',
    '    body { font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 24px; }',
    '    .header { text-align: center; margin-bottom: 32px; }',
    '    .header h1 { font-size: 28px; margin-bottom: 8px; }',
    '    .header .meta { color: #64748b; font-size: 14px; }',
    '',
    '    .tabs { display: flex; gap: 8px; margin-bottom: 24px; justify-content: center; flex-wrap: wrap; }',
    '    .tab { padding: 10px 20px; background: #1e293b; border: none; border-radius: 8px; color: #94a3b8; cursor: pointer; font-size: 14px; transition: all 0.2s; }',
    '    .tab:hover { background: #334155; }',
    '    .tab.active { background: #3b82f6; color: white; }',
    '',
    '    .view { display: none; }',
    '    .view.active { display: block; }',
    '',
    '    /* KPI Section */',
    '    .kpi-section { margin-bottom: 40px; }',
    '    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }',
    '    .kpi-card { background: #1e293b; border-radius: 12px; padding: 20px; display: flex; align-items: flex-start; gap: 16px; border: 1px solid #334155; }',
    '    .kpi-card .kpi-icon { font-size: 28px; flex-shrink: 0; }',
    '    .kpi-card .kpi-body { flex: 1; min-width: 0; }',
    '    .kpi-card .kpi-title { font-size: 13px; color: #94a3b8; margin-bottom: 8px; font-weight: 500; }',
    '    .kpi-card .kpi-value-row { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }',
    '    .kpi-card .kpi-value { font-size: 28px; font-weight: 700; color: #f1f5f9; }',
    '    .kpi-card .kpi-unit { font-size: 14px; color: #64748b; }',
    '    .kpi-card .kpi-trend { font-size: 16px; font-weight: 600; margin-left: 4px; }',
    '    .kpi-card .kpi-trend.trend-up { color: #22c55e; }',
    '    .kpi-card .kpi-trend.trend-down { color: #ef4444; }',
    '    .kpi-card .kpi-trend.trend-neutral { color: #64748b; }',
    '    .kpi-card .kpi-source { display: block; font-size: 11px; color: #475569; margin-top: 6px; }',
    '    .kpi-card .kpi-updated { font-size: 11px; color: #334155; margin-top: 8px; }',
    '    .kpi-empty { text-align: center; color: #475569; padding: 40px; font-size: 14px; }',
    '',
    '    /* Timeline */',
    '    .timeline { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding: 24px 0; overflow-x: auto; }',
    '    .milestone-node { display: flex; flex-direction: column; align-items: center; min-width: 140px; position: relative; }',
    '    .milestone-node:not(:last-child)::after { content: \'\'; position: absolute; top: 24px; left: calc(50% + 30px); width: calc(100% - 60px); height: 3px; background: #334155; }',
    '    .milestone-node.completed:not(:last-child)::after { background: #22c55e; }',
    '    .milestone-icon { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; background: #1e293b; border: 3px solid #334155; z-index: 1; }',
    '    .milestone-node.ongoing .milestone-icon { border-color: #3b82f6; box-shadow: 0 0 20px rgba(59, 130, 246, 0.4); }',
    '    .milestone-node.done .milestone-icon { border-color: #22c55e; background: #22c55e; }',
    '    .milestone-info { margin-top: 12px; text-align: center; }',
    '    .milestone-info h3 { font-size: 14px; margin-bottom: 4px; }',
    '    .milestone-info .progress-bar { width: 80px; height: 6px; background: #334155; border-radius: 3px; margin: 8px auto; overflow: hidden; }',
    '    .milestone-info .progress-fill { height: 100%; background: #3b82f6; border-radius: 3px; transition: width 0.3s; }',
    '    .milestone-info .progress-fill.done { background: #22c55e; }',
    '    .milestone-info .due { font-size: 12px; color: #64748b; }',
    '',
    '    /* Kanban */',
    '    .kanban { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }',
    '    .kanban-col { background: #1e293b; border-radius: 12px; padding: 16px; min-height: 400px; }',
    '    .kanban-col h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid; }',
    '    .kanban-col.not_started h2 { border-color: #64748b; color: #94a3b8; }',
    '    .kanban-col.analyzing h2 { border-color: #f59e0b; color: #fbbf24; }',
    '    .kanban-col.ongoing h2 { border-color: #3b82f6; color: #60a5fa; }',
    '    .kanban-col.done h2 { border-color: #22c55e; color: #4ade80; }',
    '    .kanban-col.blocked h2 { border-color: #ef4444; color: #f87171; }',
    '',
    '    .kanban-card { background: #0f172a; border-radius: 8px; padding: 12px; margin-bottom: 12px; border-left: 3px solid #334155; }',
    '    .kanban-card .icon { font-size: 16px; margin-bottom: 6px; }',
    '    .kanban-card h4 { font-size: 13px; margin-bottom: 6px; }',
    '    .kanban-card .meta { font-size: 11px; color: #64748b; }',
    '    .kanban-card .progress { height: 4px; background: #334155; border-radius: 2px; margin-top: 8px; }',
    '    .kanban-card .progress-fill { height: 100%; background: #3b82f6; border-radius: 2px; }',
    '    .kanban-card .progress-fill.done { background: #22c55e; }',
    '',
    '    /* Task List */',
    '    .task-list { display: flex; flex-direction: column; gap: 8px; }',
    '    .task-row { display: flex; align-items: center; gap: 12px; background: #1e293b; padding: 12px 16px; border-radius: 8px; }',
    '    .task-row .icon { font-size: 18px; }',
    '    .task-row .id { font-family: monospace; color: #64748b; font-size: 12px; width: 60px; }',
    '    .task-row .title { flex: 1; font-size: 14px; }',
    '    .task-row .status { font-size: 12px; padding: 4px 10px; border-radius: 12px; }',
    '    .task-row .status.not_started { background: #334155; color: #94a3b8; }',
    '    .task-row .status.analyzing { background: #451a03; color: #fbbf24; }',
    '    .task-row .status.ongoing { background: #1e3a5f; color: #60a5fa; }',
    '    .task-row .status.done { background: #14532d; color: #4ade80; }',
    '    .task-row .status.blocked { background: #450a0a; color: #f87171; }',
    '    .task-row .progress { width: 80px; font-size: 12px; color: #64748b; }',
    '    .task-row .parent { font-size: 11px; color: #475569; }',
    '',
    '    .section { margin-bottom: 32px; }',
    '    .section h2 { font-size: 18px; margin-bottom: 16px; color: #94a3b8; }',
    '',
    '    @media (max-width: 768px) {',
    '      .kanban { grid-template-columns: 1fr; }',
    '      .timeline { flex-direction: column; align-items: center; }',
    '      .milestone-node:not(:last-child)::after { display: none; }',
    '      .kpi-grid { grid-template-columns: 1fr 1fr; }',
    '    }',
    '    @media (max-width: 480px) {',
    '      .kpi-grid { grid-template-columns: 1fr; }',
    '    }',
    '  </style>',
    '</head>',
    '<body>',
    '  <div class="header">',
    '    <h1>' + esc(root?.icon ?? data.root.icon) + ' ' + esc(root?.title ?? data.root.title) + '</h1>',
    '    <div class="meta">Last updated: ' + new Date(data.meta.lastUpdated).toLocaleString() + ' | Total tasks: ' + tasks.length + (kpis.length > 0 ? ' | KPIs: ' + kpis.length : '') + '</div>',
    '  </div>',
    '',
    '  <div class="tabs">',
    '    <button class="tab' + kpiTabClass + '" onclick="showView(\'kpis\', event)">KPIs</button>',
    '    <button class="tab' + timelineTabClass + '" onclick="showView(\'timeline\', event)">Timeline</button>',
    '    <button class="tab" onclick="showView(\'kanban\', event)">Kanban</button>',
    '    <button class="tab" onclick="showView(\'list\', event)">List</button>',
    '  </div>',
    '',
    '  <div id="kpis" class="view' + kpiTabClass + '">',
    '    ' + kpiGridHtml,
    '  </div>',
    '',
    '  <div id="timeline" class="view' + timelineTabClass + '">',
    '    <div class="timeline">',
    timelineMilestonesHtml,
    '    </div>',
    '',
    '    <div class="section">',
    '      <h2>Initiatives & Tasks</h2>',
    '      <div class="task-list">',
    initiativesTasksHtml,
    '      </div>',
    '    </div>',
    '  </div>',
    '',
    '  <div id="kanban" class="view">',
    '    <div class="kanban">',
    kanbanColsHtml,
    '    </div>',
    '  </div>',
    '',
    '  <div id="list" class="view">',
    '    <div class="task-list">',
    listTasksHtml,
    '    </div>',
    '  </div>',
    '',
    '  <script>',
    '    function showView(viewId, event) {',
    '      document.querySelectorAll(\'.view\').forEach(function(v) { v.classList.remove(\'active\'); });',
    '      document.querySelectorAll(\'.tab\').forEach(function(t) { t.classList.remove(\'active\'); });',
    '      document.getElementById(viewId).classList.add(\'active\');',
    '      if (event && event.target) event.target.classList.add(\'active\');',
    '    }',
    '  </script>',
    '</body>',
    '</html>'
  ].join('\n');
}
