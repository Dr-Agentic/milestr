import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { exportDashboardHtml } from '../src/ui/dashboardHtml';
import { DASHBOARD_SCRIPT, assertDashboardScriptParses } from '../src/ui/dashboardScript';
import { createSampleData } from './helpers';
import type { DashboardData } from '../src/types';

/**
 * Dashboard interaction regression battery.
 *
 * WHY THIS FILE EXISTS (v1.3.3, issue #24):
 *
 * v1.3.0 shipped a dashboard whose tab switcher, tree view, detail drawer and
 * theme toggle were ALL dead. Root cause: the inline `<script>` was assembled
 * from single-quoted TypeScript string literals. In such a literal, `\"`
 * collapses to a bare `"`, so the emitted JavaScript was:
 *
 *     html += (i > 0 ? "<span class="sep">/</span>" : "") +
 *
 * ...which is a JavaScript syntax error. Because it is ONE `<script>` block,
 * the parse error killed the ENTIRE block - not just the tree breadcrumb.
 * Every interactive feature died at once.
 *
 * The old test suite asserted on substrings like `expect(html).toContain('"Escape"')`.
 * Those assertions pass happily on a script that cannot even parse. 122 green
 * tests, completely dead dashboard.
 *
 * This battery therefore asserts on BEHAVIOUR, not on markup:
 *   1. The emitted script must PARSE (syntax guard, catches the exact class).
 *   2. The dashboard must actually EXECUTE its script in a real DOM.
 *   3. Clicking each tab must really switch the visible view.
 */

// --- Helpers ---

/** Extract every inline <script> body from the generated HTML (skips JSON blobs). */
function extractInlineScripts(html: string): string[] {
  const scripts: string[] = [];
  const re = /<script(?![^>]*\btype\s*=\s*["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    scripts.push(match[1] ?? '');
  }
  return scripts;
}

/**
 * Build a live DOM from generated HTML and execute the inline script.
 * Returns the JSDOM window so tests can click real elements.
 */
function mountDashboard(data: DashboardData = createSampleData()): JSDOM {
  const html = exportDashboardHtml(data);
  const errors: string[] = [];

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://example.test/dashboard.html'
  });

  // Surface any runtime error the inline script threw while booting.
  dom.window.addEventListener('error', (event) => {
    errors.push(event.error instanceof Error ? event.error.message : String(event.message));
  });
  (dom.window as unknown as { __errors: string[] }).__errors = errors;

  return dom;
}

/** Click a tab button by its visible label (e.g. "Tree", "Kanban"). */
function clickTab(dom: JSDOM, label: string): void {
  const doc = dom.window.document;
  const tab = Array.from(doc.querySelectorAll<HTMLButtonElement>('.tab')).find(
    (t) => (t.textContent || '').trim() === label
  );
  if (!tab) {
    throw new Error(`Tab not found: ${label}`);
  }
  tab.click();
}

/** Which view element currently carries the `active` class. */
function activeViewId(dom: JSDOM): string | null {
  const doc = dom.window.document;
  const active = doc.querySelector('.view.active');
  return active ? active.id : null;
}

/** Fetch a task by id, failing loudly if the fixture is malformed. */
function taskOf(data: DashboardData, id: string) {
  const task = data.tasks[id];
  if (!task) throw new Error(`Fixture is missing task ${id}`);
  return task;
}

// --- 1. Syntax guard: the exact class of bug that shipped ---

