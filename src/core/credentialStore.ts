import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { OAuthCredentials } from './types';

const KEYCHAIN_SERVICE = 'Claude Code-credentials';
const CREDENTIALS_FILE = '.credentials.json';

export function getOAuthCredentials(): OAuthCredentials | null {
  // 1. Env var override
  const envToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (envToken) {
    return { accessToken: envToken, refreshToken: '', expiresAt: 0 };
  }

  // 2. Platform-specific retrieval
  const platform = process.platform;
  if (platform === 'darwin') {
    return readFromKeychain();
  }
  // Linux, WSL, Windows fallback: read from credentials file
  return readFromFile();
}

function readFromKeychain(): OAuthCredentials | null {
  try {
    const raw = execSync(
      `security find-generic-password -s '${KEYCHAIN_SERVICE}' -w`,
      { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    return parseCredentialsJson(raw);
  } catch {
    // Keychain not available or entry missing — try file fallback
    return readFromFile();
  }
}

function readFromFile(): OAuthCredentials | null {
  const candidates = [
    path.join(os.homedir(), '.claude', CREDENTIALS_FILE),
    // Windows: %APPDATA%\Claude Code\credentials.json
    ...(process.platform === 'win32' && process.env.APPDATA
      ? [path.join(process.env.APPDATA, 'Claude Code', 'credentials.json')]
      : []),
  ];

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) { continue; }
      const raw = fs.readFileSync(filePath, 'utf8');
      const creds = parseCredentialsJson(raw);
      if (creds) { return creds; }
    } catch {
      // skip unreadable files
    }
  }
  return null;
}

function parseCredentialsJson(raw: string): OAuthCredentials | null {
  try {
    const data = JSON.parse(raw);
    // Claude Code stores credentials under "claudeAiOauth" key
    const oauth = data.claudeAiOauth ?? data;
    if (!oauth.accessToken) { return null; }
    return {
      accessToken: oauth.accessToken,
      refreshToken: oauth.refreshToken ?? '',
      expiresAt: oauth.expiresAt ?? 0,
    };
  } catch {
    return null;
  }
}
