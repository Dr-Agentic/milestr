import type { DashboardData, KPI, Task } from '../types';

/* eslint-disable max-lines */

// --- Utilities ---

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Depth helper: walk parent chain to compute how deep a task sits.
// Recursion-safe via iteration; capped at MAX_DEPTH so badge rendering stays bounded.
export function depthOf(taskId: string, data: DashboardData): number {
  const tasks = data.tasks;
  let d = 0;
  let cur: string | null | undefined = tasks[taskId]?.parent;
  const seen = new Set<string>();
  while (cur && !seen.has(cur) && d < 64) {
    seen.add(cur);
    d += 1;
    cur = tasks[cur]?.parent ?? null;
  }
  return d;
}

// Status → accent color. Used everywhere a status needs a visual.
function statusBarColor(status: string): string {
  switch (status) {
    case 'done': return 'var(--status-done)';
    case 'ongoing': return 'var(--status-ongoing)';
    case 'analyzing': return 'var(--status-analyzing)';
    case 'blocked': return 'var(--status-blocked)';
    case 'not_started':
    default: return 'var(--status-not-started)';
  }
}

// Logarithmic depth badge: dots grow with depth but cap at 5.
function depthBadge(depth: number): string {
  if (depth <= 0) return '';
  const total = Math.min(5, Math.max(1, Math.ceil(Math.log2(depth + 1))));
  const filled = Math.min(5, depth);
  const dots: string[] = [];
  for (let i = 0; i < total; i++) {
    dots.push(i < filled ? '●' : '○');
  }
  const extra = depth > 5 ? `+${depth - 5}` : '';
  return `<span class="depth-badge" title="depth ${depth}" aria-label="depth ${depth}">${dots.join('')}${extra ? ` <span class="depth-extra">${extra}</span>` : ''}</span>`;
}

// Border thickness scales 2→6px from depth 0→4, caps at 6px for unlimited depth.
function depthBorder(depth: number): string {
  const px = Math.min(6, 2 + depth);
  return `${px}px`;
}

// --- Small renderers ---

