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
});
