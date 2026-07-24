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

// --- Tree view (issue #6) ---
//
// Builds a right-to-left hierarchical tree of the task graph. The root
// sits on the right; children branch out to the left as the tree widens.
// Each node starts collapsed, showing only the summary (icon, title,
// progress %, status). Clicking the body of the node expands/collapses
// its descendants. Clicking the title zooms in: that node becomes the
// focal point and a breadcrumb is rendered above.
//
// Tree state is kept in module-scope closures below (renderTree* helpers)
// so the function itself stays pure and the inline `<script>` block in
// `exportDashboardHtml` can wire up handlers by id.

interface TreeNode {
  task: Task;
  children: TreeNode[];
}

function buildTree(data: DashboardData): TreeNode | null {
  const tasks = data.tasks;
  const rootId = data.root.id;
  const rootTask = tasks[rootId];
  if (!rootTask) return null;

  function build(id: string): TreeNode | null {
    const task = tasks[id];
    if (!task) return null;
    const kids = (task.children || [])
      .map(function (cid) { return build(cid); })
      .filter(function (n): n is TreeNode { return n !== null; });
    return { task: task, children: kids };
  }

  return build(rootId);
}

function statusBarColor(status: string): string {
  switch (status) {
    case 'done': return '#22c55e';
    case 'ongoing': return '#3b82f6';
    case 'analyzing': return '#f59e0b';
    case 'blocked': return '#ef4444';
    case 'not_started': default: return '#64748b';
  }
}

function renderTreeNode(node: TreeNode): string {
  const t = node.task;
  const accent = statusBarColor(t.status);
  const expandedCls = ''; // start collapsed
  const hasChildren = node.children.length > 0;
  const childrenHtml = hasChildren
    ? '\n      <ul class="tree-children">' +
        node.children.map(renderTreeNodeLi).join('\n') +
      '\n      </ul>'
    : '';
  const due = t.dueDate ? '<span class="tree-due">Due: ' + esc(t.dueDate) + '</span>' : '';
  const sub = t.subtitle ? '<div class="tree-subtitle">' + esc(t.subtitle) + '</div>' : '';
  const log = (t.activityLog && t.activityLog.length > 0)
    ? '<ul class="tree-log">' +
        t.activityLog.slice(0, 5).map(function (e) {
          const who = e.agent ? esc(e.agent) + ' · ' : '';
          return '<li><span class="tree-log-meta">' + who + esc(new Date(e.date).toLocaleString()) + '</span> ' + esc(e.note) + '</li>';
        }).join('') +
      '</ul>'
    : '';
  return [
    '<div class="tree-node ' + esc(t.status) + esc(expandedCls) + '" data-tree-id="' + esc(t.id) + '">',
    '  <div class="tree-card" style="border-inline-start: 4px solid ' + accent + '">',
    '    <button type="button" class="tree-toggle" data-tree-toggle="' + esc(t.id) + '" aria-label="Toggle ' + esc(t.title) + '">' + (hasChildren ? '▸' : '·') + '</button>',
    '    <span class="tree-icon">' + esc(t.icon) + '</span>',
    '    <div class="tree-body">',
    '      <button type="button" class="tree-title" data-tree-zoom="' + esc(t.id) + '">' + esc(t.title) + '</button>',
    '      <div class="tree-meta">',
    '        <span class="tree-status ' + esc(t.status) + '">' + esc(t.status.replace('_', ' ')) + '</span>',
    '        <span class="tree-progress">' + t.progress + '%</span>',
              due,
    '      </div>',
            sub,
            log,
    '    </div>',
    '  </div>',
          childrenHtml,
    '</div>'
  ].join('\n');
}

function renderTreeNodeLi(node: TreeNode): string {
  return '<li>' + renderTreeNode(node) + '</li>';
}

