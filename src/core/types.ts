export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface UsageEntry {
  timestamp: Date;
  sessionId: string;
  projectPath: string;
  model: string;
  usage: TokenUsage;
}

export interface BlockUsage {
  startTime: Date;
  endTime: Date;
  totalUsage: TokenUsage;
  totalTokens: number;
  limitTokens: number;
  percentUsed: number;
  burnRatePerHour: number;
  estimatedExhaustionMs: number | null;
  timeRemainingMs: number;
  cost: number;
}

export interface DailyUsage {
  date: string; // YYYY-MM-DD
  usage: TokenUsage;
  cost: number;
}

export interface ProjectUsage {
  projectPath: string;
  projectName: string;
  usage: TokenUsage;
  cost: number;
}

export interface ModelUsage {
  model: string;
  usage: TokenUsage;
  cost: number;
}

export interface DashboardData {
  block: BlockUsage | null;
  weekly: DailyUsage[];
  projects: ProjectUsage[];
  models: ModelUsage[];
  oauth: OAuthUsageData | null;
  lastUpdated: string;
}

// --- OAuth Usage Types ---

export interface OAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

export interface UsageWindow {
  utilization: number; // 0-100
  resets_at?: string;  // ISO 8601
}

export interface OAuthUsageData {
  five_hour: UsageWindow;
  seven_day: UsageWindow;
  seven_day_opus: UsageWindow;
  seven_day_sonnet: UsageWindow;
}
