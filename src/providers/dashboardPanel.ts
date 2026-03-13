import * as vscode from 'vscode';
import { DashboardData } from '../core/types';

export class DashboardPanel {
  private static instance: DashboardPanel | undefined;
  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(extensionUri: vscode.Uri) {
    this.panel = vscode.window.createWebviewPanel(
      'claudeTracker',
      'Claude Token Tracker',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.html = this.getHtml(this.panel.webview);
  }

  static show(extensionUri: vscode.Uri): DashboardPanel {
    if (DashboardPanel.instance) {
      DashboardPanel.instance.panel.reveal();
      return DashboardPanel.instance;
    }
    DashboardPanel.instance = new DashboardPanel(extensionUri);
    return DashboardPanel.instance;
  }

  static sendIfOpen(data: DashboardData): void {
    DashboardPanel.instance?.sendData(data);
  }

  sendData(data: DashboardData): void {
    this.panel.webview.postMessage({ type: 'update', data });
  }

  private dispose(): void {
    DashboardPanel.instance = undefined;
    this.panel.dispose();
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `script-src 'nonce-${nonce}' https://cdn.jsdelivr.net`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `img-src ${webview.cspSource} data:`,
      `connect-src 'none'`,
    ].join('; ');

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Token Tracker</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 16px;
  }
  h1 { font-size: 1.3em; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
  h2 { font-size: 1em; margin-bottom: 12px; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.05em; }
  .tabs { display: flex; gap: 2px; margin-bottom: 20px; border-bottom: 1px solid var(--vscode-panel-border); }
  .tab {
    padding: 8px 16px; cursor: pointer; border: none; background: none;
    color: var(--vscode-descriptionForeground); font-size: inherit; font-family: inherit;
    border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.1s;
  }
  .tab:hover { color: var(--vscode-foreground); }
  .tab.active { color: var(--vscode-foreground); border-bottom-color: var(--vscode-focusBorder); }
  .tab-content { display: none; }
  .tab-content.active { display: block; }

  .status-badge { display: inline-block; font-size: 0.75em; padding: 3px 8px; border-radius: 4px; font-weight: 600; vertical-align: middle; }
  .status-live { background: #4caf50; color: #fff; }
  .status-offline { background: #ffc107; color: #333; }

  .usage-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
  .usage-section { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 16px; }
  .usage-title { font-size: 0.85em; color: var(--vscode-descriptionForeground); text-transform: uppercase; margin-bottom: 10px; }
  .usage-pct { font-size: 2em; font-weight: 700; margin-bottom: 8px; }
  .usage-reset { font-size: 0.85em; color: var(--vscode-descriptionForeground); }

  .progress-wrap { margin-bottom: 12px; }
  .progress-label { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.85em; }
  .progress-bar { height: 10px; background: var(--vscode-progressBar-background, #444); border-radius: 5px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 5px; transition: width 0.4s; }
  .fill-green { background: #4caf50; }
  .fill-yellow { background: #ffc107; }
  .fill-red { background: #f44336; }

  .model-breakdown { margin-top: 16px; padding: 12px; background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; }
  .model-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 0.9em; }
  .model-row + .model-row { border-top: 1px solid var(--vscode-panel-border); }

  table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
  th { text-align: left; padding: 8px 12px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); font-weight: normal; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.04em; }
  td { padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border, #333); }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--vscode-list-hoverBackground); }

  .chart-wrap { margin-bottom: 20px; max-height: 240px; }
  .chart-wrap-sm { margin-bottom: 20px; max-height: 200px; }

  .updated { font-size: 0.75em; color: var(--vscode-descriptionForeground); margin-top: 20px; }
  .empty { color: var(--vscode-descriptionForeground); font-style: italic; padding: 20px 0; }
  .offline-msg { color: var(--vscode-descriptionForeground); font-style: italic; font-size: 0.9em; padding: 20px 0; }
</style>
</head>
<body>

<h1>&#9889; Claude Token Tracker <span class="status-badge status-offline" id="status-badge">OFFLINE</span></h1>

<div class="tabs">
  <button class="tab active" data-tab="usage">Usage</button>
  <button class="tab" data-tab="weekly">Weekly</button>
  <button class="tab" data-tab="projects">Projects</button>
  <button class="tab" data-tab="models">Models</button>
</div>

<!-- TAB: Usage -->
<div id="tab-usage" class="tab-content active">
  <div class="usage-grid">
    <div class="usage-section">
      <div class="usage-title">5-hour block</div>
      <div class="usage-pct" id="block-pct-big">—%</div>
      <div class="progress-wrap">
        <div class="progress-bar"><div id="block-fill" class="progress-fill fill-green" style="width:0%"></div></div>
      </div>
      <div class="usage-reset">Resets in <span id="block-reset">—</span></div>
    </div>
    <div class="usage-section">
      <div class="usage-title">Weekly limit</div>
      <div class="usage-pct" id="weekly-pct-big">—%</div>
      <div class="progress-wrap">
        <div class="progress-bar"><div id="weekly-fill" class="progress-fill fill-green" style="width:0%"></div></div>
      </div>
      <div class="usage-reset">Resets in <span id="weekly-reset">—</span></div>
    </div>
  </div>

  <div class="model-breakdown" id="model-breakdown" style="display:none">
    <h2>Weekly usage by model</h2>
    <div class="model-row"><span>Opus</span><span id="opus-pct">—%</span></div>
    <div class="model-row"><span>Sonnet</span><span id="sonnet-pct">—%</span></div>
  </div>

  <div class="offline-msg" id="offline-msg" style="display:none">
    No OAuth data available. Make sure Claude Code is installed and you are logged in.
  </div>
</div>

<!-- TAB: Weekly -->
<div id="tab-weekly" class="tab-content">
  <h2>Last 7 days</h2>
  <div class="chart-wrap"><canvas id="chart-weekly"></canvas></div>
  <table>
    <thead><tr><th>Date</th><th>Input</th><th>Output</th><th>Cache Read</th><th>Total</th><th>Cost</th></tr></thead>
    <tbody id="weekly-table"></tbody>
  </table>
</div>

<!-- TAB: Projects -->
<div id="tab-projects" class="tab-content">
  <h2>Last 7 days by project</h2>
  <div class="chart-wrap-sm"><canvas id="chart-projects"></canvas></div>
  <table>
    <thead><tr><th>Project</th><th>Total Tokens</th><th>Cost</th></tr></thead>
    <tbody id="projects-table"></tbody>
  </table>
</div>

<!-- TAB: Models -->
<div id="tab-models" class="tab-content">
  <h2>Last 30 days by model</h2>
  <div class="chart-wrap-sm"><canvas id="chart-models"></canvas></div>
  <table>
    <thead><tr><th>Model</th><th>Input</th><th>Output</th><th>Total Tokens</th><th>Cost</th></tr></thead>
    <tbody id="models-table"></tbody>
  </table>
</div>

<div class="updated">Last updated: <span id="last-updated">—</span></div>

<script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script nonce="${nonce}">
(function() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  let weeklyChart, projectsChart, modelsChart;

  function fmtK(n) {
    if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
    if (n >= 1000) return Math.round(n/1000) + 'k';
    return String(n);
  }
  function fmtCost(n) { return '$' + n.toFixed(4); }
  function totalTok(u) {
    return u.input_tokens + u.output_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens;
  }
  function fmtDate(s) {
    return new Date(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function cssVar(v) { return getComputedStyle(document.body).getPropertyValue(v).trim(); }
  function fmtResetTime(resetAt) {
    if (!resetAt) return '—';
    var diffMs = new Date(resetAt).getTime() - Date.now();
    if (diffMs <= 0) return 'resetting...';
    var mins = Math.round(diffMs / 60000);
    if (mins >= 60) return Math.floor(mins/60)+'h '+(mins%60)+'m';
    return mins+'m';
  }
  function fillClass(pct) {
    return 'progress-fill '+(pct>=80?'fill-red':pct>=50?'fill-yellow':'fill-green');
  }

  var COLORS = {
    input: '#4fc3f7', output: '#aed581', cacheWrite: '#ffb74d', cacheRead: '#ce93d8',
  };
  var PALETTE = ['#4fc3f7','#aed581','#ffb74d','#ce93d8','#ef9a9a','#80cbc4'];

  function updateUsageTab(oauth) {
    var badge = document.getElementById('status-badge');
    var offlineMsg = document.getElementById('offline-msg');
    var breakdown = document.getElementById('model-breakdown');

    if (!oauth) {
      badge.textContent = 'OFFLINE';
      badge.className = 'status-badge status-offline';
      offlineMsg.style.display = '';
      return;
    }

    badge.textContent = 'LIVE';
    badge.className = 'status-badge status-live';
    offlineMsg.style.display = 'none';

    var pct5h = Math.round(oauth.five_hour.utilization);
    document.getElementById('block-pct-big').textContent = pct5h+'%';
    var blockFill = document.getElementById('block-fill');
    blockFill.style.width = pct5h+'%';
    blockFill.className = fillClass(pct5h);
    document.getElementById('block-reset').textContent = fmtResetTime(oauth.five_hour.resets_at);

    var pct7d = Math.round(oauth.seven_day.utilization);
    document.getElementById('weekly-pct-big').textContent = pct7d+'%';
    var weeklyFill = document.getElementById('weekly-fill');
    weeklyFill.style.width = pct7d+'%';
    weeklyFill.className = fillClass(pct7d);
    document.getElementById('weekly-reset').textContent = fmtResetTime(oauth.seven_day.resets_at);

    var opusPct = Math.round(oauth.seven_day_opus.utilization);
    var sonnetPct = Math.round(oauth.seven_day_sonnet.utilization);
    if (opusPct > 0 || sonnetPct > 0) {
      breakdown.style.display = '';
      document.getElementById('opus-pct').textContent = opusPct+'%';
      document.getElementById('sonnet-pct').textContent = sonnetPct+'%';
    } else {
      breakdown.style.display = 'none';
    }
  }

  function updateWeekly(weekly) {
    var labels = weekly.map(function(d){ return fmtDate(d.date); });
    var inputData = weekly.map(function(d){ return d.usage.input_tokens; });
    var outputData = weekly.map(function(d){ return d.usage.output_tokens; });
    var cwData = weekly.map(function(d){ return d.usage.cache_creation_input_tokens; });
    var crData = weekly.map(function(d){ return d.usage.cache_read_input_tokens; });

    if (weeklyChart) { weeklyChart.destroy(); }
    weeklyChart = new Chart(document.getElementById('chart-weekly'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Input', data: inputData, backgroundColor: COLORS.input, stack: 'a' },
          { label: 'Output', data: outputData, backgroundColor: COLORS.output, stack: 'a' },
          { label: 'Cache Write', data: cwData, backgroundColor: COLORS.cacheWrite, stack: 'a' },
          { label: 'Cache Read', data: crData, backgroundColor: COLORS.cacheRead, stack: 'a' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { labels: { color: cssVar('--vscode-foreground') || '#ccc' } } },
        scales: {
          x: { stacked: true, ticks: { color: cssVar('--vscode-foreground') || '#ccc' }, grid: { color: 'rgba(128,128,128,0.15)' } },
          y: { stacked: true, ticks: { color: cssVar('--vscode-foreground') || '#ccc', callback: function(v){ return fmtK(v); } }, grid: { color: 'rgba(128,128,128,0.15)' } },
        },
      },
    });

    var tbody = document.getElementById('weekly-table');
    tbody.innerHTML = '';
    var rev = weekly.slice().reverse();
    for (var i = 0; i < rev.length; i++) {
      var d = rev[i];
      var tot = totalTok(d.usage);
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>'+fmtDate(d.date)+'</td><td>'+fmtK(d.usage.input_tokens)+'</td><td>'+fmtK(d.usage.output_tokens)+'</td><td>'+fmtK(d.usage.cache_read_input_tokens)+'</td><td>'+fmtK(tot)+'</td><td>'+fmtCost(d.cost)+'</td>';
      tbody.appendChild(tr);
    }
  }

  function updateProjects(projects) {
    if (projectsChart) { projectsChart.destroy(); }
    if (!projects.length) {
      document.getElementById('projects-table').innerHTML = '<tr><td colspan="3" class="empty">No data for the last 7 days</td></tr>';
      return;
    }
    var top = projects.slice(0, 8);
    projectsChart = new Chart(document.getElementById('chart-projects'), {
      type: 'bar',
      data: {
        labels: top.map(function(p){ return p.projectName; }),
        datasets: [{ label: 'Tokens', data: top.map(function(p){ return totalTok(p.usage); }), backgroundColor: COLORS.input }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: cssVar('--vscode-foreground') || '#ccc', callback: function(v){ return fmtK(v); } }, grid: { color: 'rgba(128,128,128,0.15)' } },
          y: { ticks: { color: cssVar('--vscode-foreground') || '#ccc' }, grid: { display: false } },
        },
      },
    });

    var tbody = document.getElementById('projects-table');
    tbody.innerHTML = '';
    for (var i = 0; i < projects.length; i++) {
      var p = projects[i];
      var tr = document.createElement('tr');
      tr.innerHTML = '<td title="'+p.projectPath+'">'+p.projectName+'</td><td>'+fmtK(totalTok(p.usage))+'</td><td>'+fmtCost(p.cost)+'</td>';
      tbody.appendChild(tr);
    }
  }

  function updateModels(models) {
    if (modelsChart) { modelsChart.destroy(); }
    if (!models.length) {
      document.getElementById('models-table').innerHTML = '<tr><td colspan="5" class="empty">No data for the last 30 days</td></tr>';
      return;
    }
    modelsChart = new Chart(document.getElementById('chart-models'), {
      type: 'doughnut',
      data: {
        labels: models.map(function(m){ return m.model; }),
        datasets: [{ data: models.map(function(m){ return totalTok(m.usage); }), backgroundColor: PALETTE }],
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { position: 'right', labels: { color: cssVar('--vscode-foreground') || '#ccc' } } },
      },
    });

    var tbody = document.getElementById('models-table');
    tbody.innerHTML = '';
    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      var tot = totalTok(m.usage);
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>'+m.model+'</td><td>'+fmtK(m.usage.input_tokens)+'</td><td>'+fmtK(m.usage.output_tokens)+'</td><td>'+fmtK(tot)+'</td><td>'+fmtCost(m.cost)+'</td>';
      tbody.appendChild(tr);
    }
  }

  window.addEventListener('message', function(event) {
    var msg = event.data;
    if (msg.type !== 'update') return;
    var data = msg.data;
    updateUsageTab(data.oauth);
    updateWeekly(data.weekly);
    updateProjects(data.projects);
    updateModels(data.models);
    document.getElementById('last-updated').textContent = new Date(data.lastUpdated).toLocaleTimeString();
  });
})();
</script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