describe('dashboard script syntax guard', () => {
  it('the inline script parses as valid JavaScript', () => {
    // This single assertion is what would have caught the v1.3.0 regression.
    expect(() => new Function(DASHBOARD_SCRIPT)).not.toThrow();
  });

  it('every inline script in the generated HTML parses', () => {
    const scripts = extractInlineScripts(exportDashboardHtml(createSampleData()));
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(() => new Function(script)).not.toThrow();
    }
  });

  it('never emits an HTML attribute with a raw quote inside a double-quoted JS string', () => {
    // The exact shape that broke v1.3.0: an HTML attribute double-quote
    // inside a DOUBLE-quoted JS string, e.g.
    //     html += (i > 0 ? "<span class="sep">/</span>" : "") +
    // The fixed code puts the attribute inside a SINGLE-quoted string, which
    // is valid JavaScript:
    //     html += (i > 0 ? '<span class="sep">/</span>' : '') +
    const script = DASHBOARD_SCRIPT;
    expect(script).toContain('\'<span class="sep">/</span>\'');
  });

  it('the syntax guard actually rejects the original v1.3.0 payload', () => {
    // Meta-test: prove the guard is not vacuous. This is the EXACT broken
    // line that shipped in v1.3.0 and killed every dashboard interaction.
    const v130Broken =
      'var html = "";\n' +
      'html += (i > 0 ? "<span class="sep">/</span>" : "") +\n' +
      '        "<button type="button">x</button>";\n';

    // It must NOT parse - this is the bug that shipped.
    expect(() => new Function(v130Broken)).toThrow();

    // And the guard must catch it.
    expect(() => assertDashboardScriptParses(v130Broken)).toThrow(/failed to parse/i);

    // The shipped script must parse.
    expect(() => assertDashboardScriptParses()).not.toThrow();
  });

  it('assertDashboardScriptParses throws a descriptive error on bad input', () => {
    expect(() => assertDashboardScriptParses('function broken( {')).toThrow(/failed to parse/i);
  });

  it('exportDashboardHtml fails loudly if the script is malformed', () => {
    // The generator must never be able to emit an unparseable dashboard.
    expect(() => exportDashboardHtml(createSampleData())).not.toThrow();
  });
});

// --- 2. The dashboard actually boots ---

