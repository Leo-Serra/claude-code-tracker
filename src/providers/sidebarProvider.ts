import * as vscode from 'vscode';
import { DashboardData } from '../core/types';
import { getWebviewContent } from './webviewContent';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'claudeTracker.dashboard';

  private view?: vscode.WebviewView;
  private onReadyCallback?: () => void;

  onReady(cb: () => void): void {
    this.onReadyCallback = cb;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = getWebviewContent(webviewView.webview);

    // Send current data as soon as the view is ready
    this.onReadyCallback?.();
  }

  sendData(data: DashboardData): void {
    this.view?.webview.postMessage({ type: 'update', data });
  }

  isVisible(): boolean {
    return !!this.view?.visible;
  }
}
