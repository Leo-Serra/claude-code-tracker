import * as vscode from 'vscode';
import { parseAllEntries, getProjectsDirectory } from './core/jsonlParser';
import { computeDashboard } from './core/usageAggregator';
import { createWatcher } from './core/fileWatcher';
import { StatusBarProvider } from './providers/statusBarProvider';
import { DashboardPanel } from './providers/dashboardPanel';

let statusBar: StatusBarProvider | undefined;
let cachedData: ReturnType<typeof computeDashboard> | undefined;

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('claudeTracker');
  return {
    customClaudeDir: cfg.get<string>('customClaudeDir', ''),
    refreshIntervalSeconds: cfg.get<number>('refreshIntervalSeconds', 10),
    showInStatusBar: cfg.get<boolean>('showInStatusBar', true),
  };
}

function refresh(context: vscode.ExtensionContext) {
  const { customClaudeDir } = getConfig();
  try {
    const entries = parseAllEntries(customClaudeDir);
    cachedData = computeDashboard(entries);
    if (statusBar) {
      statusBar.update(cachedData.block);
    }
    // If dashboard is open, push new data
    DashboardPanel.sendIfOpen(cachedData);
  } catch (err) {
    console.error('[ClaudeTracker] refresh error:', err);
    if (statusBar) {
      statusBar.showError(String(err));
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  const { showInStatusBar, customClaudeDir, refreshIntervalSeconds } = getConfig();

  statusBar = new StatusBarProvider('claudeTracker.openDashboard');

  // Initial load
  refresh(context);

  // File watcher
  const projectsDir = getProjectsDirectory(customClaudeDir);
  const watcher = createWatcher(projectsDir, () => refresh(context));
  context.subscriptions.push(watcher);

  // Polling interval as fallback
  const interval = setInterval(() => refresh(context), refreshIntervalSeconds * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeTracker.openDashboard', () => {
      const panel = DashboardPanel.show(context.extensionUri);
      if (cachedData) { panel.sendData(cachedData); }
    }),
    vscode.commands.registerCommand('claudeTracker.resetCache', () => {
      cachedData = undefined;
      refresh(context);
      vscode.window.showInformationMessage('Claude Tracker: cache reset.');
    })
  );

  // Config change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('claudeTracker')) {
        refresh(context);
      }
    })
  );

  if (showInStatusBar) {
    context.subscriptions.push({ dispose: () => statusBar?.dispose() });
  } else {
    statusBar?.dispose();
  }
}

export function deactivate() {
  statusBar?.dispose();
}