describe('dashboard boots in a real DOM', () => {
  it('executes the inline script without throwing', () => {
    const dom = mountDashboard();
    const errors = (dom.window as unknown as { __errors: string[] }).__errors;
    expect(errors).toEqual([]);
    dom.window.close();
  });

  it('defines showView and wires every tab to it', () => {
    const dom = mountDashboard();
    const doc = dom.window.document;

    expect(typeof (dom.window as unknown as { showView?: unknown }).showView).toBe('function');

    const tabs = Array.from(doc.querySelectorAll<HTMLButtonElement>('.tab'));
    expect(tabs.length).toBeGreaterThanOrEqual(5);
    for (const tab of tabs) {
      expect(tab.getAttribute('onclick') || '').toMatch(/showView\(/);
    }
    dom.window.close();
  });

  it('renders one view container per tab', () => {
    const dom = mountDashboard();
    const doc = dom.window.document;
    const ids = Array.from(doc.querySelectorAll('.view')).map((v) => v.id);
    expect(ids.sort()).toEqual(['kanban', 'kpis', 'list', 'timeline', 'tree']);
    dom.window.close();
  });
});

// --- 3. The tab switcher actually works (THE reported bug) ---

describe('view switcher (tab selector)', () => {
  const VIEWS = ['KPIs', 'Timeline', 'Tree', 'Kanban', 'List'];

  it('has exactly one active view on load', () => {
    const dom = mountDashboard();
    const doc = dom.window.document;
    expect(doc.querySelectorAll('.view.active').length).toBe(1);
    dom.window.close();
  });

  it.each(VIEWS)('clicking the "%s" tab activates its view', (label) => {
    const dom = mountDashboard();
    const doc = dom.window.document;

    const targetId = label.toLowerCase();
    clickTab(dom, label);

    expect(activeViewId(dom)).toBe(targetId);
    expect(doc.getElementById(targetId)!.classList.contains('active')).toBe(true);
    dom.window.close();
  });

  it('clicking a tab deactivates the previously active view', () => {
    const dom = mountDashboard();
    const doc = dom.window.document;

    const before = activeViewId(dom);
    clickTab(dom, 'Kanban');
    const after = activeViewId(dom);

    expect(before).not.toBe(after);
    expect(doc.getElementById(before!)!.classList.contains('active')).toBe(false);
    expect(doc.querySelectorAll('.view.active').length).toBe(1);
    dom.window.close();
  });

  it('marks the clicked tab button as active and clears the others', () => {
    const dom = mountDashboard();
    const doc = dom.window.document;

    clickTab(dom, 'Tree');

    const activeTabs = Array.from(doc.querySelectorAll('.tab.active')).map((t) =>
      (t.textContent || '').trim()
    );
    expect(activeTabs).toEqual(['Tree']);
    dom.window.close();
  });

  it('supports switching between every pair of views', () => {
    const dom = mountDashboard();
    for (const a of VIEWS) {
      for (const b of VIEWS) {
        if (a === b) continue;
        clickTab(dom, a);
        expect(activeViewId(dom)).toBe(a.toLowerCase());
        clickTab(dom, b);
        expect(activeViewId(dom)).toBe(b.toLowerCase());
      }
    }
    dom.window.close();
  });

  it('switching to a non-existent view does not throw and keeps a valid view active', () => {
    const dom = mountDashboard();
    const win = dom.window as unknown as { showView: (id: string, ev?: unknown) => void };
    expect(() => win.showView('does-not-exist')).not.toThrow();
    expect(activeViewId(dom)).not.toBeNull();
    dom.window.close();
  });
});

// --- 4. Other interactive features that died with the same parse error ---

describe('tree view interaction', () => {
  it('renders a breadcrumb for the root node on load', () => {
    const dom = mountDashboard();
    const doc = dom.window.document;
    const crumbs = doc.querySelectorAll('#tree-breadcrumb .crumb');
    expect(crumbs.length).toBe(1);
    expect((crumbs[0]?.textContent || '').trim()).toBe('AI Agent Project');
    dom.window.close();
  });

  it('the tree toggle button expands and collapses a node', () => {
    const dom = mountDashboard();
    const doc = dom.window.document;

    const toggle = doc.querySelector<HTMLButtonElement>('[data-tree-toggle="M1"]');
    expect(toggle).not.toBeNull();
    const node = doc.querySelector('.tree-node[data-tree-id="M1"]')!;

    expect(node.classList.contains('expanded')).toBe(false);
    toggle!.click();
    expect(node.classList.contains('expanded')).toBe(true);
    toggle!.click();
    expect(node.classList.contains('expanded')).toBe(false);
    dom.window.close();
  });

  it('zooming into a child updates the breadcrumb path', () => {
    const dom = mountDashboard();
    const doc = dom.window.document;

    const zoom = doc.querySelector<HTMLButtonElement>('[data-tree-zoom="I1"]');
    expect(zoom).not.toBeNull();
    zoom!.click();

    const crumbs = Array.from(doc.querySelectorAll('#tree-breadcrumb .crumb')).map((c) =>
      (c.textContent || '').trim()
    );
    expect(crumbs).toEqual(['AI Agent Project', 'Foundation', 'Core API']);
    dom.window.close();
  });
});

describe('detail drawer interaction', () => {
  it('opens on a detail-open click and closes on Escape', () => {
    const dom = mountDashboard();
    const doc = dom.window.document;
    const drawer = doc.getElementById('detail-drawer')!;

    expect(drawer.getAttribute('data-state')).toBe('closed');

    const opener = doc.querySelector<HTMLElement>('[data-detail-open="I1"]');
    expect(opener).not.toBeNull();
    opener!.click();

    expect(drawer.getAttribute('data-state')).toBe('open');
    expect(drawer.getAttribute('aria-hidden')).toBe('false');
    expect((doc.getElementById('detail-drawer-title')!.textContent || '').trim()).toBe('Core API');

    const escEvent = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    doc.dispatchEvent(escEvent);
    expect(drawer.getAttribute('data-state')).toBe('closed');
    dom.window.close();
  });

  it('closes when the backdrop is clicked', () => {
    const dom = mountDashboard();
    const doc = dom.window.document;
    const drawer = doc.getElementById('detail-drawer')!;

    doc.querySelector<HTMLElement>('[data-detail-open="M1"]')!.click();
    expect(drawer.getAttribute('data-state')).toBe('open');

    doc.querySelector<HTMLElement>('.detail-drawer-backdrop')!.click();
    expect(drawer.getAttribute('data-state')).toBe('closed');
    dom.window.close();
  });
});

describe('theme toggle interaction', () => {
  it('toggles between light and dark and persists the choice', () => {
    const dom = mountDashboard();
    const doc = dom.window.document;
    const root = doc.documentElement;
    const btn = doc.getElementById('theme-toggle')!;

    expect(root.getAttribute('data-theme')).toBeNull();

    btn.click();
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(dom.window.localStorage.getItem('milestr-theme')).toBe('dark');

    btn.click();
    expect(root.getAttribute('data-theme')).toBeNull();
    expect(dom.window.localStorage.getItem('milestr-theme')).toBe('light');
    dom.window.close();
  });
});

// --- 5. Robustness against data-driven content ---

describe('dashboard survives hostile data', () => {
  it('a task title containing a double quote does not break the script', () => {
    const data = createSampleData();
    taskOf(data, 'I1').title = 'He said "hello" loudly';
    const dom = mountDashboard(data);

    const errors = (dom.window as unknown as { __errors: string[] }).__errors;
    expect(errors).toEqual([]);
    clickTab(dom, 'Tree');
    expect(activeViewId(dom)).toBe('tree');
    dom.window.close();
  });

  it('a task title containing script tags is escaped, not executed', () => {
    const data = createSampleData();
    taskOf(data, 'I1').title = '</script><script>window.__pwned = true;</script>';
    const dom = mountDashboard(data);

    expect((dom.window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    const errors = (dom.window as unknown as { __errors: string[] }).__errors;
    expect(errors).toEqual([]);
    dom.window.close();
  });

  it('the tree breadcrumb escapes HTML in task titles', () => {
    const data = createSampleData();
    taskOf(data, 'I1').title = '<img src=x onerror=alert(1)>';
    const dom = mountDashboard(data);
    const doc = dom.window.document;

    doc.querySelector<HTMLButtonElement>('[data-tree-zoom="I1"]')!.click();

    const crumb = doc.querySelector('#tree-breadcrumb .crumb.current');
    expect(crumb).not.toBeNull();
    // The label is inserted as text, so no <img> element should be created.
    expect(crumb!.querySelector('img')).toBeNull();
    expect(crumb!.textContent || '').toContain('<img src=x onerror=alert(1)>');
    dom.window.close();
  });

  it('the detail drawer escapes HTML in activity log notes', () => {
    const data = createSampleData();
    taskOf(data, 'I1').activityLog = [
      { date: '2026-04-20T00:00:00.000Z', agent: 'builder', note: '<script>window.__pwned2 = true;</script>' }
    ];
    const dom = mountDashboard(data);
    const doc = dom.window.document;

    doc.querySelector<HTMLElement>('[data-detail-open="I1"]')!.click();

    expect((dom.window as unknown as { __pwned2?: boolean }).__pwned2).toBeUndefined();
    const log = doc.querySelector('#detail-drawer-body .detail-log')!;
    expect(log.querySelector('script')).toBeNull();
    expect(log.textContent || '').toContain('<script>');
    dom.window.close();
  });

  it('a subtitle containing HTML is escaped in the drawer', () => {
    const data = createSampleData();
    taskOf(data, 'I1').subtitle = '<b>bold</b><script>window.__pwned3 = true;</script>';
    const dom = mountDashboard(data);
    const doc = dom.window.document;

    doc.querySelector<HTMLElement>('[data-detail-open="I1"]')!.click();

    expect((dom.window as unknown as { __pwned3?: boolean }).__pwned3).toBeUndefined();
    const body = doc.getElementById('detail-drawer-body')!;
    expect(body.querySelector('script')).toBeNull();
    expect(body.querySelector('b')).toBeNull();
    dom.window.close();
  });
});
