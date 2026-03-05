import * as vscode from 'vscode';
import { BlockUsage } from '../core/types';

export class StatusBarProvider {
  private item: vscode.StatusBarItem;

  constructor(commandId: string) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = commandId;
    this.item.tooltip = 'Claude Token Tracker — click to open dashboard';
  }

  update(block: BlockUsage): void {
    const used = block.totalTokens;
    const limit = block.limitTokens;
    const pct = Math.round(block.percentUsed);
    const usedK = formatK(used);
    const limitK = formatK(limit);

    this.item.text = `$(zap) ${usedK} / ${limitK} (${pct}%)`;

    if (pct >= 90) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      this.item.color = undefined;
    } else if (pct >= 70) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.item.color = undefined;
    } else {
      this.item.backgroundColor = undefined;
      this.item.color = undefined;
    }

    const mins = Math.round(block.timeRemainingMs / 60_000);
    const remaining = mins >= 60
      ? `${Math.floor(mins / 60)}h ${mins % 60}m`
      : `${mins}m`;
    this.item.tooltip = `Claude Token Tracker\n${usedK} / ${limitK} tokens used (${pct}%)\nBlock resets in ${remaining}\nClick to open dashboard`;

    this.item.show();
  }

  showError(message: string): void {
    this.item.text = '$(zap) Claude Tracker: error';
    this.item.tooltip = message;
    this.item.backgroundColor = undefined;
    this.item.show();
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