function renderTreeView(data: DashboardData): string {
  const tree = buildTree(data);
  if (!tree) return '<div class="tree-empty">No tasks to render.</div>';

  const rootId = esc(tree.task.id);

  return [
    '<div class="tree-wrap" id="tree-wrap" data-tree-root="' + rootId + '">',
    '  <nav class="tree-breadcrumb" id="tree-breadcrumb" aria-label="Tree focus path"></nav>',
    '  <div class="tree-scroll" id="tree-scroll">',
    '    <div class="tree-root" id="tree-root">',
              renderTreeNode(tree),
    '    </div>',
    '  </div>',
    '  <div class="tree-help">',
    '    <span><kbd>Click body</kbd> expand/collapse</span>',
    '    <span><kbd>Click title</kbd> zoom</span>',
    '    <span><kbd>Esc</kbd> zoom out</span>',
    '    <span><kbd>+</kbd>/<kbd>-</kbd> expand/collapse all</span>',
    '  </div>',
    '</div>'
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

  const treeHtml = renderTreeView(data);

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

    '    /* Tree (issue #6) — RTL, progressive disclosure */',
    '    .tree-wrap { background: #1e293b; border-radius: 12px; padding: 16px; border: 1px solid #334155; direction: rtl; }',
    '    .tree-breadcrumb { direction: ltr; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 13px; color: #94a3b8; margin-bottom: 12px; min-height: 24px; }',
    '    .tree-breadcrumb .crumb { background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 4px 10px; cursor: pointer; color: #cbd5e1; font-family: inherit; font-size: 12px; }',
    '    .tree-breadcrumb .crumb:hover { background: #334155; }',
    '    .tree-breadcrumb .crumb.current { background: #3b82f6; color: white; border-color: #3b82f6; cursor: default; }',
    '    .tree-breadcrumb .sep { color: #475569; }',
    '    .tree-scroll { overflow: auto; max-height: 70vh; direction: rtl; padding: 8px 0; }',
    '    .tree-root, .tree-children { list-style: none; margin: 0; padding: 0; }',
    '    .tree-children { display: none; padding-inline-start: 20px; margin-top: 8px; border-inline-start: 1px dashed #334155; }',
    '    .tree-node.expanded > .tree-children { display: block; }',
    '    .tree-node.zoomed > .tree-card { box-shadow: 0 0 0 2px #3b82f6; }',
    '    .tree-card { background: #0f172a; border-radius: 8px; padding: 10px 12px; display: flex; gap: 10px; align-items: flex-start; margin: 6px 0; direction: ltr; text-align: left; min-width: 220px; max-width: 320px; }',
    '    .tree-toggle { background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 14px; padding: 0 4px; line-height: 1; }',
    '    .tree-toggle:hover { color: #f1f5f9; }',
    '    .tree-icon { font-size: 18px; line-height: 1.4; }',
    '    .tree-body { flex: 1; min-width: 0; }',
    '    .tree-title { background: transparent; border: none; color: #f1f5f9; font-size: 14px; font-weight: 600; cursor: pointer; padding: 0; text-align: start; font-family: inherit; }',
    '    .tree-title:hover { color: #60a5fa; }',
    '    .tree-meta { display: flex; gap: 8px; align-items: center; font-size: 11px; color: #94a3b8; margin-top: 4px; flex-wrap: wrap; }',
    '    .tree-status { padding: 2px 8px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px; }',
    '    .tree-status.not_started { background: #334155; color: #94a3b8; }',
    '    .tree-status.analyzing { background: #451a03; color: #fbbf24; }',
    '    .tree-status.ongoing { background: #1e3a5f; color: #60a5fa; }',
    '    .tree-status.done { background: #14532d; color: #4ade80; }',
    '    .tree-status.blocked { background: #450a0a; color: #f87171; }',
    '    .tree-progress { font-family: monospace; }',
    '    .tree-due { font-size: 11px; color: #64748b; }',
    '    .tree-subtitle { font-size: 12px; color: #94a3b8; margin-top: 6px; line-height: 1.4; }',
    '    .tree-log { list-style: none; margin: 8px 0 0; padding: 0; border-top: 1px solid #1e293b; padding-top: 6px; }',
    '    .tree-log li { font-size: 11px; color: #cbd5e1; padding: 3px 0; line-height: 1.4; }',
    '    .tree-log-meta { color: #64748b; font-size: 10px; margin-inline-end: 4px; }',
    '    .tree-empty { text-align: center; color: #475569; padding: 40px; font-size: 14px; }',
    '    .tree-help { direction: ltr; display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px; padding-top: 12px; border-top: 1px solid #334155; color: #64748b; font-size: 11px; }',
    '    .tree-help kbd { background: #0f172a; border: 1px solid #334155; border-radius: 4px; padding: 1px 6px; font-family: monospace; font-size: 10px; color: #cbd5e1; }',

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
    '    <button class="tab" onclick="showView(\'tree\', event)">Tree</button>',
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
    '  <div id="tree" class="view">',
            treeHtml,
    '  </div>',
    '',
    '  <script>',
    '    function showView(viewId, event) {',
    '      document.querySelectorAll(\'.view\').forEach(function(v) { v.classList.remove(\'active\'); });',
    '      document.querySelectorAll(\'.tab\').forEach(function(t) { t.classList.remove(\'active\'); });',
    '      document.getElementById(viewId).classList.add(\'active\');',
    '      if (event && event.target) event.target.classList.add(\'active\');',
    '    }',
    '',
    '    // Tree view (issue #6) — RTL progressive-disclosure tree',
    '    (function() {',
    '      var scroll = document.getElementById(\'tree-scroll\');',
    '      if (!scroll) return;',
    '      var breadcrumb = document.getElementById(\'tree-breadcrumb\');',
    '      var rootId = document.getElementById(\'tree-wrap\').getAttribute(\'data-tree-root\');',
    '      var focusId = rootId;',
    '      var path = []; // ids from root -> focused node',
    '',
    '      function byId(id) {',
    '        return scroll.querySelector(\'.tree-node[data-tree-id="\' + id + \'"]\');',
    '      }',
    '      function ancestorsOf(id) {',
    '        var out = []; var n = byId(id);',
    '        while (n && n !== scroll) {',
    '          var p = n.parentElement; while (p && !p.classList.contains(\'tree-node\')) p = p.parentElement;',
    '          if (!p) break;',
    '          out.unshift(p.getAttribute(\'data-tree-id\'));',
    '          n = p;',
    '        }',
    '        return out;',
    '      }',
    '      function renderBreadcrumb() {',
    '        var html = \'\';',
    '        for (var i = 0; i < path.length; i++) {',
    '          var id = path[i];',
    '          var node = byId(id);',
    '          if (!node) continue;',
    '          var label = node.querySelector(\'.tree-title\').textContent;',
    '          var cls = \'crumb\' + (i === path.length - 1 ? \' current\' : \'\');',
    '          var action = (i === path.length - 1) ? \'\' : \' data-tree-jump="\' + id + \'"\';',
    '          html += (i > 0 ? \'<span class="sep">/</span>\' : \'\') +',
    '                  \'<button type="button" class="\' + cls + \'"\' + action + \'>\' + label + \'</button>\';',
    '        }',
    '        breadcrumb.innerHTML = html;',
    '      }',
    '      function zoomTo(id) {',
    '        path = ancestorsOf(id);',
    '        scroll.querySelectorAll(\'.tree-node.zoomed\').forEach(function(n) { n.classList.remove(\'zoomed\'); });',
    '        var node = byId(id);',
    '        if (node) node.classList.add(\'zoomed\');',
    '        scroll.querySelectorAll(\'.tree-node.expanded\').forEach(function(n) { n.classList.remove(\'expanded\'); });',
    '        for (var i = 0; i < path.length; i++) { byId(path[i]).classList.add(\'expanded\'); }',
    '        var focusNode = byId(focusId);',
    '        if (focusNode && focusNode.querySelector(\'.tree-children\')) focusNode.classList.add(\'expanded\');',
    '        renderBreadcrumb();',
    '        if (node) node.scrollIntoView({ block: \'center\', inline: \'center\', behavior: \'smooth\' });',
    '      }',
    '',
    '      scroll.addEventListener(\'click\', function(ev) {',
    '        var tog = ev.target.closest(\'[data-tree-toggle]\');',
    '        if (tog) {',
    '          ev.stopPropagation();',
    '          var id = tog.getAttribute(\'data-tree-toggle\');',
    '          var n = byId(id);',
    '          if (n) n.classList.toggle(\'expanded\');',
    '          return;',
    '        }',
    '        var zoom = ev.target.closest(\'[data-tree-zoom]\');',
    '        if (zoom) {',
    '          ev.preventDefault();',
    '          focusId = zoom.getAttribute(\'data-tree-zoom\');',
    '          zoomTo(focusId);',
    '          return;',
    '        }',
    '        var jump = ev.target.closest(\'[data-tree-jump]\');',
    '        if (jump) {',
    '          focusId = jump.getAttribute(\'data-tree-jump\');',
    '          zoomTo(focusId);',
    '        }',
    '      });',
    '',
    '      document.addEventListener(\'keydown\', function(ev) {',
    '        if (ev.target && /input|textarea|select/i.test(ev.target.tagName || \'\')) return;',
    '        var treeActive = document.getElementById(\'tree\').classList.contains(\'active\');',
    '        if (!treeActive) return;',
    '        if (ev.key === \'Escape\' && path.length > 1) {',
    '          path.pop(); focusId = path[path.length - 1]; zoomTo(focusId);',
    '        } else if (ev.key === \'+\') {',
    '          scroll.querySelectorAll(\'.tree-node\').forEach(function(n) {',
    '            if (n.querySelector(\'.tree-children\')) n.classList.add(\'expanded\');',
    '          });',
    '        } else if (ev.key === \'-\') {',
    '          scroll.querySelectorAll(\'.tree-node\').forEach(function(n) { n.classList.remove(\'expanded\'); });',
    '        }',
    '      });',
    '',
    '      path = [rootId];',
    '      renderBreadcrumb();',
    '    })();',
    '  </script>',
    '</body>',
    '</html>'
  ].join('\n');
}
