import * as vscode from 'vscode';
import { DashboardData } from '../core/types';
import { totalTokens } from '../core/costCalculator';

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
    this.panel.webview.html = this.getHtml(this.panel.webview, extensionUri);
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

  private getHtml(webview: vscode.Webview, _extensionUri: vscode.Uri): string {
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

  /* Block tab */
  .block-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  .card {
    background: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px; padding: 14px;
  }
  .card-label { font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
  .card-value { font-size: 1.4em; font-weight: 600; }
  .card-sub { font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-top: 2px; }

  .progress-wrap { margin-bottom: 20px; }
  .progress-label { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.85em; }
  .progress-bar { height: 10px; background: var(--vscode-progressBar-background, #444); border-radius: 5px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 5px; transition: width 0.4s; }
  .fill-green { background: #4caf50; }
  .fill-yellow { background: #ffc107; }
  .fill-red { background: #f44336; }

  .token-breakdown { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 20px; }
  .token-card { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 10px; text-align: center; }
  .token-card .label { font-size: 0.75em; color: var(--vscode-descriptionForeground); }
  .token-card .value { font-size: 1.1em; font-weight: 600; margin-top: 2px; }

  .prediction { padding: 12px; background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; font-size: 0.9em; }
  .prediction .icon { margin-right: 6px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
  th { text-align: left; padding: 8px 12px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); font-weight: normal; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.04em; }
  td { padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border, #333); }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--vscode-list-hoverBackground); }

  /* Charts */
  .chart-wrap { margin-bottom: 20px; max-height: 240px; }
  .chart-wrap-sm { margin-bottom: 20px; max-height: 200px; }

  .updated { font-size: 0.75em; color: var(--vscode-descriptionForeground); margin-top: 20px; }
  .empty { color: var(--vscode-descriptionForeground); font-style: italic; padding: 20px 0; }
</style>
</head>
<body>

<h1>&#9889; Claude Token Tracker</h1>

<div class="tabs">
  <button class="tab active" data-tab="block">Current Block</button>
  <button class="tab" data-tab="weekly">Weekly</button>
  <button class="tab" data-tab="projects">Projects</button>
  <button class="tab" data-tab="models">Models</button>
</div>

<!-- TAB: Block -->
<div id="tab-block" class="tab-content active">
  <div class="progress-wrap">
    <div class="progress-label">
      <span id="block-used">—</span>
      <span id="block-pct">—%</span>
    </div>
    <div class="progress-bar"><div id="block-fill" class="progress-fill fill-green" style="width:0%"></div></div>
  </div>

  <div class="block-grid">
    <div class="card">
      <div class="card-label">Block resets in</div>
      <div class="card-value" id="block-remaining">—</div>
      <div class="card-sub" id="block-window">—</div>
    </div>
    <div class="card">
      <div class="card-label">Burn rate</div>
      <div class="card-value" id="block-rate">—</div>
      <div class="card-sub">tokens / hour</div>
    </div>
    <div class="card">
      <div class="card-label">Estimated cost</div>
      <div class="card-value" id="block-cost">—</div>
      <div class="card-sub">this block</div>
    </div>
    <div class="card">
      <div class="card-label">Prediction</div>
      <div class="card-value" id="block-pred">—</div>
      <div class="card-sub" id="block-pred-sub">until exhaustion</div>
    </div>
  </div>

  <h2>Token breakdown</h2>
  <div class="token-breakdown">
    <div class="token-card"><div class="label">Input</div><div class="value" id="b-input">—</div></div>
    <div class="token-card"><div class="label">Output</div><div class="value" id="b-output">—</div></div>
    <div class="token-card"><div class="label">Cache Write</div><div class="value" id="b-cw">—</div></div>
    <div class="token-card"><div class="label">Cache Read</div><div class="value" id="b-cr">—</div></div>
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
  // Tab switching
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
  function fmtDuration(ms) {
    if (ms <= 0) return '0m';
    const mins = Math.round(ms / 60000);
    if (mins >= 60) return Math.floor(mins/60) + 'h ' + (mins%60) + 'm';
    return mins + 'm';
  }
  function totalTok(u) {
    return u.input_tokens + u.output_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens;
  }
  function fmtDate(s) {
    const d = new Date(s);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function cssVar(v) { return getComputedStyle(document.body).getPropertyValue(v).trim(); }

  const COLORS = {
    input: '#4fc3f7',
    output: '#aed581',
    cacheWrite: '#ffb74d',
    cacheRead: '#ce93d8',
  };

  function updateBlock(block) {
    const pct = Math.min(100, block.percentUsed);
    const fill = document.getElementById('block-fill');
    fill.style.width = pct + '%';
    fill.className = 'progress-fill ' + (pct >= 90 ? 'fill-red' : pct >= 70 ? 'fill-yellow' : 'fill-green');

    document.getElementById('block-used').textContent = fmtK(block.totalTokens) + ' / ' + fmtK(block.limitTokens) + ' tokens';
    document.getElementById('block-pct').textContent = Math.round(pct) + '%';
    document.getElementById('block-remaining').textContent = fmtDuration(block.timeRemainingMs);

    const start = new Date(block.startTime);
    const end = new Date(block.endTime);
    document.getElementById('block-window').textContent =
      start.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + ' – ' +
      end.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});

    document.getElementById('block-rate').textContent = fmtK(Math.round(block.burnRatePerHour));
    document.getElementById('block-cost').textContent = fmtCost(block.cost);

    if (block.estimatedExhaustionMs === null) {
      document.getElementById('block-pred').textContent = 'N/A';
      document.getElementById('block-pred-sub').textContent = 'no data yet';
    } else if (block.estimatedExhaustionMs === 0) {
      document.getElementById('block-pred').textContent = 'Exceeded';
      document.getElementById('block-pred-sub').textContent = 'limit reached';
    } else if (block.estimatedExhaustionMs > block.timeRemainingMs) {
      document.getElementById('block-pred').textContent = 'OK';
      document.getElementById('block-pred-sub').textContent = 'within limit';
    } else {
      document.getElementById('block-pred').textContent = fmtDuration(block.estimatedExhaustionMs);
      document.getElementById('block-pred-sub').textContent = 'until exhaustion';
    }

    const u = block.totalUsage;
    document.getElementById('b-input').textContent = fmtK(u.input_tokens);
    document.getElementById('b-output').textContent = fmtK(u.output_tokens);
    document.getElementById('b-cw').textContent = fmtK(u.cache_creation_input_tokens);
    document.getElementById('b-cr').textContent = fmtK(u.cache_read_input_tokens);
  }

  function updateWeekly(weekly) {
    const labels = weekly.map(d => fmtDate(d.date));
    const inputData = weekly.map(d => d.usage.input_tokens);
    const outputData = weekly.map(d => d.usage.output_tokens);
    const cwData = weekly.map(d => d.usage.cache_creation_input_tokens);
    const crData = weekly.map(d => d.usage.cache_read_input_tokens);

    if (weeklyChart) { weeklyChart.destroy(); }
    weeklyChart = new Chart(document.getElementById('chart-weekly'), {
      type: 'bar',
      data: {
        labels,
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
          y: { stacked: true, ticks: { color: cssVar('--vscode-foreground') || '#ccc', callback: v => fmtK(v) }, grid: { color: 'rgba(128,128,128,0.15)' } },
        },
      },
    });

    const tbody = document.getElementById('weekly-table');
    tbody.innerHTML = '';
    for (const d of [...weekly].reverse()) {
      const tot = totalTok(d.usage);
      const tr = document.createElement('tr');
      tr.innerHTML = \`<td>\${fmtDate(d.date)}</td><td>\${fmtK(d.usage.input_tokens)}</td><td>\${fmtK(d.usage.output_tokens)}</td><td>\${fmtK(d.usage.cache_read_input_tokens)}</td><td>\${fmtK(tot)}</td><td>\${fmtCost(d.cost)}</td>\`;
      tbody.appendChild(tr);
    }
  }

  function updateProjects(projects) {
    if (projectsChart) { projectsChart.destroy(); }
    if (!projects.length) {
      document.getElementById('projects-table').innerHTML = '<tr><td colspan="3" class="empty">No data for the last 7 days</td></tr>';
      return;
    }
    const top = projects.slice(0, 8);
    projectsChart = new Chart(document.getElementById('chart-projects'), {
      type: 'bar',
      data: {
        labels: top.map(p => p.projectName),
        datasets: [{ label: 'Tokens', data: top.map(p => totalTok(p.usage)), backgroundColor: COLORS.input }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: cssVar('--vscode-foreground') || '#ccc', callback: v => fmtK(v) }, grid: { color: 'rgba(128,128,128,0.15)' } },
          y: { ticks: { color: cssVar('--vscode-foreground') || '#ccc' }, grid: { display: false } },
        },
      },
    });

    const tbody = document.getElementById('projects-table');
    tbody.innerHTML = '';
    for (const p of projects) {
      const tr = document.createElement('tr');
      tr.innerHTML = \`<td title="\${p.projectPath}">\${p.projectName}</td><td>\${fmtK(totalTok(p.usage))}</td><td>\${fmtCost(p.cost)}</td>\`;
      tbody.appendChild(tr);
    }
  }

  function updateModels(models) {
    if (modelsChart) { modelsChart.destroy(); }
    if (!models.length) {
      document.getElementById('models-table').innerHTML = '<tr><td colspan="5" class="empty">No data for the last 30 days</td></tr>';
      return;
    }
    const palette = [COLORS.input, COLORS.output, COLORS.cacheWrite, COLORS.cacheRead, '#ef9a9a', '#80cbc4'];
    modelsChart = new Chart(document.getElementById('chart-models'), {
      type: 'doughnut',
      data: {
        labels: models.map(m => m.model),
        datasets: [{ data: models.map(m => totalTok(m.usage)), backgroundColor: palette }],
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { position: 'right', labels: { color: cssVar('--vscode-foreground') || '#ccc' } } },
      },
    });

    const tbody = document.getElementById('models-table');
    tbody.innerHTML = '';
    for (const m of models) {
      const tot = totalTok(m.usage);
      const tr = document.createElement('tr');
      tr.innerHTML = \`<td>\${m.model}</td><td>\${fmtK(m.usage.input_tokens)}</td><td>\${fmtK(m.usage.output_tokens)}</td><td>\${fmtK(tot)}</td><td>\${fmtCost(m.cost)}</td>\`;
      tbody.appendChild(tr);
    }
  }

  window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.type !== 'update') { return; }
    const data = msg.data;
    updateBlock(data.block);
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
