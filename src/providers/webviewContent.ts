import * as vscode from 'vscode';

export function getWebviewContent(webview: vscode.Webview): string {
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
    padding: 12px;
  }
  h2 { font-size: 0.75em; margin-bottom: 10px; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.05em; }
  .tabs { display: flex; gap: 2px; margin-bottom: 14px; border-bottom: 1px solid var(--vscode-panel-border); }
  .tab {
    padding: 6px 10px; cursor: pointer; border: none; background: none;
    color: var(--vscode-descriptionForeground); font-size: 0.85em; font-family: inherit;
    border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.1s;
  }
  .tab:hover { color: var(--vscode-foreground); }
  .tab.active { color: var(--vscode-foreground); border-bottom-color: var(--vscode-focusBorder); }
  .tab-content { display: none; }
  .tab-content.active { display: block; }

  .status-badge { display: inline-block; font-size: 0.7em; padding: 2px 6px; border-radius: 3px; margin-bottom: 10px; font-weight: 600; }
  .status-live { background: #4caf50; color: #fff; }
  .status-offline { background: #ffc107; color: #333; }

  .stat-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid var(--vscode-panel-border, #333); font-size: 0.88em; }
  .stat-row:last-child { border-bottom: none; }
  .stat-label { color: var(--vscode-descriptionForeground); }
  .stat-value { font-weight: 600; }

  .progress-wrap { margin-bottom: 14px; }
  .progress-label { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 0.82em; }
  .progress-bar { height: 8px; background: var(--vscode-input-background, rgba(128,128,128,0.2)); border-radius: 4px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 4px; transition: width 0.4s; }
  .fill-green { background: #4caf50; }
  .fill-yellow { background: #ffc107; }
  .fill-red { background: #f44336; }

  .section { margin-bottom: 16px; }
  .model-row { font-size: 0.82em; padding: 3px 0; display: flex; justify-content: space-between; }
  .model-label { color: var(--vscode-descriptionForeground); }

  .chart-wrap { margin-bottom: 14px; }

  table { width: 100%; border-collapse: collapse; font-size: 0.82em; }
  th { text-align: left; padding: 5px 8px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); font-weight: normal; font-size: 0.8em; text-transform: uppercase; }
  td { padding: 5px 8px; border-bottom: 1px solid var(--vscode-panel-border, #333); }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--vscode-list-hoverBackground); }

  .updated { font-size: 0.72em; color: var(--vscode-descriptionForeground); margin-top: 14px; }
  .empty { color: var(--vscode-descriptionForeground); font-style: italic; padding: 12px 0; font-size: 0.88em; }
  .offline-msg { color: var(--vscode-descriptionForeground); font-style: italic; font-size: 0.85em; padding: 8px 0; }
</style>
</head>
<body>

<div class="tabs">
  <button class="tab active" data-tab="usage">Usage</button>
  <button class="tab" data-tab="report">Report</button>
  <button class="tab" data-tab="models">Models</button>
</div>

<!-- TAB: Usage (OAuth data) -->
<div id="tab-usage" class="tab-content active">
  <span class="status-badge status-offline" id="status-badge">OFFLINE</span>

  <h2>5-hour block</h2>
  <div class="progress-wrap">
    <div class="progress-label">
      <span id="block-label">Usage</span>
      <span id="block-pct">—%</span>
    </div>
    <div class="progress-bar"><div id="block-fill" class="progress-fill fill-green" style="width:0%"></div></div>
  </div>
  <div class="stat-row"><span class="stat-label">Resets in</span><span class="stat-value" id="block-reset">—</span></div>

  <h2 style="margin-top:14px">Weekly limit</h2>
  <div class="progress-wrap">
    <div class="progress-label">
      <span id="weekly-label">Usage</span>
      <span id="weekly-pct">—%</span>
    </div>
    <div class="progress-bar"><div id="weekly-fill" class="progress-fill fill-green" style="width:0%"></div></div>
  </div>
  <div class="stat-row"><span class="stat-label">Resets in</span><span class="stat-value" id="weekly-reset">—</span></div>

  <div class="section" id="model-breakdown" style="margin-top:14px; display:none">
    <h2>Weekly by model</h2>
    <div class="model-row"><span class="model-label">Opus</span><span class="stat-value" id="opus-pct">—%</span></div>
    <div class="model-row"><span class="model-label">Sonnet</span><span class="stat-value" id="sonnet-pct">—%</span></div>
  </div>

  <div class="offline-msg" id="offline-msg" style="display:none">
    No OAuth data available. Make sure Claude Code is installed and you are logged in.
  </div>
</div>

<!-- TAB: Report -->
<div id="tab-report" class="tab-content">
  <h2>Last 7 days</h2>
  <div class="chart-wrap"><canvas id="chart-weekly"></canvas></div>
  <table style="margin-bottom:14px">
    <thead><tr><th>Date</th><th>Total</th><th>Cost</th></tr></thead>
    <tbody id="weekly-table"></tbody>
  </table>
  <h2>Projects</h2>
  <table>
    <thead><tr><th>Project</th><th>Tokens</th><th>Cost</th></tr></thead>
    <tbody id="projects-table"></tbody>
  </table>
</div>

<!-- TAB: Models -->
<div id="tab-models" class="tab-content">
  <h2>Last 30 days</h2>
  <div class="chart-wrap"><canvas id="chart-models"></canvas></div>
  <table>
    <thead><tr><th>Model</th><th>Tokens</th><th>Cost</th></tr></thead>
    <tbody id="models-table"></tbody>
  </table>
</div>

<div class="updated">Updated: <span id="last-updated">—</span></div>

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

  let weeklyChart, modelsChart;

  function fmtK(n) {
    if (n >= 1e6) return (n/1e6).toFixed(1)+'M';
    if (n >= 1000) return Math.round(n/1000)+'k';
    return String(n);
  }
  function fmtCost(n) { return '$'+n.toFixed(4); }
  function totalTok(u) {
    return u.input_tokens + u.output_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens;
  }
  function fmtDate(s) {
    return new Date(s).toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });
  }
  function cssVar(v) { return getComputedStyle(document.body).getPropertyValue(v).trim(); }
  function fmtResetTime(resetAt) {
    if (!resetAt) return '—';
    const diffMs = new Date(resetAt).getTime() - Date.now();
    if (diffMs <= 0) return 'resetting...';
    const mins = Math.round(diffMs / 60000);
    if (mins >= 60) return Math.floor(mins/60)+'h '+(mins%60)+'m';
    return mins+'m';
  }
  function fillClass(pct) {
    return 'progress-fill '+(pct>=80?'fill-red':pct>=50?'fill-yellow':'fill-green');
  }

  const COLORS = ['#4fc3f7','#aed581','#ffb74d','#ce93d8','#ef9a9a','#80cbc4'];

  function updateUsageTab(oauth) {
    const badge = document.getElementById('status-badge');
    const offlineMsg = document.getElementById('offline-msg');
    const breakdown = document.getElementById('model-breakdown');

    if (!oauth) {
      badge.textContent = 'OFFLINE';
      badge.className = 'status-badge status-offline';
      offlineMsg.style.display = '';
      return;
    }

    badge.textContent = 'LIVE';
    badge.className = 'status-badge status-live';
    offlineMsg.style.display = 'none';

    // 5h block
    const pct5h = Math.round(oauth.five_hour.utilization);
    document.getElementById('block-pct').textContent = pct5h+'%';
    document.getElementById('block-label').textContent = '5h block';
    const blockFill = document.getElementById('block-fill');
    blockFill.style.width = pct5h+'%';
    blockFill.className = fillClass(pct5h);
    document.getElementById('block-reset').textContent = fmtResetTime(oauth.five_hour.resets_at);

    // 7-day
    const pct7d = Math.round(oauth.seven_day.utilization);
    document.getElementById('weekly-pct').textContent = pct7d+'%';
    document.getElementById('weekly-label').textContent = 'Weekly';
    const weeklyFill = document.getElementById('weekly-fill');
    weeklyFill.style.width = pct7d+'%';
    weeklyFill.className = fillClass(pct7d);
    document.getElementById('weekly-reset').textContent = fmtResetTime(oauth.seven_day.resets_at);

    // Model breakdown
    const opusPct = Math.round(oauth.seven_day_opus.utilization);
    const sonnetPct = Math.round(oauth.seven_day_sonnet.utilization);
    if (opusPct > 0 || sonnetPct > 0) {
      breakdown.style.display = '';
      document.getElementById('opus-pct').textContent = opusPct+'%';
      document.getElementById('sonnet-pct').textContent = sonnetPct+'%';
    } else {
      breakdown.style.display = 'none';
    }
  }

  function updateWeekly(weekly) {
    const labels = weekly.map(d => fmtDate(d.date));
    if (weeklyChart) {
      weeklyChart.data.labels = labels;
      weeklyChart.data.datasets[0].data = weekly.map(d=>d.usage.input_tokens);
      weeklyChart.data.datasets[1].data = weekly.map(d=>d.usage.output_tokens);
      weeklyChart.data.datasets[2].data = weekly.map(d=>d.usage.cache_creation_input_tokens+d.usage.cache_read_input_tokens);
      weeklyChart.update('none');
    } else {
      weeklyChart = new Chart(document.getElementById('chart-weekly'), {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label:'Input', data: weekly.map(d=>d.usage.input_tokens), backgroundColor: COLORS[0], stack:'a' },
            { label:'Output', data: weekly.map(d=>d.usage.output_tokens), backgroundColor: COLORS[1], stack:'a' },
            { label:'Cache', data: weekly.map(d=>d.usage.cache_creation_input_tokens+d.usage.cache_read_input_tokens), backgroundColor: COLORS[2], stack:'a' },
          ],
        },
        options: {
          animation: false,
          responsive:true, maintainAspectRatio:true,
          plugins:{ legend:{ labels:{ color: cssVar('--vscode-foreground')||'#ccc', boxWidth:10, font:{size:10} } } },
          scales:{
            x:{ stacked:true, ticks:{ color: cssVar('--vscode-foreground')||'#ccc', font:{size:9} }, grid:{ color:'rgba(128,128,128,0.12)' } },
            y:{ stacked:true, ticks:{ color: cssVar('--vscode-foreground')||'#ccc', callback: v=>fmtK(v), font:{size:9} }, grid:{ color:'rgba(128,128,128,0.12)' } },
          },
        },
      });
    }
    const tbody = document.getElementById('weekly-table');
    tbody.innerHTML = '';
    for (const d of [...weekly].reverse()) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>'+fmtDate(d.date)+'</td><td>'+fmtK(totalTok(d.usage))+'</td><td>'+fmtCost(d.cost)+'</td>';
      tbody.appendChild(tr);
    }
  }

  function updateProjects(projects) {
    const tbody = document.getElementById('projects-table');
    tbody.innerHTML = '';
    if (!projects.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">No data</td></tr>';
      return;
    }
    for (const p of projects) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td title="'+p.projectPath+'">'+p.projectName+'</td><td>'+fmtK(totalTok(p.usage))+'</td><td>'+fmtCost(p.cost)+'</td>';
      tbody.appendChild(tr);
    }
  }

  function updateModels(models) {
    if (!models.length) {
      document.getElementById('models-table').innerHTML = '<tr><td colspan="3" class="empty">No data</td></tr>';
      return;
    }
    if (modelsChart) {
      modelsChart.data.labels = models.map(m=>m.model);
      modelsChart.data.datasets[0].data = models.map(m=>totalTok(m.usage));
      modelsChart.update('none');
    } else {
      modelsChart = new Chart(document.getElementById('chart-models'), {
        type: 'doughnut',
        data: {
          labels: models.map(m=>m.model),
          datasets: [{ data: models.map(m=>totalTok(m.usage)), backgroundColor: COLORS }],
        },
        options: {
          animation: false,
          responsive:true, maintainAspectRatio:true,
          plugins:{ legend:{ position:'bottom', labels:{ color: cssVar('--vscode-foreground')||'#ccc', boxWidth:10, font:{size:10} } } },
        },
      });
    }
    const tbody = document.getElementById('models-table');
    tbody.innerHTML = '';
    for (const m of models) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>'+m.model+'</td><td>'+fmtK(totalTok(m.usage))+'</td><td>'+fmtCost(m.cost)+'</td>';
      tbody.appendChild(tr);
    }
  }

  window.addEventListener('message', e => {
    if (e.data.type !== 'update') return;
    const d = e.data.data;
    updateUsageTab(d.oauth);
    updateWeekly(d.weekly);
    updateProjects(d.projects);
    updateModels(d.models);
    document.getElementById('last-updated').textContent = new Date(d.lastUpdated).toLocaleTimeString();
  });
})();
</script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
