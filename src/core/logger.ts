import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('Claude Tracker');
  }
  return channel;
}

export function logInfo(msg: string): void {
  getChannel().appendLine(`[INFO  ${ts()}] ${msg}`);
}

export function logWarn(msg: string): void {
  getChannel().appendLine(`[WARN  ${ts()}] ${msg}`);
}

export function logError(msg: string): void {
  getChannel().appendLine(`[ERROR ${ts()}] ${msg}`);
}

export function disposeLogger(): void {
  channel?.dispose();
  channel = undefined;
}

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}
