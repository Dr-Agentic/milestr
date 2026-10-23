/**
 * Client-side dashboard script (v1.3.3).
 *
 * WHY THIS IS A SEPARATE MODULE:
 * This script used to live inside `exportDashboardHtml()` as an array of
 * single-quoted TypeScript string literals. That encoding could not express
 * a double quote inside a double-quoted JavaScript string: in a single-quoted
 * TS literal, `\"` collapses to a bare `"`, so the emitted JS was invalid and
 * the ENTIRE `<script>` block failed to parse. One broken string silently
 * killed every interactive feature at once (tab switcher, tree view, detail
 * drawer, theme toggle).
 *
 * It now lives here as a plain template literal, where quotes need no
 * escaping at all. `assertDashboardScriptParses()` is called on every export
 * so a syntax error fails loudly at generation time instead of shipping a
 * silently broken dashboard.
 *
 * Rules for editing this file:
 *  - No `${` (would be treated as template interpolation).
 *  - No backticks.
 *  - No `</script>` sequence.
 */

/** The inline `<script>` body, already indented to match the dashboard. */
export const DASHBOARD_SCRIPT = `    /* Shared HTML escaper - task titles, subtitles and log notes are user
       data and are injected via innerHTML in a few places. */
    function escHtml(value) {
      if (value === null || value === undefined) return '';
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function showView(viewId, event) {
      // Resolve the target BEFORE mutating anything: an unknown view id must
      // not blank the dashboard (v1.3.3 fix - the original removed 'active'
      // from every view first, then threw on a missing id, leaving the page
      // with no visible view at all).
      var target = document.getElementById(viewId);
      if (!target) return;
      document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('active'); });
      document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
      target.classList.add('active');
      if (event && event.target) event.target.classList.add('active');
    }

    /* Theme toggle - light default, dark opt-in, persisted in localStorage */
    (function() {
      var KEY = 'milestr-theme';
      var root = document.documentElement;
      var btn = document.getElementById('theme-toggle');
      if (!btn) return;
      function applyTheme(name) {
        if (name === 'dark') { root.setAttribute('data-theme', 'dark'); btn.textContent = '☀️ Light'; }
        else { root.removeAttribute('data-theme'); btn.textContent = '🌙 Dark'; }
      }
      try {
        var saved = localStorage.getItem(KEY);
        if (saved === 'dark') applyTheme('dark'); else applyTheme('light');
      } catch (e) { applyTheme('light'); }
      btn.addEventListener('click', function() {
        var isDark = root.getAttribute('data-theme') === 'dark';
        var next = isDark ? 'light' : 'dark';
        applyTheme(next);
        try { localStorage.setItem(KEY, next); } catch (e) {}
      });
    })();

    /* Tree view (LTR; v1.3.0 fix from RTL) - zoom, expand/collapse, jump */
    (function() {
      var scroll = document.getElementById('tree-scroll');
      if (!scroll) return;
      var breadcrumb = document.getElementById('tree-breadcrumb');
      var treeWrap = document.getElementById('tree-wrap');
      if (!breadcrumb || !treeWrap) return;
      var rootId = treeWrap.getAttribute('data-tree-root');
      var focusId = rootId;
      var path = [];

      function byId(id) { return scroll.querySelector('.tree-node[data-tree-id="' + id + '"]'); }
      function ancestorsOf(id) {
        var out = []; var n = byId(id);
        while (n && n !== scroll) {
          var p = n.parentElement; while (p && !p.classList.contains('tree-node')) p = p.parentElement;
          if (!p) break;
          out.unshift(p.getAttribute('data-tree-id'));
          n = p;
        }
        return out;
      }
      function renderBreadcrumb() {
        var html = '';
        for (var i = 0; i < path.length; i++) {
          var id = path[i];
          var node = byId(id);
          if (!node) continue;
          var titleEl = node.querySelector('.tree-title');
          // Escape before interpolating into innerHTML: task titles are user
          // data and would otherwise be an XSS vector (v1.3.3 fix).
          var label = escHtml(titleEl ? titleEl.textContent : id);
          var cls = 'crumb' + (i === path.length - 1 ? ' current' : '');
          var action = (i === path.length - 1) ? '' : ' data-tree-jump="' + escHtml(id) + '"';
          html += (i > 0 ? '<span class="sep">/</span>' : '') +
                  '<button type="button" class="' + cls + '"' + action + '>' + label + '</button>';
        }
        breadcrumb.innerHTML = html;
      }
      function zoomTo(id) {
        // The breadcrumb shows the focused node AND its ancestors.
        // ancestorsOf() returns only the ancestors, so the focused node has
        // to be appended - otherwise the last crumb never appears and
        // 'Esc' pops the focused node instead of its parent (v1.3.3 fix).
        path = ancestorsOf(id);
        if (path[path.length - 1] !== id) path.push(id);
        scroll.querySelectorAll('.tree-node.zoomed').forEach(function(n) { n.classList.remove('zoomed'); });
        var node = byId(id);
        if (node) node.classList.add('zoomed');
        scroll.querySelectorAll('.tree-node.expanded').forEach(function(n) { n.classList.remove('expanded'); });
        for (var i = 0; i < path.length; i++) {
          var anc = byId(path[i]);
          if (anc) anc.classList.add('expanded');
        }
        renderBreadcrumb();
        if (node && typeof node.scrollIntoView === 'function') {
          node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
        }
      }

      scroll.addEventListener('click', function(ev) {
        var el = ev.target && ev.target.closest ? ev.target : null;
        if (!el) return;
        var tog = el.closest('[data-tree-toggle]');
        if (tog) {
          ev.stopPropagation();
          var id = tog.getAttribute('data-tree-toggle');
          var n = byId(id);
          if (n) n.classList.toggle('expanded');
          return;
        }
        var zoom = el.closest('[data-tree-zoom]');
        if (zoom) {
          ev.preventDefault();
          focusId = zoom.getAttribute('data-tree-zoom');
          zoomTo(focusId);
          return;
        }
        var jump = el.closest('[data-tree-jump]');
        if (jump) {
          focusId = jump.getAttribute('data-tree-jump');
          zoomTo(focusId);
        }
      });

      document.addEventListener('keydown', function(ev) {
        if (ev.target && /input|textarea|select/i.test(ev.target.tagName || '')) return;
        var treeView = document.getElementById('tree');
        var treeActive = treeView && treeView.classList.contains('active');
        if (!treeActive) return;
        if (ev.key === 'Escape' && path.length > 1) {
          path.pop(); focusId = path[path.length - 1]; zoomTo(focusId);
        } else if (ev.key === '+') {
          scroll.querySelectorAll('.tree-node').forEach(function(n) {
            if (n.querySelector('.tree-children')) n.classList.add('expanded');
          });
        } else if (ev.key === '-') {
          scroll.querySelectorAll('.tree-node').forEach(function(n) { n.classList.remove('expanded'); });
        }
      });

      path = [rootId];
      renderBreadcrumb();
    })();

    /* Detail drawer (v1.3.0) - opens on [data-detail-open], closes on backdrop or x */
    (function() {
      var drawer = document.getElementById('detail-drawer');
      var dataEl = document.getElementById('detail-data');
      if (!drawer || !dataEl) return;
      var tasks = JSON.parse(dataEl.textContent);
      var titleEl = document.getElementById('detail-drawer-title');
      var iconEl = document.getElementById('detail-drawer-icon');
      var bodyEl = document.getElementById('detail-drawer-body');
      if (!titleEl || !iconEl || !bodyEl) return;

      function close() {
        drawer.setAttribute('data-state', 'closed');
        drawer.setAttribute('aria-hidden', 'true');
      }

      function open(id) {
        var t = tasks[id];
        if (!t) return;
        iconEl.textContent = t.icon || '';
        titleEl.textContent = t.title || id;
        var logHtml = (t.activityLog && t.activityLog.length)
          ? '<ul class="detail-log">' + t.activityLog.map(function(e) {
              var who = e.agent ? e.agent + ' · ' : '';
              return '<li><span class="detail-log-meta">' +
                     escHtml(who + new Date(e.date).toLocaleString()) + '</span> ' +
                     escHtml(e.note || '') + '</li>';
            }).join('') + '</ul>'
          : '<p style="color:var(--text-muted);font-size:13px">No activity logged yet.</p>';
        bodyEl.innerHTML = '' +
          '<div class="detail-section"><h3>Status</h3>' +
            '<div class="detail-meta-grid">' +
              '<div class="detail-meta-cell"><div class="label">State</div><div class="value">' + escHtml(t.status || '-') + '</div></div>' +
              '<div class="detail-meta-cell"><div class="label">Type</div><div class="value">' + escHtml(t.type || '-') + '</div></div>' +
              '<div class="detail-meta-cell"><div class="label">Parent</div><div class="value">' + escHtml(t.parent || 'root') + '</div></div>' +
              '<div class="detail-meta-cell"><div class="label">Due</div><div class="value">' + escHtml(t.dueDate || '—') + '</div></div>' +
            '</div>' +
            '<div class="detail-progress-bar"><div class="detail-progress-fill' +
              (t.status === 'done' ? ' done' : '') + '" style="width:' + (Number(t.progress) || 0) + '%"></div></div>' +
          '</div>' +
          (t.subtitle ? '<div class="detail-section"><h3>Subtitle</h3><p style="font-size:14px;color:var(--text-secondary);line-height:1.5">' +
            escHtml(t.subtitle) + '</p></div>' : '') +
          '<div class="detail-section"><h3>Activity Log</h3>' + logHtml + '</div>';
        drawer.setAttribute('data-state', 'open');
        drawer.setAttribute('aria-hidden', 'false');
      }

      document.addEventListener('click', function(ev) {
        var el = ev.target && ev.target.closest ? ev.target : null;
        if (!el) return;
        var opener = el.closest('[data-detail-open]');
        if (opener) { ev.preventDefault(); open(opener.getAttribute('data-detail-open')); return; }
        var closer = el.closest('[data-detail-close]');
        if (closer) { ev.preventDefault(); close(); }
      });
      document.addEventListener('keydown', function(ev) {
        if (ev.key === 'Escape' && drawer.getAttribute('data-state') === 'open') close();
      });
    })();

    /* List virtualization (v1.3.0): hide rows far outside viewport at 200+ rows */
    (function() {
      var list = document.getElementById('list-tasks');
      if (!list) return;
      var rows = Array.prototype.slice.call(list.querySelectorAll('.task-row'));
      if (rows.length < 200) return;
      var buffer = 20;
      var rowHeight = 44;
      function update() {
        var scrollTop = window.scrollY || document.documentElement.scrollTop;
        var vh = window.innerHeight;
        var first = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer);
        var last = Math.min(rows.length, Math.ceil((scrollTop + vh) / rowHeight) + buffer);
        for (var i = 0; i < rows.length; i++) {
          if (i >= first && i < last) rows[i].style.display = '';
          else rows[i].style.display = 'none';
        }
      }
      window.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      update();
    })();
`;

/**
 * Throws if the dashboard script is not valid JavaScript.
 *
 * Called from `exportDashboardHtml()` so a malformed script fails at
 * generation time (loudly, with the parser message) instead of producing a
 * dashboard whose every button is dead.
 */
export function assertDashboardScriptParses(script: string = DASHBOARD_SCRIPT): void {
  try {
    // eslint-disable-next-line no-new-func
    new Function(script);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Dashboard script failed to parse: ${message}`);
  }
}
