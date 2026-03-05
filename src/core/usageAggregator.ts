import * as path from 'path';
import { UsageEntry, BlockUsage, DailyUsage, ProjectUsage, ModelUsage, DashboardData } from './types';
import { calculateCost, sumUsage, totalTokens } from './costCalculator';

const BLOCK_HOURS = 5;
const BLOCK_LIMIT_TOKENS = 200_000;

export function getBlockStart(now: Date): Date {
  // Fixed 5h windows: 00:00, 05:00, 10:00, 15:00, 20:00 UTC
  const utcHour = now.getUTCHours();
  const blockHour = Math.floor(utcHour / BLOCK_HOURS) * BLOCK_HOURS;
  const start = new Date(now);
  start.setUTCHours(blockHour, 0, 0, 0);
  return start;
}

export function getBlockEnd(blockStart: Date): Date {
  const end = new Date(blockStart);
  end.setUTCHours(blockStart.getUTCHours() + BLOCK_HOURS, 0, 0, 0);
  return end;
}

export function computeBlock(entries: UsageEntry[], now: Date): BlockUsage {
  const blockStart = getBlockStart(now);
  const blockEnd = getBlockEnd(blockStart);

  const blockEntries = entries.filter(
    e => e.timestamp >= blockStart && e.timestamp < blockEnd
  );

  const usageByModel: Record<string, { usage: typeof blockEntries[0]['usage']; cost: number }> = {};
  let totalCost = 0;
  for (const e of blockEntries) {
    const cost = calculateCost(e.usage, e.model);
    totalCost += cost;
    if (!usageByModel[e.model]) {
      usageByModel[e.model] = { usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, cost: 0 };
    }
    usageByModel[e.model].usage.input_tokens += e.usage.input_tokens;
    usageByModel[e.model].usage.output_tokens += e.usage.output_tokens;
    usageByModel[e.model].usage.cache_creation_input_tokens += e.usage.cache_creation_input_tokens;
    usageByModel[e.model].usage.cache_read_input_tokens += e.usage.cache_read_input_tokens;
    usageByModel[e.model].cost += cost;
  }

  const totalUsage = sumUsage(blockEntries.map(e => e.usage));
  const tokens = totalTokens(totalUsage);
  const percentUsed = Math.min(100, (tokens / BLOCK_LIMIT_TOKENS) * 100);

  const elapsedMs = now.getTime() - blockStart.getTime();
  const elapsedHours = elapsedMs / 3_600_000;
  const burnRatePerHour = elapsedHours > 0 ? tokens / elapsedHours : 0;

  const timeRemainingMs = blockEnd.getTime() - now.getTime();
  let estimatedExhaustionMs: number | null = null;
  if (burnRatePerHour > 0) {
    const tokensRemaining = BLOCK_LIMIT_TOKENS - tokens;
    if (tokensRemaining > 0) {
      const hoursToExhaustion = tokensRemaining / burnRatePerHour;
      estimatedExhaustionMs = hoursToExhaustion * 3_600_000;
    } else {
      estimatedExhaustionMs = 0;
    }
  }

  return {
    startTime: blockStart,
    endTime: blockEnd,
    totalUsage,
    totalTokens: tokens,
    limitTokens: BLOCK_LIMIT_TOKENS,
    percentUsed,
    burnRatePerHour,
    estimatedExhaustionMs,
    timeRemainingMs,
    cost: totalCost,
  };
}

export function computeDaily(entries: UsageEntry[], days: number): DailyUsage[] {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  const byDay: Record<string, { entries: UsageEntry[] }> = {};

  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    byDay[key] = { entries: [] };
  }

  for (const e of entries) {
    if (e.timestamp < cutoff) { continue; }
    const key = e.timestamp.toISOString().slice(0, 10);
    if (byDay[key]) {
      byDay[key].entries.push(e);
    }
  }

  return Object.entries(byDay)
    .map(([date, { entries: dayEntries }]) => {
      const usage = sumUsage(dayEntries.map(e => e.usage));
      const cost = dayEntries.reduce((sum, e) => sum + calculateCost(e.usage, e.model), 0);
      return { date, usage, cost };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function computeProjects(entries: UsageEntry[], days: number): ProjectUsage[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const byProject: Record<string, UsageEntry[]> = {};
  for (const e of entries) {
    if (e.timestamp < cutoff) { continue; }
    if (!byProject[e.projectPath]) {
      byProject[e.projectPath] = [];
    }
    byProject[e.projectPath].push(e);
  }

  return Object.entries(byProject)
    .map(([projectPath, projectEntries]) => {
      const usage = sumUsage(projectEntries.map(e => e.usage));
      const cost = projectEntries.reduce((sum, e) => sum + calculateCost(e.usage, e.model), 0);
      return {
        projectPath,
        projectName: path.basename(projectPath) || projectPath,
        usage,
        cost,
      };
    })
    .sort((a, b) => totalTokens(b.usage) - totalTokens(a.usage));
}

export function computeModels(entries: UsageEntry[], days: number): ModelUsage[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const byModel: Record<string, UsageEntry[]> = {};
  for (const e of entries) {
    if (e.timestamp < cutoff) { continue; }
    if (!byModel[e.model]) {
      byModel[e.model] = [];
    }
    byModel[e.model].push(e);
  }

  return Object.entries(byModel)
    .map(([model, modelEntries]) => {
      const usage = sumUsage(modelEntries.map(e => e.usage));
      const cost = modelEntries.reduce((sum, e) => sum + calculateCost(e.usage, e.model), 0);
      return { model, usage, cost };
    })
    .sort((a, b) => totalTokens(b.usage) - totalTokens(a.usage));
}

export function computeDashboard(entries: UsageEntry[]): DashboardData {
  const now = new Date();
  return {
    block: computeBlock(entries, now),
    weekly: computeDaily(entries, 7),
    projects: computeProjects(entries, 7),
    models: computeModels(entries, 30),
    lastUpdated: now.toISOString(),
  };
}
