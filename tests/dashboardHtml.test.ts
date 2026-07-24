import { describe, expect, it } from 'vitest';
import { exportDashboardHtml } from '../src/ui/dashboardHtml';
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

  it('renders the RTL Tree tab with hierarchical structure (issue #6)', () => {
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

    // RTL direction is applied to the tree (so root sits on the right)
    expect(html).toContain('.tree-wrap { background: #1e293b; border-radius: 12px; padding: 16px; border: 1px solid #334155; direction: rtl; }');

    // Zoom + toggle + jump handlers are wired up
    expect(html).toContain('data-tree-toggle=');
    expect(html).toContain('data-tree-zoom=');
    expect(html).toContain('data-tree-jump=');

    // Keyboard: Esc / + / -
    expect(html).toContain("'Escape'");
    expect(html).toContain("'+'");
    expect(html).toContain("'-'");
  });

  it('renders the tree node summary (icon, title, progress, status) collapsed by default', () => {
    const data = createSampleData();
    const html = exportDashboardHtml(data);

    // Status colors via CSS border
    expect(html).toContain('border-inline-start: 4px solid #3b82f6');
    // Activity log rendered when present (sample data has empty logs, but the wrapper exists)
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
});
