import * as vscode from 'vscode';
import { DashboardData } from '../core/types';
import { getWebviewContent } from './webviewContent';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'claudeTracker.dashboard';

  private view?: vscode.WebviewView;

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
  }

  sendData(data: DashboardData): void {
    this.view?.webview.postMessage({ type: 'update', data });
  }

  isVisible(): boolean {
    return !!this.view?.visible;
  }
}
