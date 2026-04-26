'use strict';
/* ── MYO_Geo_Orgs Admin Dashboard ── */

(function () {

  /* ── Auth guard ─────────────────────────────────────────────────────────── */
  // Check if logged in on page load — redirect to login if not
  fetch('/admin/api/data')
    .then(r => { if (r.status === 401) location.replace('/admin/login.html'); else return r.json(); })
    .then(data => { if (data) init(data); })
    .catch(() => showError());

  /* ── State ──────────────────────────────────────────────────────────────── */
  var state = { apps: [], config: [] };

  /* ── Init ───────────────────────────────────────────────────────────────── */
  function init(data) {
    state.apps   = data.apps   || [];
    state.config = data.config || [];

    document.getElementById('loading-state').classList.add('hidden');
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    document.getElementById('section-overview').classList.remove('hidden');

    renderOverview();
    renderApps();
    renderSignups();
    setLastUpdated();
  }

  function showError() {
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('error-state').classList.remove('hidden');
  }

  /* ── Navigation ─────────────────────────────────────────────────────────── */
  var titles = {
    overview: ['Overview', 'All apps at a glance'],
    apps:     ['Apps',     'Manage status, beta & Play Store links'],
    signups:  ['Signups',  'Full signup list per app'],
    links:    ['Quick Links', 'Jump to dashboards'],
  };

  document.querySelectorAll('.nav-item').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var sec = el.dataset.section;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      el.classList.add('active');
      document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
      document.getElementById('section-' + sec).classList.remove('hidden');
      document.getElementById('page-title').textContent = titles[sec][0];
      document.getElementById('page-sub').textContent   = titles[sec][1];
    });
  });

  /* ── Logout ─────────────────────────────────────────────────────────────── */
  document.getElementById('logout-btn').addEventListener('click', function () {
    fetch('/admin/api/logout', { method: 'POST' })
      .finally(function () { location.replace('/admin/login.html'); });
  });

  /* ── Refresh ────────────────────────────────────────────────────────────── */
  document.getElementById('refresh-btn').addEventListener('click', function () {
    document.getElementById('last-updated').textContent = 'Refreshing…';
    fetch('/admin/api/data')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { init(data); })
      .catch(() => { document.getElementById('last-updated').textContent = 'Failed to refresh'; });
  });

  /* ── Render: Overview ───────────────────────────────────────────────────── */
  function renderOverview() {
    var grid = document.getElementById('stat-grid');
    grid.innerHTML = '';
    var totalAll = 0;

    state.apps.forEach(function (app) {
      totalAll += app.total;
      var cfg = getConfig(app.name);
      var card = el('div', 'stat-card');
      card.innerHTML =
        '<span class="stat-app">' + esc(app.name) + '</span>' +
        '<span class="stat-num">' + app.total + '</span>' +
        '<span class="stat-label">total signups</span>' +
        '<span class="stat-badge">' + statusBadge(cfg ? cfg.status : 'Coming Soon') + '</span>';
      grid.appendChild(card);
    });

    // Total card
    var tot = el('div', 'stat-card');
    tot.style.borderColor = 'rgba(96,165,250,.35)';
    tot.innerHTML =
      '<span class="stat-app">All Apps</span>' +
      '<span class="stat-num" style="color:var(--green)">' + totalAll + '</span>' +
      '<span class="stat-label">combined signups</span>';
    grid.insertBefore(tot, grid.firstChild);

    // Recent table — last 5 from each app merged + sorted
    var allRecent = [];
    state.apps.forEach(function (app) {
      app.recent.forEach(function (r) { allRecent.push(r); });
    });
    allRecent.sort(function (a, b) { return b.timestamp.localeCompare(a.timestamp); });
    allRecent = allRecent.slice(0, 10);

    var tbody = document.getElementById('recent-body');
    if (!allRecent.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">No signups yet</td></tr>';
      return;
    }
    tbody.innerHTML = allRecent.map(function (r) {
      return '<tr>' +
        '<td>' + fmtTime(r.timestamp) + '</td>' +
        '<td>' + esc(r.email) + '</td>' +
        '<td>' + esc(r.app) + '</td>' +
        '<td>' + esc(r.country) + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ── Render: Apps ───────────────────────────────────────────────────────── */
  function renderApps() {
    var grid = document.getElementById('app-grid');
    grid.innerHTML = '';

    state.apps.forEach(function (app) {
      var cfg = getConfig(app.name) || { status: 'Coming Soon', beta: false, playUrl: '' };
      var card = el('div', 'app-card');
      card.innerHTML =
        '<div class="app-card-top">' +
          '<span class="app-name">' + esc(app.name) + '</span>' +
          '<span class="app-count">' + app.total + ' signups</span>' +
        '</div>' +
        '<div class="app-meta">' +
          statusBadge(cfg.status) +
          betaBadge(cfg.beta) +
        '</div>' +
        (cfg.playUrl ? '<a href="' + esc(cfg.playUrl) + '" target="_blank" rel="noopener" style="font-size:.75rem;color:var(--accent);">▶ Play Store link</a>' : '') +
        '<button class="edit-btn" data-app="' + esc(app.name) + '">⚙ Edit app settings</button>';
      grid.appendChild(card);
    });

    // Edit button handlers
    document.querySelectorAll('.edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { openEdit(btn.dataset.app); });
    });
  }

  /* ── Render: Signups per app ────────────────────────────────────────────── */
  function renderSignups() {
    var container = document.getElementById('signups-per-app');
    container.innerHTML = '';

    if (!state.apps.length) {
      container.innerHTML = '<p style="color:var(--muted);padding:20px">No signup data yet.</p>';
      return;
    }

    state.apps.forEach(function (app) {
      var block = el('div', 'app-signup-block card');
      var rowList = app.allRows || app.recent;
      var rows = rowList.length
        ? rowList.map(function (r) {
          return '<tr data-app="' + esc(app.name) + '" data-row="' + r.sheetRowIndex + '">' +
            '<td>' + fmtTime(r.timestamp) + '</td>' +
            '<td>' + esc(r.email) + '</td>' +
            '<td>' + esc(r.country) + '</td>' +
            '<td>' + esc(r.ip) + '</td>' +
            '<td><button class="del-btn" title="Delete this row">🗑</button></td>' +
            '</tr>';
        }).join('')
        : '<tr><td colspan="5" class="empty">No signups yet</td></tr>';

      block.innerHTML =
        '<div class="card-header">' +
          '<h2 class="card-title">📱 ' + esc(app.name) + '</h2>' +
          '<span style="font-size:.78rem;color:var(--muted)">' + app.total + ' total</span>' +
        '</div>' +
        '<div class="table-wrap"><table class="data-table">' +
          '<thead><tr><th>Time</th><th>Email</th><th>Country</th><th>IP</th><th></th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div>';
      container.appendChild(block);
    });

    // Wire up delete buttons
    container.querySelectorAll('.del-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tr  = btn.closest('tr');
        var app = tr.dataset.app;
        var row = parseInt(tr.dataset.row, 10);
        if (!confirm('Delete this signup entry? This cannot be undone.')) return;
        btn.disabled = true; btn.textContent = '…';

        fetch('/admin/api/signups', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app: app, sheetRowIndex: row }),
        })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.ok) {
            tr.remove();
            // Update total count in state
            var appState = state.apps.find(function (a) { return a.name === app; });
            if (appState) appState.total = Math.max(0, appState.total - 1);
            renderOverview();
          } else {
            alert('Delete failed: ' + (d.error || 'unknown error'));
            btn.disabled = false; btn.textContent = '🗑';
          }
        })
        .catch(function () {
          alert('Network error — try again.');
          btn.disabled = false; btn.textContent = '🗑';
        });
      });
    });
  }

  /* ── Edit panel ─────────────────────────────────────────────────────────── */
  function openEdit(appName) {
    var cfg = getConfig(appName) || { status: 'Coming Soon', beta: false, playUrl: '' };
    document.getElementById('edit-title').textContent = 'Edit — ' + appName;
    document.getElementById('edit-app-name').value = appName;
    document.getElementById('edit-status').value = cfg.status;
    document.getElementById('edit-beta').checked = !!cfg.beta;
    document.getElementById('edit-play-url').value = cfg.playUrl || '';
    document.getElementById('save-msg').textContent = '';
    document.getElementById('save-msg').className = 'save-msg';

    var panel = document.getElementById('edit-panel');
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  document.getElementById('edit-cancel').addEventListener('click', function () {
    document.getElementById('edit-panel').style.display = 'none';
  });

  document.getElementById('edit-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = e.target.querySelector('.btn-primary');
    var msg = document.getElementById('save-msg');
    btn.disabled = true; btn.textContent = 'Saving…';

    var payload = {
      app:     document.getElementById('edit-app-name').value,
      status:  document.getElementById('edit-status').value,
      beta:    document.getElementById('edit-beta').checked,
      playUrl: document.getElementById('edit-play-url').value,
    };

    fetch('/admin/api/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.ok) {
        msg.textContent = '✓ Saved!'; msg.className = 'save-msg';
        // Update local config state
        var idx = state.config.findIndex(function (c) { return c.app === payload.app; });
        var entry = Object.assign({ app: payload.app }, payload);
        if (idx === -1) state.config.push(entry); else state.config[idx] = entry;
        renderApps();
      } else {
        msg.textContent = d.error || 'Save failed'; msg.className = 'save-msg err';
      }
    })
    .catch(function () { msg.textContent = 'Network error'; msg.className = 'save-msg err'; })
    .finally(function () { btn.disabled = false; btn.textContent = 'Save changes'; });
  });

  /* ── Helpers ────────────────────────────────────────────────────────────── */

  function getConfig(appName) {
    return state.config.find(function (c) { return c.app === appName; }) || null;
  }

  function statusBadge(status) {
    var cls = { 'Coming Soon': 'badge-soon', 'Beta': 'badge-beta', 'Live': 'badge-live', 'Paused': 'badge-paused' }[status] || 'badge-soon';
    return '<span class="badge ' + cls + '">' + esc(status) + '</span>';
  }

  function betaBadge(active) {
    return active
      ? '<span class="badge badge-on">Beta ON</span>'
      : '<span class="badge badge-off">Beta OFF</span>';
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function setLastUpdated() {
    document.getElementById('last-updated').textContent =
      'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

})();
