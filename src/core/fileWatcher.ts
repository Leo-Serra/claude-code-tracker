import * as vscode from 'vscode';
import * as path from 'path';

export function createWatcher(
  projectsDir: string,
  onChange: () => void
): vscode.FileSystemWatcher {
  const pattern = new vscode.RelativePattern(
    vscode.Uri.file(projectsDir),
    '**/*.jsonl'
  );

  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  const handler = debounce(onChange, 2000);
  watcher.onDidChange(handler);
  watcher.onDidCreate(handler);

  return watcher;
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer) { clearTimeout(timer); }
    timer = setTimeout(fn, ms);
  };
}
