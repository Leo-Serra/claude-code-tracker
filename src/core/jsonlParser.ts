import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { UsageEntry } from './types';

function getClaudeDir(customDir?: string): string {
  if (customDir && customDir.trim()) {
    return customDir.trim();
  }
  return path.join(os.homedir(), '.claude');
}

function getProjectsDir(claudeDir: string): string {
  return path.join(claudeDir, 'projects');
}

function decodeProjectPath(dirName: string): string {
  // Claude encodes /home/user/myapp as -home-user-myapp
  if (dirName.startsWith('-')) {
    return dirName.replace(/-/g, '/');
  }
  return dirName;
}

function findJsonlFiles(projectsDir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(projectsDir)) {
    return files;
  }
  const projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true });
  for (const entry of projectDirs) {
    if (!entry.isDirectory()) { continue; }
    const projectDir = path.join(projectsDir, entry.name);
    try {
      const sessionFiles = fs.readdirSync(projectDir);
      for (const f of sessionFiles) {
        if (f.endsWith('.jsonl')) {
          files.push(path.join(projectDir, f));
        }
      }
    } catch {
      // skip unreadable dirs
    }
  }
  return files;
}

function parseJsonlFile(filePath: string, projectPath: string): UsageEntry[] {
  const entries: UsageEntry[] = [];
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return entries;
  }

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { continue; }
    try {
      const obj = JSON.parse(trimmed);
      if (obj.type !== 'assistant') { continue; }
      const msg = obj.message;
      if (!msg?.usage) { continue; }
      const u = msg.usage;
      if (typeof u.input_tokens !== 'number') { continue; }

      entries.push({
        timestamp: new Date(obj.timestamp),
        sessionId: obj.sessionId ?? '',
        projectPath: obj.cwd ?? projectPath,
        model: msg.model ?? 'claude-sonnet-4-6',
        usage: {
          input_tokens: u.input_tokens ?? 0,
          output_tokens: u.output_tokens ?? 0,
          cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
        },
      });
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

export function parseAllEntries(customDir?: string): UsageEntry[] {
  const claudeDir = getClaudeDir(customDir);
  const projectsDir = getProjectsDir(claudeDir);
  const files = findJsonlFiles(projectsDir);

  const allEntries: UsageEntry[] = [];
  for (const file of files) {
    const dirName = path.basename(path.dirname(file));
    const projectPath = decodeProjectPath(dirName);
    const entries = parseJsonlFile(file, projectPath);
    allEntries.push(...entries);
  }

  allEntries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return allEntries;
}

export function getProjectsDirectory(customDir?: string): string {
  return getProjectsDir(getClaudeDir(customDir));
}
