import * as vscode from 'vscode';
import { parseAllEntries, getProjectsDirectory } from './core/jsonlParser';
import { computeDashboard } from './core/usageAggregator';
import { createWatcher } from './core/fileWatcher';
import { OAuthClient } from './core/oauthClient';
import { StatusBarProvider } from './providers/statusBarProvider';
import { SidebarProvider } from './providers/sidebarProvider';
import { DashboardData, OAuthUsageData } from './core/types';

let statusBar: StatusBarProvider | undefined;
let sidebar: SidebarProvider | undefined;
let oauthClient: OAuthClient | undefined;
let cachedData: DashboardData | undefined;
let cachedOAuth: OAuthUsageData | null = null;

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('claudeTracker');
  return {
    customClaudeDir: cfg.get<string>('customClaudeDir', ''),
    refreshIntervalSeconds: cfg.get<number>('refreshIntervalSeconds', 10),
    showInStatusBar: cfg.get<boolean>('showInStatusBar', true),
    oauthPollIntervalSeconds: cfg.get<number>('oauthPollIntervalSeconds', 150),
  };
}

/** Refresh JSONL data (detail: projects, models, costs). */
function refreshJsonl() {
  const { customClaudeDir } = getConfig();
  try {
    const entries = parseAllEntries(customClaudeDir);
    cachedData = computeDashboard(entries);
    cachedData.oauth = cachedOAuth;

    // If no OAuth data, fall back to JSONL block for status bar
    if (!cachedOAuth) {
      statusBar?.updateFromBlock(cachedData.block);
    }
    sidebar?.sendData(cachedData);
  } catch (err) {
    console.error('[ClaudeTracker] JSONL refresh error:', err);
    statusBar?.showError(String(err));
  }
}

export function activate(context: vscode.ExtensionContext) {
  const config = getConfig();

  // Status bar
  statusBar = new StatusBarProvider('claudeTracker.openDashboard');

  // Sidebar
  sidebar = new SidebarProvider();
  sidebar.onReady(() => {
    if (cachedData) { sidebar!.sendData(cachedData); }
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // --- OAuth Usage (primary source for quota) ---
  oauthClient = new OAuthClient(config.oauthPollIntervalSeconds);

  oauthClient.onDidChangeData(data => {
    cachedOAuth = data;
    statusBar?.updateFromOAuth(data);
    // Merge OAuth data into dashboard and send to sidebar
    if (cachedData) {
      cachedData.oauth = data;
      cachedData.lastUpdated = new Date().toISOString();
      sidebar?.sendData(cachedData);
    }
  });

  oauthClient.onDidError(errType => {
    if (errType === 'no_credentials') {
      statusBar?.showNoCredentials();
    } else if (errType === 'auth_expired') {
      statusBar?.showError('OAuth token expired. Re-login to Claude Code.');
    }
    // rate_limited and network_error: keep showing last known data
  });

  oauthClient.start();
  context.subscriptions.push({ dispose: () => oauthClient?.dispose() });

  // --- JSONL (secondary source for detail) ---
  refreshJsonl();

  const projectsDir = getProjectsDirectory(config.customClaudeDir);
  const watcher = createWatcher(projectsDir, refreshJsonl);
  context.subscriptions.push(watcher);

  // JSONL polling fallback (less frequent since OAuth is primary)
  const jsonlInterval = setInterval(refreshJsonl, config.refreshIntervalSeconds * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(jsonlInterval) });

  // --- Commands ---
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeTracker.openDashboard', () => {
      vscode.commands.executeCommand(`${SidebarProvider.viewId}.focus`);
    }),
    vscode.commands.registerCommand('claudeTracker.resetCache', () => {
      cachedData = undefined;
      cachedOAuth = null;
      oauthClient?.fetchUsage();
      refreshJsonl();
      vscode.window.showInformationMessage('Claude Tracker: cache reset.');
    }),
    vscode.commands.registerCommand('claudeTracker.refreshOAuth', () => {
      oauthClient?.fetchUsage();
      vscode.window.showInformationMessage('Claude Tracker: refreshing usage data...');
    })
  );

  // React to settings changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('claudeTracker')) {
        refreshJsonl();
      }
    })
  );

  if (config.showInStatusBar) {
    context.subscriptions.push({ dispose: () => statusBar?.dispose() });
  } else {
    statusBar?.dispose();
  }
}

export function deactivate() {
  oauthClient?.dispose();
  statusBar?.dispose();
}
