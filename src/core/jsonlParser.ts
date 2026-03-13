import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import * as os from 'os';
import { UsageEntry } from './types';
import { logInfo, logError } from './logger';

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

function parseLine(line: string, projectPath: string): UsageEntry | null {
  const trimmed = line.trim();
  if (!trimmed) { return null; }
  try {
    const obj = JSON.parse(trimmed);
    if (obj.type !== 'assistant') { return null; }
    const msg = obj.message;
    if (!msg?.usage) { return null; }
    const u = msg.usage;
    if (typeof u.input_tokens !== 'number') { return null; }

    return {
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
    };
  } catch {
    return null;
  }
}

async function parseJsonlFileStream(filePath: string, projectPath: string): Promise<UsageEntry[]> {
  const entries: UsageEntry[] = [];
  try {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      const entry = parseLine(line, projectPath);
      if (entry) { entries.push(entry); }
    }
  } catch (err) {
    logError(`JSONL: failed to read ${filePath}: ${err}`);
  }
  return entries;
}

export async function parseAllEntries(customDir?: string): Promise<UsageEntry[]> {
  const claudeDir = getClaudeDir(customDir);
  const projectsDir = getProjectsDir(claudeDir);
  const files = findJsonlFiles(projectsDir);

  const allEntries: UsageEntry[] = [];
  const parsePromises = files.map(file => {
    const dirName = path.basename(path.dirname(file));
    const projectPath = decodeProjectPath(dirName);
    return parseJsonlFileStream(file, projectPath);
  });

  const results = await Promise.all(parsePromises);
  for (const entries of results) {
    allEntries.push(...entries);
  }

  allEntries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  logInfo(`JSONL: parsed ${allEntries.length} entries from ${files.length} files`);
  return allEntries;
}

export function getProjectsDirectory(customDir?: string): string {
  return getProjectsDir(getClaudeDir(customDir));
}