function taskRow(task: Task, depth: number): string {
  const dBadge = depthBadge(depth);
  return [
    '      <div class="task-row" data-task-id="' + esc(task.id) + '" data-depth="' + depth + '">',
    '        <span class="icon">' + esc(task.icon) + '</span>',
    '        <span class="id">' + esc(task.id) + '</span>',
    '        <span class="title" style="padding-inline-start:' + (depth * 16) + 'px">' + esc(task.title) + (dBadge ? ' ' + dBadge : '') + '</span>',
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

// --- Tree view (issue #6 + v1.3.0 LTR fix) ---
//
// LTR hierarchical tree (root on the left; children branch to the right).
// Each node starts collapsed showing summary (icon, title, progress, status,
// depth badge). Clicking the card body toggles expand/collapse. Clicking
// the title zooms in. Clicking the depth badge opens the detail drawer.
//
// State lives in module-scope closures inside `exportDashboardHtml` so the
// function stays pure and the inline `<script>` can wire up handlers by id.

interface TreeNode {
  task: Task;
  children: TreeNode[];
  depth: number;
}

function buildTree(data: DashboardData): TreeNode | null {
  const tasks = data.tasks;
  const rootId = data.root.id;
  if (!tasks[rootId]) return null;

  function build(id: string, depth: number): TreeNode | null {
    const task = tasks[id];
    if (!task) return null;
    const kids = (task.children || [])
      .map(function (cid) { return build(cid, depth + 1); })
      .filter(function (n): n is TreeNode { return n !== null; });
    return { task: task, children: kids, depth };
  }

  return build(rootId, 0);
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
  const dBadge = depthBadge(node.depth);
  const log = (t.activityLog && t.activityLog.length > 0)
    ? '<ul class="tree-log">' +
      t.activityLog.slice(0, 5).map(function (e) {
        const who = e.agent ? esc(e.agent) + ' · ' : '';
        return '<li><span class="tree-log-meta">' + who + esc(new Date(e.date).toLocaleString()) + '</span> ' + esc(e.note) + '</li>';
      }).join('') +
    '</ul>'
    : '';
  return [
    '<div class="tree-node ' + esc(t.status) + esc(expandedCls) + '" data-tree-id="' + esc(t.id) + '" data-depth="' + node.depth + '">',
    '  <div class="tree-card" style="border-inline-start: ' + depthBorder(node.depth) + ' solid ' + accent + '">',
    '    <button type="button" class="tree-toggle" data-tree-toggle="' + esc(t.id) + '" aria-label="Toggle ' + esc(t.title) + '">' + (hasChildren ? '▸' : '·') + '</button>',
    '    <span class="tree-icon">' + esc(t.icon) + '</span>',
    '    <div class="tree-body">',
    '      <div class="tree-title-row">',
    '        <button type="button" class="tree-title" data-tree-zoom="' + esc(t.id) + '">' + esc(t.title) + '</button>',
    (dBadge ? '        ' + dBadge : ''),
    '      </div>',
    '      <div class="tree-meta">',
    '        <span class="tree-status ' + esc(t.status) + '">' + esc(t.status.replace('_', ' ')) + '</span>',
    '        <span class="tree-progress">' + t.progress + '%</span>',
    '        <button type="button" class="tree-detail-btn" data-detail-open="' + esc(t.id) + '" aria-label="Open detail for ' + esc(t.title) + '">Details</button>',
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
    '    <span><kbd>Details</kbd> open drawer</span>',
    '    <span><kbd>Esc</kbd> zoom out / close drawer</span>',
    '    <span><kbd>+</kbd>/<kbd>-</kbd> expand/collapse all</span>',
    '  </div>',
    '</div>'
  ].join('\n');
}

// --- Kanban view (v1.3.0: depth indicator) ---

function kanbanCol(status: string, items: { task: Task; depth: number }[]): string {
  const itemsHtml = items.map(function (entry) {
    const task = entry.task;
    const depth = entry.depth;
    const progressClass = task.status === 'done' ? ' done' : '';
    return [
      '        <div class="kanban-card" data-task-id="' + esc(task.id) + '" data-depth="' + depth + '" data-detail-open="' + esc(task.id) + '" style="border-inline-start:' + depthBorder(depth) + ' solid ' + statusBarColor(task.status) + '">',
      '          <div class="kanban-card-row">',
      '            <span class="icon">' + esc(task.icon) + '</span>',
      '            <h4>' + esc(task.title) + '</h4>',
      depthBadge(depth),
      '          </div>',
      '          <div class="meta">' + esc(task.id) + ' · ' + esc(task.parent ?? 'root') + '</div>',
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

// --- List view (v1.3.0: full depth + virtualization) ---
//
// Renders an HTML string that contains EVERY task as a flat row with a
// `data-depth` attribute and a left padding proportional to depth. The
// client-side JS hides rows whose depth is collapsed. The HTML itself is
// one chunk (no SSR virtualization) so search engines and static export
// see the full data; client-side virtualization kicks in at 200+ rows to
// keep scroll cheap.

function renderHierarchicalList(data: DashboardData): string {
  const tasks = data.tasks;
  const order: { id: string; depth: number }[] = [];
  const visited = new Set<string>();
  const rootId = data.root.id;

  function visit(id: string, depth: number): void {
    if (visited.has(id)) return;
    visited.add(id);
    const t = tasks[id];
    if (!t) return;
    order.push({ id, depth });
    for (const cid of t.children || []) visit(cid, depth + 1);
  }

  visit(rootId, 0);

  const rows = order.map(function (e) {
    const task = tasks[e.id];
    if (!task) return '';
    return taskRow(task, e.depth);
  }).filter(function (r) { return r !== ''; });

  return rows.join('\n');
}

// --- Timeline view (v1.3.0: achieved vs upcoming, sequence fallback) ---
//
// If ANY task has a dueDate we use date-axis; otherwise fall back to a
// sequence-axis (T1, T2, T3, ...) derived from DFS visit order. Two swim
// lanes: achieved (status=done OR all descendants done) and upcoming
// (everything else, sorted by status priority then sequence). Each task
// gets a horizontal bar with width proportional to subtree size.

interface TimelineEntry {
  task: Task;
  depth: number;
  axisValue: number;   // ms since epoch OR sequence index
  axisKind: 'date' | 'sequence';
  isAchieved: boolean;
  subtreeSize: number;
}

function computeSubtreeSize(taskId: string, tasks: Record<string, Task>): number {
  const t = tasks[taskId];
  if (!t) return 0;
  let size = 1;
  for (const cid of t.children || []) size += computeSubtreeSize(cid, tasks);
  return size;
}

function isAchieved(taskId: string, tasks: Record<string, Task>): boolean {
  const t = tasks[taskId];
  if (!t) return false;
  if (t.children.length === 0) return t.status === 'done';
  // All descendants done → achieved
  for (const cid of t.children) {
    if (!isAchieved(cid, tasks)) return false;
  }
  return true;
}

function renderTimelineView(data: DashboardData): string {
  const tasks = data.tasks;
  const rootId = data.root.id;
  if (!tasks[rootId]) return '<div class="timeline-empty">No tasks to render.</div>';

  // DFS collect with sequence fallback
  const visited = new Set<string>();
  const entries: TimelineEntry[] = [];
  let seqCounter = 0;
  const dateRe = /^\d{4}-\d{2}-\d{2}/;
  let axisKind: 'date' | 'sequence' = 'sequence' as 'date' | 'sequence';

  function visit(id: string, depth: number): void {
    if (visited.has(id)) return;
    visited.add(id);
    const t = tasks[id];
    if (!t) return;
    const due = t.dueDate && dateRe.test(t.dueDate) ? Date.parse(t.dueDate) : null;
    if (due !== null) axisKind = 'date';
    // If the axis is in date mode but THIS task has no dueDate, anchor it at
    // the dataset's earliest date minus an increasing day offset. Using a real
    // date keeps the axis range stable; pinning to epoch 0 (or a raw 0) would
    // explode the range and visually erase every other bar.
    let value: number;
    if (axisKind === 'date' && due === null) {
      // First-pass placeholder; will be normalized after the visit pass so all
      // undated tasks cluster before the earliest dated task.
      value = 0;
    } else {
      value = due ?? seqCounter;
    }
    entries.push({
      task: t,
      depth,
      axisValue: value,
      axisKind: axisKind,
      isAchieved: isAchieved(id, tasks),
      subtreeSize: computeSubtreeSize(id, tasks)
    });
    seqCounter += 1;
    for (const cid of t.children || []) visit(cid, depth + 1);
  }

  visit(rootId, 0);

  // Normalize undated entries (in date mode) to a sensible position before
  // the earliest dated task. Without this pass, those entries sit at literal
  // 0 which is the Unix epoch — the date axis would span 1969 → 2026 and
  // every dated task would collapse to ~100%.
  if (axisKind === 'date') {
    const dated = entries.filter((e) => e.task.dueDate && dateRe.test(e.task.dueDate)).map((e) => e.axisValue);
    if (dated.length > 0) {
      const earliest = Math.min.apply(null, dated);
      const dayMs = 86_400_000;
      let undatedIdx = 0;
      for (const e of entries) {
        if (!(e.task.dueDate && dateRe.test(e.task.dueDate))) {
          undatedIdx += 1;
          e.axisValue = earliest - undatedIdx * dayMs;
        }
      }
    }
  }

  // Sort by axisValue within each lane
  const achieved = entries.filter(function (e) { return e.isAchieved; }).sort(function (a, b) { return a.axisValue - b.axisValue; });
  const upcoming = entries.filter(function (e) { return !e.isAchieved; }).sort(function (a, b) {
    const order = { blocked: 0, ongoing: 1, analyzing: 2, not_started: 3 } as Record<string, number>;
    const sa = order[a.task.status] ?? 4;
    const sb = order[b.task.status] ?? 4;
    if (sa !== sb) return sa - sb;
    return a.axisValue - b.axisValue;
  });

  // Compute axis range
  const values = entries.map(function (e) { return e.axisValue; });
  const minV = values.length ? Math.min.apply(null, values) : 0;
  const maxV = values.length ? Math.max.apply(null, values) : 1;
  const range = Math.max(1, maxV - minV);

  function pct(v: number): number {
    if (axisKind === 'sequence') return entries.length <= 1 ? 0 : ((v - minV) / (entries.length - 1)) * 100;
    return ((v - minV) / range) * 100;
  }

  const axisLabel = axisKind === 'date'
    ? new Date(minV).toLocaleDateString() + ' → ' + new Date(maxV).toLocaleDateString()
    : 'Sequence (' + entries.length + ' tasks)';

  function renderBar(e: TimelineEntry, index: number, laneEntries: TimelineEntry[]): string {
    // Bars partition the axis into non-overlapping slices. Each bar's width is
    // the gap between this axisValue and the next entry's axisValue (or the
    // axis end for the last entry). This guarantees no overlap regardless of
    // how many entries share the same axis value. A minimum slice width of 8%
    // ensures very tight clusters (e.g. two tasks dated the same day) stay
    // readable; bars that would otherwise be skinnier get padded so adjacent
    // bars never visually overlap.
    const next = laneEntries[index + 1];
    const nextValue = next ? next.axisValue : maxV;
    const span = Math.max(1, nextValue - e.axisValue);
    const rawWidth = (span / range) * 100;
    const width = Math.max(8, rawWidth);
    const left = pct(e.axisValue);
    return [
      '<div class="timeline-bar ' + esc(e.task.status) + '" data-task-id="' + esc(e.task.id) + '" data-detail-open="' + esc(e.task.id) + '" style="left:' + left.toFixed(2) + '%;width:' + width.toFixed(2) + '%;margin-top:' + (e.depth * 22) + 'px">',
      '  <span class="timeline-bar-icon">' + esc(e.task.icon) + '</span>',
      '  <span class="timeline-bar-title">' + esc(e.task.title) + '</span>',
      '  <span class="timeline-bar-meta">' + e.task.progress + '%</span>',
      '</div>'
    ].join('\n');
  }

  return [
    '<div class="timeline-v2" id="timeline-v2">',
    '  <div class="timeline-axis"><span>' + esc(axisLabel) + '</span></div>',
    '  <div class="timeline-lane timeline-lane-achieved">',
    '    <div class="timeline-lane-label">Achieved (' + achieved.length + ')</div>',
    '    <div class="timeline-lane-track">',
    achieved.map(function (e, i) { return renderBar(e, i, achieved); }).join('\n'),
    '    </div>',
    '  </div>',
    '  <div class="timeline-lane timeline-lane-upcoming">',
    '    <div class="timeline-lane-label">Upcoming (' + upcoming.length + ')</div>',
    '    <div class="timeline-lane-track">',
    upcoming.map(function (e, i) { return renderBar(e, i, upcoming); }).join('\n'),
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');
}

// --- Detail drawer (v1.3.0: click-to-expand full task details) ---
//
// Renders a single drawer DOM node with content swapped in by JS. The
// function returns the empty drawer; openDetail(id) populates it from
// the embedded DATA blob.

function renderDetailDrawer(data: DashboardData): string {
  // Embed tasks and KPIs as JSON so the client can hydrate without re-fetch.
  const tasksBlob = JSON.stringify(data.tasks).replace(/</g, '\\u003c');
  return [
    '<aside class="detail-drawer" id="detail-drawer" aria-hidden="true" data-state="closed">',
    '  <div class="detail-drawer-backdrop" data-detail-close></div>',
    '  <div class="detail-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="detail-drawer-title">',
    '    <header class="detail-drawer-header">',
    '      <span class="detail-drawer-icon" id="detail-drawer-icon"></span>',
    '      <h2 class="detail-drawer-title" id="detail-drawer-title"></h2>',
    '      <button type="button" class="detail-drawer-close" data-detail-close aria-label="Close detail">×</button>',
    '    </header>',
    '    <div class="detail-drawer-body" id="detail-drawer-body"></div>',
    '  </div>',
    '</aside>',
    '<script type="application/json" id="detail-data">' + tasksBlob + '</script>'
  ].join('\n');
}

// --- CSS palette: light default, dark opt-in via [data-theme="dark"] ---

const PALETTE_CSS = `
:root {
  /* Light theme (default) */
  --bg-page: #fafbfc;
  --surface-1: #ffffff;
  --surface-2: #f1f5f9;
  --surface-3: #e2e8f0;
  --border: #e2e8f0;
  --border-strong: #cbd5e1;
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --accent: #3b82f6;
  --accent-hover: #2563eb;
  --status-not-started: #64748b;
  --status-analyzing: #f59e0b;
  --status-ongoing: #3b82f6;
  --status-done: #22c55e;
  --status-blocked: #ef4444;
  --tab-bg: #f1f5f9;
  --tab-bg-hover: #e2e8f0;
  --tab-active-bg: #3b82f6;
  --tab-active-text: #ffffff;
  --kbd-bg: #f8fafc;
  --kbd-border: #cbd5e1;
  --shadow-card: 0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06);
  --shadow-drawer: -8px 0 24px rgba(15, 23, 42, 0.12);
  --header-text: #0f172a;
  --header-meta: #64748b;
  --depth-dot-filled: #3b82f6;
  --depth-dot-empty: #cbd5e1;
}
:root[data-theme="dark"] {
  --bg-page: #0f172a;
  --surface-1: #1e293b;
  --surface-2: #0f172a;
  --surface-3: #334155;
  --border: #334155;
  --border-strong: #475569;
  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --accent: #3b82f6;
  --accent-hover: #60a5fa;
  --status-not-started: #64748b;
  --status-analyzing: #f59e0b;
  --status-ongoing: #60a5fa;
  --status-done: #4ade80;
  --status-blocked: #f87171;
  --tab-bg: #1e293b;
  --tab-bg-hover: #334155;
  --tab-active-bg: #3b82f6;
  --tab-active-text: #ffffff;
  --kbd-bg: #0f172a;
  --kbd-border: #334155;
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.2), 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-drawer: -8px 0 24px rgba(0, 0, 0, 0.5);
  --header-text: #f1f5f9;
  --header-meta: #94a3b8;
  --depth-dot-filled: #60a5fa;
  --depth-dot-empty: #475569;
}
`;

// --- Main export ---

export function exportDashboardHtml(data: DashboardData): string {
  const tasks = Object.values(data.tasks);
  const root = data.tasks.ROOT;
  const milestones = tasks.filter(function (task) { return task.type === 'milestone'; });
  const kpis = data.kpis ? Object.values(data.kpis) : [];

  function withDepth(items: Task[]): { task: Task; depth: number }[] {
    return items.map(function (t) { return { task: t, depth: depthOf(t.id, data) }; });
  }

  const kanbanGroups = {
    not_started: withDepth(tasks.filter(function (task) { return task.status === 'not_started'; })),
    analyzing: withDepth(tasks.filter(function (task) { return task.status === 'analyzing'; })),
    ongoing: withDepth(tasks.filter(function (task) { return task.status === 'ongoing'; })),
    done: withDepth(tasks.filter(function (task) { return task.status === 'done'; })),
    blocked: withDepth(tasks.filter(function (task) { return task.status === 'blocked'; }))
  };

  // Sort within each kanban column: depth ASC (parents above children), then status priority
  function sortByDepth(items: { task: Task; depth: number }[]): { task: Task; depth: number }[] {
    return items.slice().sort(function (a, b) {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.task.title.localeCompare(b.task.title);
    });
  }
  for (const k of Object.keys(kanbanGroups) as Array<keyof typeof kanbanGroups>) {
    kanbanGroups[k] = sortByDepth(kanbanGroups[k]);
  }

  const kpiGridHtml = kpis.length > 0
    ? '<div class="kpi-grid">' + kpis.map(kpiCard).join('\n') + '\n    </div>'
    : '<div class="kpi-empty">No KPIs configured yet. Add them via:\n  npm run dev -- --agent your-agent create-kpi --id my-kpi --title "Sign-ups" --value 0 --unit users</div>';

  const timelineMilestonesHtml = milestones.map(milestoneNode).join('\n');

  const kanbanColsHtml = Object.entries(kanbanGroups).map(function (entry) {
    return kanbanCol(entry[0], entry[1]);
  }).join('\n');

  const listTasksHtml = renderHierarchicalList(data);

  const treeHtml = renderTreeView(data);
  const timelineV2Html = renderTimelineView(data);
  const drawerHtml = renderDetailDrawer(data);

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
    PALETTE_CSS,
    '    * { margin: 0; padding: 0; box-sizing: border-box; }',
    '    body { font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; background: var(--bg-page); color: var(--text-primary); min-height: 100vh; padding: 24px; transition: background 0.2s, color 0.2s; }',
    '    .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 32px; flex-wrap: wrap; }',
    '    .header h1 { font-size: 28px; margin-bottom: 4px; color: var(--header-text); }',
    '    .header .meta { color: var(--header-meta); font-size: 14px; }',
    '    .theme-toggle { background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; cursor: pointer; color: var(--text-primary); font-size: 13px; }',
    '    .theme-toggle:hover { background: var(--surface-3); }',
    '',
    '    .tabs { display: flex; gap: 8px; margin-bottom: 24px; justify-content: center; flex-wrap: wrap; }',
    '    .tab { padding: 10px 20px; background: var(--tab-bg); border: 1px solid var(--border); border-radius: 8px; color: var(--text-secondary); cursor: pointer; font-size: 14px; transition: all 0.2s; }',
    '    .tab:hover { background: var(--tab-bg-hover); }',
    '    .tab.active { background: var(--tab-active-bg); color: var(--tab-active-text); border-color: var(--tab-active-bg); }',
    '',
    '    .view { display: none; }',
    '    .view.active { display: block; }',
    '',
    '    /* KPI Section */',
    '    .kpi-section { margin-bottom: 40px; }',
    '    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }',
    '    .kpi-card { background: var(--surface-1); border-radius: 12px; padding: 20px; display: flex; align-items: flex-start; gap: 16px; border: 1px solid var(--border); box-shadow: var(--shadow-card); }',
    '    .kpi-card .kpi-icon { font-size: 28px; flex-shrink: 0; }',
    '    .kpi-card .kpi-body { flex: 1; min-width: 0; }',
    '    .kpi-card .kpi-title { font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; font-weight: 500; }',
    '    .kpi-card .kpi-value-row { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }',
    '    .kpi-card .kpi-value { font-size: 28px; font-weight: 700; color: var(--text-primary); }',
    '    .kpi-card .kpi-unit { font-size: 14px; color: var(--text-muted); }',
    '    .kpi-card .kpi-trend { font-size: 16px; font-weight: 600; margin-left: 4px; }',
    '    .kpi-card .kpi-trend.trend-up { color: var(--status-done); }',
    '    .kpi-card .kpi-trend.trend-down { color: var(--status-blocked); }',
    '    .kpi-card .kpi-trend.trend-neutral { color: var(--text-muted); }',
    '    .kpi-card .kpi-source { display: block; font-size: 11px; color: var(--text-muted); margin-top: 6px; }',
    '    .kpi-card .kpi-updated { font-size: 11px; color: var(--text-muted); margin-top: 8px; }',
    '    .kpi-empty { text-align: center; color: var(--text-muted); padding: 40px; font-size: 14px; }',
    '',
    '    /* Timeline (v1.0 milestone view) */',
    '    .timeline { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding: 24px 0; overflow-x: auto; }',
    '    .milestone-node { display: flex; flex-direction: column; align-items: center; min-width: 140px; position: relative; }',
    '    .milestone-node:not(:last-child)::after { content: \'\'; position: absolute; top: 24px; left: calc(50% + 30px); width: calc(100% - 60px); height: 3px; background: var(--border); }',
    '    .milestone-node.completed:not(:last-child)::after { background: var(--status-done); }',
    '    .milestone-icon { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; background: var(--surface-1); border: 3px solid var(--border); z-index: 1; }',
    '    .milestone-node.ongoing .milestone-icon { border-color: var(--status-ongoing); box-shadow: 0 0 20px rgba(59, 130, 246, 0.4); }',
    '    .milestone-node.done .milestone-icon { border-color: var(--status-done); background: var(--status-done); }',
    '    .milestone-info { margin-top: 12px; text-align: center; }',
    '    .milestone-info h3 { font-size: 14px; margin-bottom: 4px; color: var(--text-primary); }',
    '    .milestone-info .progress-bar { width: 80px; height: 6px; background: var(--surface-3); border-radius: 3px; margin: 8px auto; overflow: hidden; }',
    '    .milestone-info .progress-fill { height: 100%; background: var(--status-ongoing); border-radius: 3px; transition: width 0.3s; }',
    '    .milestone-info .progress-fill.done { background: var(--status-done); }',
    '    .milestone-info .due { font-size: 12px; color: var(--text-muted); }',
    '',
    '    /* Timeline v1.3.0 (achieved vs upcoming) */',
    '    .timeline-v2 { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 16px; box-shadow: var(--shadow-card); overflow-x: auto; }',
    '    .timeline-axis { font-size: 12px; color: var(--text-muted); margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }',
    '    .timeline-lane { position: relative; min-height: 80px; padding: 16px 0; border-bottom: 1px solid var(--border); }',
    '    .timeline-lane:last-child { border-bottom: none; }',
    '    .timeline-lane-label { position: absolute; top: 8px; left: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); }',
    '    .timeline-lane-track { position: relative; min-height: 60px; margin-top: 24px; min-width: 1200px; }',
    '    .timeline-bar { position: absolute; height: 22px; border-radius: 4px; display: flex; align-items: center; gap: 6px; padding: 0 8px; font-size: 11px; color: white; cursor: pointer; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.1); transition: transform 0.1s; min-width: 32px; }',
    '    .timeline-bar:hover { transform: translateY(-1px); box-shadow: 0 2px 4px rgba(0,0,0,0.15); }',
    '    .timeline-bar.done { background: var(--status-done); }',
    '    .timeline-bar.ongoing { background: var(--status-ongoing); }',
    '    .timeline-bar.analyzing { background: var(--status-analyzing); }',
    '    .timeline-bar.blocked { background: var(--status-blocked); }',
    '    .timeline-bar.not_started { background: var(--status-not-started); }',
    '    .timeline-bar-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }',
    '    .timeline-bar-meta { font-family: monospace; opacity: 0.85; }',
    '    .timeline-empty { text-align: center; color: var(--text-muted); padding: 40px; font-size: 14px; }',
    '',
    '    /* Kanban */',
    '    .kanban { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }',
    '    .kanban-col { background: var(--surface-1); border-radius: 12px; padding: 16px; min-height: 400px; border: 1px solid var(--border); box-shadow: var(--shadow-card); }',
    '    .kanban-col h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid; }',
    '    .kanban-col.not_started h2 { border-color: var(--status-not-started); color: var(--text-secondary); }',
    '    .kanban-col.analyzing h2 { border-color: var(--status-analyzing); color: var(--status-analyzing); }',
    '    .kanban-col.ongoing h2 { border-color: var(--status-ongoing); color: var(--status-ongoing); }',
    '    .kanban-col.done h2 { border-color: var(--status-done); color: var(--status-done); }',
    '    .kanban-col.blocked h2 { border-color: var(--status-blocked); color: var(--status-blocked); }',
    '',
    '    .kanban-card { background: var(--surface-2); border-radius: 8px; padding: 12px; margin-bottom: 12px; cursor: pointer; transition: transform 0.1s; }',
    '    .kanban-card:hover { transform: translateY(-1px); }',
    '    .kanban-card-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }',
    '    .kanban-card .icon { font-size: 16px; }',
    '    .kanban-card h4 { font-size: 13px; flex: 1; color: var(--text-primary); }',
    '    .kanban-card .meta { font-size: 11px; color: var(--text-muted); }',
    '    .kanban-card .progress { height: 4px; background: var(--surface-3); border-radius: 2px; margin-top: 8px; }',
    '    .kanban-card .progress-fill { height: 100%; background: var(--status-ongoing); border-radius: 2px; }',
    '    .kanban-card .progress-fill.done { background: var(--status-done); }',
    '',
    '    /* Depth badge */',
    '    .depth-badge { display: inline-flex; gap: 2px; font-size: 10px; color: var(--depth-dot-empty); align-items: center; }',
    '    .depth-badge > span:not(.depth-extra) { color: var(--depth-dot-filled); }',
    '    .depth-extra { color: var(--text-muted); font-size: 9px; margin-inline-start: 2px; }',
    '',
    '    /* Task List (hierarchical, v1.3.0) */',
    '    .task-list { display: flex; flex-direction: column; gap: 6px; }',
    '    .task-row { display: flex; align-items: center; gap: 12px; background: var(--surface-1); padding: 10px 16px; border-radius: 8px; border: 1px solid var(--border); cursor: pointer; transition: background 0.1s; }',
    '    .task-row:hover { background: var(--surface-2); }',
    '    .task-row .icon { font-size: 18px; }',
    '    .task-row .id { font-family: monospace; color: var(--text-muted); font-size: 12px; width: 80px; }',
    '    .task-row .title { flex: 1; font-size: 14px; color: var(--text-primary); }',
    '    .task-row .status { font-size: 12px; padding: 4px 10px; border-radius: 12px; }',
    '    .task-row .status.not_started { background: var(--surface-3); color: var(--text-secondary); }',
    '    .task-row .status.analyzing { background: rgba(245, 158, 11, 0.15); color: var(--status-analyzing); }',
    '    .task-row .status.ongoing { background: rgba(59, 130, 246, 0.15); color: var(--status-ongoing); }',
    '    .task-row .status.done { background: rgba(34, 197, 94, 0.15); color: var(--status-done); }',
    '    .task-row .status.blocked { background: rgba(239, 68, 68, 0.15); color: var(--status-blocked); }',
    '    .task-row .progress { width: 80px; font-size: 12px; color: var(--text-muted); }',
    '    .task-row .parent { font-size: 11px; color: var(--text-muted); }',
    '',
    '    .section { margin-bottom: 32px; }',
    '    .section h2 { font-size: 18px; margin-bottom: 16px; color: var(--text-secondary); }',
    '',
    '    /* Tree — LTR (v1.3.0 fix; was RTL in #6) */',
    '    .tree-wrap { background: var(--surface-1); border-radius: 12px; padding: 16px; border: 1px solid var(--border); box-shadow: var(--shadow-card); }',
    '    .tree-breadcrumb { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 13px; color: var(--text-secondary); margin-bottom: 12px; min-height: 24px; }',
    '    .tree-breadcrumb .crumb { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; cursor: pointer; color: var(--text-primary); font-family: inherit; font-size: 12px; }',
    '    .tree-breadcrumb .crumb:hover { background: var(--surface-3); }',
    '    .tree-breadcrumb .crumb.current { background: var(--tab-active-bg); color: var(--tab-active-text); border-color: var(--tab-active-bg); cursor: default; }',
    '    .tree-breadcrumb .sep { color: var(--text-muted); }',
    '    .tree-scroll { overflow: auto; max-height: 70vh; padding: 8px 0; }',
    '    .tree-root, .tree-children { list-style: none; margin: 0; padding: 0; }',
    '    .tree-children { display: none; padding-inline-start: 20px; margin-top: 8px; border-inline-start: 1px dashed var(--border); }',
    '    .tree-node.expanded > .tree-children { display: block; }',
    '    .tree-node.zoomed > .tree-card { box-shadow: 0 0 0 2px var(--accent); }',
    '    .tree-card { background: var(--surface-2); border-radius: 8px; padding: 10px 12px; display: flex; gap: 10px; align-items: flex-start; margin: 6px 0; min-width: 220px; max-width: 320px; }',
    '    .tree-toggle { background: transparent; border: none; color: var(--text-secondary); cursor: pointer; font-size: 14px; padding: 0 4px; line-height: 1; }',
    '    .tree-toggle:hover { color: var(--text-primary); }',
    '    .tree-icon { font-size: 18px; line-height: 1.4; }',
    '    .tree-body { flex: 1; min-width: 0; }',
    '    .tree-title-row { display: flex; align-items: center; gap: 6px; }',
    '    .tree-title { background: transparent; border: none; color: var(--text-primary); font-size: 14px; font-weight: 600; cursor: pointer; padding: 0; text-align: start; font-family: inherit; flex: 1; }',
    '    .tree-title:hover { color: var(--accent-hover); }',
    '    .tree-detail-btn { background: transparent; border: 1px solid var(--border); border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 11px; color: var(--text-secondary); }',
    '    .tree-detail-btn:hover { background: var(--surface-3); color: var(--text-primary); }',
    '    .tree-meta { display: flex; gap: 8px; align-items: center; font-size: 11px; color: var(--text-secondary); margin-top: 4px; flex-wrap: wrap; }',
    '    .tree-status { padding: 2px 8px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px; }',
    '    .tree-status.not_started { background: var(--surface-3); color: var(--text-secondary); }',
    '    .tree-status.analyzing { background: rgba(245, 158, 11, 0.15); color: var(--status-analyzing); }',
    '    .tree-status.ongoing { background: rgba(59, 130, 246, 0.15); color: var(--status-ongoing); }',
    '    .tree-status.done { background: rgba(34, 197, 94, 0.15); color: var(--status-done); }',
    '    .tree-status.blocked { background: rgba(239, 68, 68, 0.15); color: var(--status-blocked); }',
    '    .tree-progress { font-family: monospace; }',
    '    .tree-due { font-size: 11px; color: var(--text-muted); }',
    '    .tree-subtitle { font-size: 12px; color: var(--text-secondary); margin-top: 6px; line-height: 1.4; }',
    '    .tree-log { list-style: none; margin: 8px 0 0; padding: 0; border-top: 1px solid var(--border); padding-top: 6px; }',
    '    .tree-log li { font-size: 11px; color: var(--text-primary); padding: 3px 0; line-height: 1.4; }',
    '    .tree-log-meta { color: var(--text-muted); font-size: 10px; margin-inline-end: 4px; }',
    '    .tree-empty { text-align: center; color: var(--text-muted); padding: 40px; font-size: 14px; }',
    '    .tree-help { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 11px; }',
    '    .tree-help kbd { background: var(--kbd-bg); border: 1px solid var(--kbd-border); border-radius: 4px; padding: 1px 6px; font-family: monospace; font-size: 10px; color: var(--text-primary); }',
    '',
    '    /* Detail drawer */',
    '    .detail-drawer { position: fixed; inset: 0; pointer-events: none; z-index: 50; }',
    '    .detail-drawer[data-state="open"] { pointer-events: auto; }',
    '    .detail-drawer-backdrop { position: absolute; inset: 0; background: rgba(15, 23, 42, 0.4); opacity: 0; transition: opacity 0.2s; }',
    '    .detail-drawer[data-state="open"] .detail-drawer-backdrop { opacity: 1; }',
    '    .detail-drawer-panel { position: absolute; top: 0; right: 0; bottom: 0; width: min(420px, 100vw); background: var(--surface-1); box-shadow: var(--shadow-drawer); transform: translateX(100%); transition: transform 0.2s; display: flex; flex-direction: column; }',
    '    .detail-drawer[data-state="open"] .detail-drawer-panel { transform: translateX(0); }',
    '    .detail-drawer-header { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--border); }',
    '    .detail-drawer-icon { font-size: 22px; }',
    '    .detail-drawer-title { flex: 1; font-size: 18px; font-weight: 600; color: var(--text-primary); }',
    '    .detail-drawer-close { background: transparent; border: none; color: var(--text-secondary); font-size: 22px; cursor: pointer; padding: 0 8px; line-height: 1; }',
    '    .detail-drawer-close:hover { color: var(--text-primary); }',
    '    .detail-drawer-body { flex: 1; overflow-y: auto; padding: 20px; }',
    '    .detail-drawer-body .detail-section { margin-bottom: 20px; }',
    '    .detail-drawer-body .detail-section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-bottom: 8px; }',
    '    .detail-drawer-body .detail-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }',
    '    .detail-drawer-body .detail-meta-cell { background: var(--surface-2); border-radius: 8px; padding: 10px; }',
    '    .detail-drawer-body .detail-meta-cell .label { font-size: 11px; color: var(--text-muted); }',
    '    .detail-drawer-body .detail-meta-cell .value { font-size: 14px; color: var(--text-primary); margin-top: 2px; }',
    '    .detail-drawer-body .detail-progress-bar { height: 8px; background: var(--surface-3); border-radius: 4px; overflow: hidden; margin-top: 8px; }',
    '    .detail-drawer-body .detail-progress-fill { height: 100%; background: var(--status-ongoing); transition: width 0.3s; }',
    '    .detail-drawer-body .detail-progress-fill.done { background: var(--status-done); }',
    '    .detail-drawer-body .detail-log { list-style: none; padding: 0; margin: 0; }',
    '    .detail-drawer-body .detail-log li { padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text-primary); }',
    '    .detail-drawer-body .detail-log li:last-child { border-bottom: none; }',
    '    .detail-drawer-body .detail-log-meta { display: block; font-size: 11px; color: var(--text-muted); margin-bottom: 2px; }',
    '',
    '    @media (max-width: 768px) {',
    '      .kanban { grid-template-columns: 1fr; }',
    '      .timeline { flex-direction: column; align-items: center; }',
    '      .milestone-node:not(:last-child)::after { display: none; }',
    '      .kpi-grid { grid-template-columns: 1fr 1fr; }',
    '      .detail-drawer-panel { width: 100vw; }',
    '    }',
    '    @media (max-width: 480px) {',
    '      .kpi-grid { grid-template-columns: 1fr; }',
    '    }',
    '  </style>',
    '</head>',
    '<body>',
    '  <div class="header">',
    '    <div>',
    '      <h1>' + esc(root?.icon ?? data.root.icon) + ' ' + esc(root?.title ?? data.root.title) + '</h1>',
    '      <div class="meta">Last updated: ' + new Date(data.meta.lastUpdated).toLocaleString() + ' | Total tasks: ' + tasks.length + (kpis.length > 0 ? ' | KPIs: ' + kpis.length : '') + '</div>',
    '    </div>',
    '    <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Toggle theme">🌙 Dark</button>',
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
    '    <div class="timeline-v2-wrap">',
    timelineV2Html,
    '    </div>',
    '    <div class="section">',
    '      <h2>Initiatives & Tasks</h2>',
    '      <div class="task-list">',
    listTasksHtml,
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
    '    <div class="task-list" id="list-tasks">',
    listTasksHtml,
    '    </div>',
    '  </div>',
    '',
    '  <div id="tree" class="view">',
    treeHtml,
    '  </div>',
    '',
    drawerHtml,
    '',
    '  <script>',
    '    function showView(viewId, event) {',
    '      document.querySelectorAll(\'.view\').forEach(function(v) { v.classList.remove(\'active\'); });',
    '      document.querySelectorAll(\'.tab\').forEach(function(t) { t.classList.remove(\'active\'); });',
    '      document.getElementById(viewId).classList.add(\'active\');',
    '      if (event && event.target) event.target.classList.add(\'active\');',
    '    }',
    '',
    '    /* Theme toggle — light default, dark opt-in, persisted in localStorage */',
    '    (function() {',
    '      var KEY = "milestr-theme";',
    '      var root = document.documentElement;',
    '      var btn = document.getElementById("theme-toggle");',
    '      function applyTheme(name) {',
    '        if (name === "dark") { root.setAttribute("data-theme", "dark"); btn.textContent = "☀️ Light"; }',
    '        else { root.removeAttribute("data-theme"); btn.textContent = "🌙 Dark"; }',
    '      }',
    '      try {',
    '        var saved = localStorage.getItem(KEY);',
    '        if (saved === "dark") applyTheme("dark"); else applyTheme("light");',
    '      } catch (e) { applyTheme("light"); }',
    '      btn.addEventListener("click", function() {',
    '        var isDark = root.getAttribute("data-theme") === "dark";',
    '        var next = isDark ? "light" : "dark";',
    '        applyTheme(next);',
    '        try { localStorage.setItem(KEY, next); } catch (e) {}',
    '      });',
    '    })();',
    '',
    '    /* Tree view (LTR; v1.3.0 fix from RTL) — zoom, expand/collapse, jump */',
    '    (function() {',
    '      var scroll = document.getElementById("tree-scroll");',
    '      if (!scroll) return;',
    '      var breadcrumb = document.getElementById("tree-breadcrumb");',
    '      var rootId = document.getElementById("tree-wrap").getAttribute("data-tree-root");',
    '      var focusId = rootId;',
    '      var path = [];',
    '',
    '      function byId(id) { return scroll.querySelector(".tree-node[data-tree-id=\'" + id + "\']"); }',
    '      function ancestorsOf(id) {',
    '        var out = []; var n = byId(id);',
    '        while (n && n !== scroll) {',
    '          var p = n.parentElement; while (p && !p.classList.contains("tree-node")) p = p.parentElement;',
    '          if (!p) break;',
    '          out.unshift(p.getAttribute("data-tree-id"));',
    '          n = p;',
    '        }',
    '        return out;',
    '      }',
    '      function renderBreadcrumb() {',
    '        var html = "";',
    '        for (var i = 0; i < path.length; i++) {',
    '          var id = path[i];',
    '          var node = byId(id);',
    '          if (!node) continue;',
    '          var label = node.querySelector(".tree-title").textContent;',
    '          var cls = "crumb" + (i === path.length - 1 ? " current" : "");',
    '          var action = (i === path.length - 1) ? "" : " data-tree-jump=\'" + id + "\'";',
    '          html += (i > 0 ? "<span class=\"sep\">/</span>" : "") +',
    '                  "<button type=\"button\" class=\'" + cls + "\'" + action + ">" + label + "</button>";',
    '        }',
    '        breadcrumb.innerHTML = html;',
    '      }',
    '      function zoomTo(id) {',
    '        path = ancestorsOf(id);',
    '        scroll.querySelectorAll(".tree-node.zoomed").forEach(function(n) { n.classList.remove("zoomed"); });',
    '        var node = byId(id);',
    '        if (node) node.classList.add("zoomed");',
    '        scroll.querySelectorAll(".tree-node.expanded").forEach(function(n) { n.classList.remove("expanded"); });',
    '        for (var i = 0; i < path.length; i++) { byId(path[i]).classList.add("expanded"); }',
    '        renderBreadcrumb();',
    '        if (node) node.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });',
    '      }',
    '',
    '      scroll.addEventListener("click", function(ev) {',
    '        var tog = ev.target.closest("[data-tree-toggle]");',
    '        if (tog) {',
    '          ev.stopPropagation();',
    '          var id = tog.getAttribute("data-tree-toggle");',
    '          var n = byId(id);',
    '          if (n) n.classList.toggle("expanded");',
    '          return;',
    '        }',
    '        var zoom = ev.target.closest("[data-tree-zoom]");',
    '        if (zoom) {',
    '          ev.preventDefault();',
    '          focusId = zoom.getAttribute("data-tree-zoom");',
    '          zoomTo(focusId);',
    '          return;',
    '        }',
    '        var jump = ev.target.closest("[data-tree-jump]");',
    '        if (jump) {',
    '          focusId = jump.getAttribute("data-tree-jump");',
    '          zoomTo(focusId);',
    '        }',
    '      });',
    '',
    '      document.addEventListener("keydown", function(ev) {',
    '        if (ev.target && /input|textarea|select/i.test(ev.target.tagName || "")) return;',
    '        var treeActive = document.getElementById("tree").classList.contains("active");',
    '        if (!treeActive) return;',
    '        if (ev.key === "Escape" && path.length > 1) {',
    '          path.pop(); focusId = path[path.length - 1]; zoomTo(focusId);',
    '        } else if (ev.key === "+") {',
    '          scroll.querySelectorAll(".tree-node").forEach(function(n) {',
    '            if (n.querySelector(".tree-children")) n.classList.add("expanded");',
    '          });',
    '        } else if (ev.key === "-") {',
    '          scroll.querySelectorAll(".tree-node").forEach(function(n) { n.classList.remove("expanded"); });',
    '        }',
    '      });',
    '',
    '      path = [rootId];',
    '      renderBreadcrumb();',
    '    })();',
    '',
    '    /* Detail drawer (v1.3.0) — opens on [data-detail-open], closes on backdrop or × */',
    '    (function() {',
    '      var drawer = document.getElementById("detail-drawer");',
    '      var dataEl = document.getElementById("detail-data");',
    '      if (!drawer || !dataEl) return;',
    '      var tasks = JSON.parse(dataEl.textContent);',
    '      var titleEl = document.getElementById("detail-drawer-title");',
    '      var iconEl = document.getElementById("detail-drawer-icon");',
    '      var bodyEl = document.getElementById("detail-drawer-body");',
    '',
    '      function close() { drawer.setAttribute("data-state", "closed"); drawer.setAttribute("aria-hidden", "true"); }',
    '      function open(id) {',
    '        var t = tasks[id];',
    '        if (!t) return;',
    '        iconEl.textContent = t.icon || "";',
    '        titleEl.textContent = t.title || id;',
    '        var logHtml = (t.activityLog && t.activityLog.length)',
    '          ? "<ul class=\"detail-log\">" + t.activityLog.map(function(e) {',
    '              var who = e.agent ? e.agent + " · " : "";',
    '              return "<li><span class=\"detail-log-meta\">" + who + new Date(e.date).toLocaleString() + "</span>" + (e.note || "") + "</li>";',
    '            }).join("") + "</ul>"',
    '          : "<p style=\"color:var(--text-muted);font-size:13px\">No activity logged yet.</p>";',
    '        bodyEl.innerHTML = "" +',
    '          "<div class=\"detail-section\"><h3>Status</h3>" +',
    '            "<div class=\"detail-meta-grid\">" +',
    '              "<div class=\"detail-meta-cell\"><div class=\"label\">State</div><div class=\"value\">" + (t.status || "-") + "</div></div>" +',
    '              "<div class=\"detail-meta-cell\"><div class=\"label\">Type</div><div class=\"value\">" + (t.type || "-") + "</div></div>" +',
    '              "<div class=\"detail-meta-cell\"><div class=\"label\">Parent</div><div class=\"value\">" + (t.parent || "root") + "</div></div>" +',
    '              "<div class=\"detail-meta-cell\"><div class=\"label\">Due</div><div class=\"value\">" + (t.dueDate || "—") + "</div></div>" +',
    '            "</div>" +',
    '            "<div class=\"detail-progress-bar\"><div class=\"detail-progress-fill" + (t.status === "done" ? " done" : "") + "\" style=\"width:" + (t.progress || 0) + "%\"></div></div>" +',
    '          "</div>"' +
    '          (t.subtitle ? "<div class=\"detail-section\"><h3>Subtitle</h3><p style=\"font-size:14px;color:var(--text-secondary);line-height:1.5\">" + t.subtitle + "</p></div>" : "") +',
    '          "<div class=\"detail-section\"><h3>Activity Log</h3>" + logHtml + "</div>";',
    '        drawer.setAttribute("data-state", "open");',
    '        drawer.setAttribute("aria-hidden", "false");',
    '      }',
    '',
    '      document.addEventListener("click", function(ev) {',
    '        var opener = ev.target.closest("[data-detail-open]");',
    '        if (opener) { ev.preventDefault(); open(opener.getAttribute("data-detail-open")); return; }',
    '        var closer = ev.target.closest("[data-detail-close]");',
    '        if (closer) { ev.preventDefault(); close(); }',
    '      });',
    '      document.addEventListener("keydown", function(ev) {',
    '        if (ev.key === "Escape" && drawer.getAttribute("data-state") === "open") close();',
    '      });',
    '    })();',
    '',
    '    /* List virtualization (v1.3.0): hide rows far outside viewport at 200+ rows */',
    '    (function() {',
    '      var list = document.getElementById("list-tasks");',
    '      if (!list) return;',
    '      var rows = Array.prototype.slice.call(list.querySelectorAll(".task-row"));',
    '      if (rows.length < 200) return;',
    '      var buffer = 20;',
    '      var rowHeight = 44;',
    '      function update() {',
    '        var scrollTop = window.scrollY || document.documentElement.scrollTop;',
    '        var vh = window.innerHeight;',
    '        var first = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer);',
    '        var last = Math.min(rows.length, Math.ceil((scrollTop + vh) / rowHeight) + buffer);',
    '        for (var i = 0; i < rows.length; i++) {',
    '          if (i >= first && i < last) rows[i].style.display = "";',
    '          else rows[i].style.display = "none";',
    '        }',
    '      }',
    '      window.addEventListener("scroll", update, { passive: true });',
    '      window.addEventListener("resize", update);',
    '      update();',
    '    })();',
    '  </script>',
    '</body>',
    '</html>'
  ].join('\n');
}
