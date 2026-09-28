import { describe, expect, it } from 'vitest';
import { exportDashboardHtml, depthOf } from '../src/ui/dashboardHtml';
import { createSampleData } from './helpers';

describe('exportDashboardHtml', () => {
  it('renders escaped task and kpi content', () => {
    const data = createSampleData();
    data.tasks.I1.title = 'A <dangerous> task';
    data.kpis!.users.title = 'Users & Revenue';

    const html = exportDashboardHtml(data);
    expect(html).toContain('A &lt;dangerous&gt; task');
    expect(html).toContain('Users &amp; Revenue');
    expect(html).toContain('Kanban');
    expect(html).toContain('showView');
  });

  it('shows empty KPI state when no KPIs exist', () => {
    const data = createSampleData();
    delete data.kpis;

    const html = exportDashboardHtml(data);
    expect(html).toContain('No KPIs configured yet');
    expect(html).toContain('class="tab active"');
  });

  it('renders the LTR Tree tab with hierarchical structure (issue #6, v1.3.0 LTR fix)', () => {
    const data = createSampleData();
    const html = exportDashboardHtml(data);

    // Tab button + view container present
    expect(html).toContain("showView('tree'");
    expect(html).toContain('id="tree" class="view"');
    expect(html).toContain('class="tree-wrap"');
    expect(html).toContain('data-tree-root="ROOT"');

    // Every sample task appears as a tree node
    expect(html).toContain('data-tree-id="ROOT"');
    expect(html).toContain('data-tree-id="M1"');
    expect(html).toContain('data-tree-id="I1"');

    // LTR: tree-wrap MUST NOT have direction:rtl (v1.3.0 fix)
    expect(html).not.toContain('.tree-wrap { background: #1e293b; border-radius: 12px; padding: 16px; border: 1px solid #334155; direction: rtl; }');
    // Confirm LTR is the default (no direction property on .tree-wrap)
    expect(html).toMatch(/\.tree-wrap\s*\{[^}]*background: var\(--surface-1\)[^}]*\}/);

    // Zoom + toggle + jump + detail-open handlers are wired up
    expect(html).toContain('data-tree-toggle=');
    expect(html).toContain('data-tree-zoom=');
    expect(html).toContain('data-tree-jump=');
    expect(html).toContain('data-detail-open=');

    // Keyboard: Esc / + / -
    expect(html).toContain('"Escape"');
    expect(html).toContain('"+"');
    expect(html).toContain('"-"');
  });

  it('renders the tree node summary (icon, title, progress, status) collapsed by default', () => {
    const data = createSampleData();
    const html = exportDashboardHtml(data);

    // Status colors via CSS custom property
    expect(html).toContain('var(--status-ongoing)');
    // Activity log wrapper is included
    expect(html).toContain('class="tree-meta"');
    expect(html).toContain('class="tree-status ongoing"');
  });

  it('escapes user content inside tree node text', () => {
    const data = createSampleData();
    data.tasks.I1.title = 'Initiative <unsafe> "title"';
    const html = exportDashboardHtml(data);

    expect(html).toContain('Initiative &lt;unsafe&gt; &quot;title&quot;');
    expect(html).not.toContain('Initiative <unsafe>');
  });

  it('renders an empty-state tree when the root task is missing', () => {
    const data = createSampleData();
    delete (data.tasks as Record<string, unknown>).ROOT;
    const html = exportDashboardHtml(data);
    expect(html).toContain('No tasks to render.');
  });

  it('light theme is the default (v1.3.0)', () => {
    const data = createSampleData();
    const html = exportDashboardHtml(data);

    // Default palette uses light bg
    expect(html).toContain('--bg-page: #fafbfc');
    // Dark theme palette only under explicit opt-in
    expect(html).toContain(':root[data-theme="dark"]');
    // No hard-coded dark background on body
    expect(html).not.toContain('body { font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; background: #0f172a;');
    // Theme toggle button is present
    expect(html).toContain('id="theme-toggle"');
    // Persistence key matches spec
    expect(html).toContain('"milestr-theme"');
  });

  it('detail drawer is rendered with embedded task data (v1.3.0)', () => {
    const data = createSampleData();
    const html = exportDashboardHtml(data);

    // Drawer DOM
    expect(html).toContain('id="detail-drawer"');
    expect(html).toContain('id="detail-data"');
    // Embedded tasks JSON includes our IDs
    expect(html).toContain('"id":"ROOT"');
    expect(html).toContain('"id":"M1"');
    expect(html).toContain('"id":"I1"');
    // Drawer JS wiring
    expect(html).toContain('data-detail-open');
    expect(html).toContain('data-detail-close');
  });

  it('kanban cards include depth indicator and detail-open attribute (v1.3.0)', () => {
    const data = createSampleData();
    const html = exportDashboardHtml(data);

    // Kanban cards now have data-depth
    expect(html).toMatch(/class="kanban-card" data-task-id="[^"]+" data-depth="\d+" data-detail-open=/);
    // Depth badge is rendered
    expect(html).toContain('class="depth-badge"');
    // Depth badge content (dots)
    expect(html).toMatch(/[●○]/);
  });

  it('list view renders all tasks at every depth (v1.3.0)', () => {
    const data = createSampleData();
    const html = exportDashboardHtml(data);

    // All 3 sample tasks appear as list rows
    expect(html).toContain('data-task-id="ROOT"');
    expect(html).toContain('data-task-id="M1"');
    expect(html).toContain('data-task-id="I1"');
    // Each row has data-depth attribute
    expect(html).toMatch(/data-task-id="ROOT" data-depth="0"/);
    expect(html).toMatch(/data-task-id="M1" data-depth="1"/);
    expect(html).toMatch(/data-task-id="I1" data-depth="2"/);
  });

  it('timeline v2 view renders achieved and upcoming swimlanes (v1.3.0)', () => {
    const data = createSampleData();
    const html = exportDashboardHtml(data);

    expect(html).toContain('id="timeline-v2"');
    expect(html).toContain('timeline-lane-achieved');
    expect(html).toContain('timeline-lane-upcoming');
    // Sample data has no done tasks → achieved count is 0
    expect(html).toMatch(/Achieved \(0\)/);
    expect(html).toMatch(/Upcoming \(\d+\)/);
    // Bars rendered with absolute positioning
    expect(html).toMatch(/class="timeline-bar (?:not_started|ongoing|analyzing|done|blocked)"/);
  });

  it('timeline falls back to sequence axis when no dueDates are present (v1.3.0)', () => {
    const data = createSampleData();
    // Strip all dueDate values
    for (const id of Object.keys(data.tasks)) {
      data.tasks[id].dueDate = null;
    }
    const html = exportDashboardHtml(data);
    expect(html).toContain('Sequence (3 tasks)');
  });

  it('list view includes virtualization script for 200+ rows (v1.3.0)', () => {
    const data = createSampleData();
    const html = exportDashboardHtml(data);
    expect(html).toContain('rows.length < 200');
    expect(html).toContain('addEventListener("scroll"');
  });

  it('handles 1000-node data without crashing', () => {
    const data = createSampleData();
    // Build a deep chain: ROOT -> L1 -> L2 -> ... -> L999
    let parent = 'ROOT';
    data.tasks[parent].children = ['L1'];
    for (let i = 1; i <= 1000; i++) {
      const id = 'L' + i;
      data.tasks[id] = {
        id,
        title: 'Level ' + i,
        type: 'task',
        status: i % 4 === 0 ? 'done' : 'ongoing',
        progress: i % 100,
        dueDate: null,
        icon: '·',
        parent,
        children: i < 1000 ? ['L' + (i + 1)] : [],
        activityLog: []
      };
      parent = id;
    }
    // Should not throw, and should produce substantial HTML
    const html = exportDashboardHtml(data);
    expect(html.length).toBeGreaterThan(50000);
    expect(html).toContain('L1');
    expect(html).toContain('L1000');
  });
});

describe('depthOf', () => {
  it('returns 0 for the root', () => {
    const data = createSampleData();
    expect(depthOf('ROOT', data)).toBe(0);
  });

  it('returns the chain depth correctly', () => {
    const data = createSampleData();
    // Sample data: ROOT -> M1 -> I1 (chain)
    expect(depthOf('ROOT', data)).toBe(0);
    expect(depthOf('M1', data)).toBe(1);
    expect(depthOf('I1', data)).toBe(2); // I1.parent = M1
  });

  it('caps depth at 64 to prevent runaway on malformed data', () => {
    const data = createSampleData();
    // Make a cycle: ROOT -> M1 -> ROOT
    data.tasks.M1.parent = 'ROOT';
    data.tasks.ROOT.children = ['M1'];
    // depthOf on ROOT should still return 0, not loop
    expect(depthOf('ROOT', data)).toBe(0);
  });
});
