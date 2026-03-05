import * as vscode from 'vscode';
import { parseAllEntries, getProjectsDirectory } from './core/jsonlParser';
import { computeDashboard } from './core/usageAggregator';
import { createWatcher } from './core/fileWatcher';
import { StatusBarProvider } from './providers/statusBarProvider';
import { SidebarProvider } from './providers/sidebarProvider';

let statusBar: StatusBarProvider | undefined;
let sidebar: SidebarProvider | undefined;
let cachedData: ReturnType<typeof computeDashboard> | undefined;

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('claudeTracker');
  return {
    customClaudeDir: cfg.get<string>('customClaudeDir', ''),
    refreshIntervalSeconds: cfg.get<number>('refreshIntervalSeconds', 10),
    showInStatusBar: cfg.get<boolean>('showInStatusBar', true),
  };
}

function refresh() {
  const { customClaudeDir } = getConfig();
  try {
    const entries = parseAllEntries(customClaudeDir);
    cachedData = computeDashboard(entries);
    statusBar?.update(cachedData.block);
    sidebar?.sendData(cachedData);
  } catch (err) {
    console.error('[ClaudeTracker] refresh error:', err);
    statusBar?.showError(String(err));
  }
}

export function activate(context: vscode.ExtensionContext) {
  const { showInStatusBar, customClaudeDir, refreshIntervalSeconds } = getConfig();

  statusBar = new StatusBarProvider('claudeTracker.openDashboard');

  sidebar = new SidebarProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Initial load
  refresh();

  // File watcher
  const projectsDir = getProjectsDirectory(customClaudeDir);
  const watcher = createWatcher(projectsDir, refresh);
  context.subscriptions.push(watcher);

  // Polling interval as fallback
  const interval = setInterval(refresh, refreshIntervalSeconds * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeTracker.openDashboard', () => {
      vscode.commands.executeCommand(`${SidebarProvider.viewId}.focus`);
    }),
    vscode.commands.registerCommand('claudeTracker.resetCache', () => {
      cachedData = undefined;
      refresh();
      vscode.window.showInformationMessage('Claude Tracker: cache reset.');
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('claudeTracker')) {
        refresh();
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
