import * as vscode from 'vscode';
import { OAuthUsageData } from './types';
import { getOAuthCredentials } from './credentialStore';
import { logInfo, logWarn, logError } from './logger';

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const BETA_HEADER = 'oauth-2025-04-20';
const MIN_POLL_MS = 120_000;       // 2 minutes minimum
const MAX_BACKOFF_MS = 30 * 60_000; // 30 minutes max backoff

export class OAuthClient {
  private timer: ReturnType<typeof setInterval> | undefined;
  private backoffMs = 0;
  private lastData: OAuthUsageData | null = null;
  private pollIntervalMs: number;
  private focusListener: vscode.Disposable | undefined;
  private isFocused = true;

  private readonly onDataChange = new vscode.EventEmitter<OAuthUsageData>();
  readonly onDidChangeData = this.onDataChange.event;

  private readonly onError = new vscode.EventEmitter<string>();
  readonly onDidError = this.onError.event;

  constructor(pollIntervalSeconds: number) {
    this.pollIntervalMs = Math.max(pollIntervalSeconds * 1000, MIN_POLL_MS);
  }

  get data(): OAuthUsageData | null {
    return this.lastData;
  }

  start(): void {
    // Track window focus
    this.isFocused = vscode.window.state.focused;
    this.focusListener = vscode.window.onDidChangeWindowState(state => {
      this.isFocused = state.focused;
      // Fetch immediately when window regains focus
      if (state.focused && this.lastData) {
        this.fetchUsage();
      }
    });

    // Initial fetch
    this.fetchUsage();

    // Start polling
    this.timer = setInterval(() => {
      if (this.isFocused) {
        this.fetchUsage();
      }
    }, this.pollIntervalMs);
  }

  async fetchUsage(): Promise<OAuthUsageData | null> {
    const creds = getOAuthCredentials();
    if (!creds) {
      logWarn('OAuth: no credentials found');
      this.onError.fire('no_credentials');
      return null;
    }

    // Respect backoff
    if (this.backoffMs > 0) {
      this.backoffMs = Math.max(0, this.backoffMs - this.pollIntervalMs);
      return this.lastData;
    }

    try {
      const response = await fetch(USAGE_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${creds.accessToken}`,
          'anthropic-beta': BETA_HEADER,
          'User-Agent': 'claude-code-tracker-vscode/1.0.0',
        },
      });

      if (response.status === 401) {
        logError('OAuth: token expired or invalid (401)');
        this.onError.fire('auth_expired');
        return null;
      }

      if (response.status === 429) {
        this.backoffMs = this.backoffMs === 0
          ? MIN_POLL_MS
          : Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
        logWarn(`OAuth: rate limited (429), backing off ${Math.round(this.backoffMs / 1000)}s`);
        this.onError.fire('rate_limited');
        return this.lastData;
      }

      if (!response.ok) {
        logError(`OAuth: HTTP ${response.status}`);
        this.onError.fire(`http_${response.status}`);
        return this.lastData;
      }

      const raw = await response.json() as Record<string, unknown>;
      const data = parseUsageResponse(raw);
      if (data) {
        this.backoffMs = 0;
        this.lastData = data;
        logInfo(`OAuth: 5h=${data.five_hour.utilization}% 7d=${data.seven_day.utilization}%`);
        this.onDataChange.fire(data);
      }
      return data;
    } catch (err) {
      logError(`OAuth: network error — ${err}`);
      this.onError.fire('network_error');
      return this.lastData;
    }
  }

  dispose(): void {
    if (this.timer) { clearInterval(this.timer); }
    this.focusListener?.dispose();
    this.onDataChange.dispose();
    this.onError.dispose();
  }
}

function parseUsageResponse(raw: Record<string, unknown>): OAuthUsageData | null {
  try {
    const fiveHour = raw.five_hour as { utilization?: number; resets_at?: string } | undefined;
    const sevenDay = raw.seven_day as { utilization?: number; resets_at?: string } | undefined;
    const sevenDayOpus = raw.seven_day_opus as { utilization?: number; resets_at?: string } | undefined;
    const sevenDaySonnet = raw.seven_day_sonnet as { utilization?: number; resets_at?: string } | undefined;

    if (fiveHour?.utilization === undefined || sevenDay?.utilization === undefined) {
      return null;
    }

    return {
      five_hour: {
        utilization: fiveHour.utilization,
        resets_at: fiveHour.resets_at,
      },
      seven_day: {
        utilization: sevenDay.utilization,
        resets_at: sevenDay.resets_at,
      },
      seven_day_opus: {
        utilization: sevenDayOpus?.utilization ?? 0,
        resets_at: sevenDayOpus?.resets_at,
      },
      seven_day_sonnet: {
        utilization: sevenDaySonnet?.utilization ?? 0,
        resets_at: sevenDaySonnet?.resets_at,
      },
    };
  } catch {
    return null;
  }
}
