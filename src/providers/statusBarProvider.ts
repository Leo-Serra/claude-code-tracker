import * as vscode from 'vscode';
import { BlockUsage, OAuthUsageData } from '../core/types';

export class StatusBarProvider {
  private item: vscode.StatusBarItem;

  constructor(commandId: string) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = commandId;
    this.item.tooltip = 'Claude Token Tracker — click to open dashboard';
  }

  /** Update with real OAuth usage data (primary source). */
  updateFromOAuth(data: OAuthUsageData): void {
    const pct5h = Math.round(data.five_hour.utilization);
    const pct7d = Math.round(data.seven_day.utilization);

    this.item.text = `$(zap) 5h: ${pct5h}% | 7d: ${pct7d}%`;

    // Color based on the more critical of the two limits
    const maxPct = Math.max(pct5h, pct7d);
    this.applyColor(maxPct);

    // Tooltip with details
    const lines = ['Claude Token Tracker (LIVE)'];
    lines.push(`5h block: ${pct5h}%${formatResetTime(data.five_hour.resets_at)}`);
    lines.push(`Weekly: ${pct7d}%${formatResetTime(data.seven_day.resets_at)}`);
    if (data.seven_day_opus.utilization > 0) {
      lines.push(`  Opus (7d): ${Math.round(data.seven_day_opus.utilization)}%`);
    }
    if (data.seven_day_sonnet.utilization > 0) {
      lines.push(`  Sonnet (7d): ${Math.round(data.seven_day_sonnet.utilization)}%`);
    }
    lines.push('Click to open dashboard');
    this.item.tooltip = lines.join('\n');
    this.item.show();
  }

  /** Fallback: update from JSONL-computed block data. */
  updateFromBlock(block: BlockUsage): void {
    const used = block.totalTokens;
    const limit = block.limitTokens;
    const pct = Math.round(block.percentUsed);
    const usedK = formatK(used);
    const limitK = formatK(limit);

    this.item.text = `$(zap) ${usedK} / ${limitK} (${pct}%)`;
    this.applyColor(pct);

    const mins = Math.round(block.timeRemainingMs / 60_000);
    const remaining = mins >= 60
      ? `${Math.floor(mins / 60)}h ${mins % 60}m`
      : `${mins}m`;
    this.item.tooltip = `Claude Token Tracker (OFFLINE)\n${usedK} / ${limitK} tokens used (${pct}%)\nBlock resets in ${remaining}\nClick to open dashboard`;
    this.item.show();
  }

  showNoCredentials(): void {
    this.item.text = '$(zap) Claude Tracker: login required';
    this.item.tooltip = 'No Claude Code credentials found.\nMake sure Claude Code is installed and you are logged in.';
    this.item.backgroundColor = undefined;
    this.item.show();
  }

  showError(message: string): void {
    this.item.text = '$(zap) Claude Tracker: error';
    this.item.tooltip = message;
    this.item.backgroundColor = undefined;
    this.item.show();
  }

  private applyColor(pct: number): void {
    if (pct >= 80) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (pct >= 50) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.item.backgroundColor = undefined;
    }
    this.item.color = undefined;
  }

  dispose(): void {
    this.item.dispose();
  }
}

function formatK(n: number): string {
  if (n >= 1_000_000) { return `${(n / 1_000_000).toFixed(1)}M`; }
  if (n >= 1_000) { return `${Math.round(n / 1_000)}k`; }
  return String(n);
}

function formatResetTime(resetAt?: string): string {
  if (!resetAt) { return ''; }
  try {
    const reset = new Date(resetAt);
    const now = new Date();
    const diffMs = reset.getTime() - now.getTime();
    if (diffMs <= 0) { return ' (resetting...)'; }
    const mins = Math.round(diffMs / 60_000);
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return ` — resets in ${h}h ${m}m`;
    }
    return ` — resets in ${mins}m`;
  } catch {
    return '';
  }
}
