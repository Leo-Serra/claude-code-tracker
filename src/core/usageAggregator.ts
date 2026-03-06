import * as path from 'path';
import { UsageEntry, BlockUsage, DailyUsage, ProjectUsage, ModelUsage, DashboardData } from './types';
import { calculateCost, sumUsage, totalTokens } from './costCalculator';

const BLOCK_MS = 5 * 60 * 60 * 1000; // 5 hours in ms
const BLOCK_LIMIT_TOKENS = 1_000_000;

/**
 * Splits entries into blocks: a new block starts whenever there is a gap
 * of >= 5h since the previous entry. This matches how Claude Code actually
 * tracks rate-limit windows (dynamic, not fixed UTC anchors).
 */
function splitIntoBlocks(entries: UsageEntry[]): { start: Date; end: Date; entries: UsageEntry[] }[] {
  if (entries.length === 0) { return []; }

  const sorted = [...entries].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const blocks: { start: Date; end: Date; entries: UsageEntry[] }[] = [];
  let blockStart = sorted[0].timestamp;
  let blockEnd = new Date(blockStart.getTime() + BLOCK_MS);
  let blockEntries: UsageEntry[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    // Start a new block if this entry falls outside the current 5h window.
    // This correctly handles continuous usage beyond 5h (no gap >= 5h between
    // consecutive entries, but total span exceeds the window).
    if (sorted[i].timestamp.getTime() >= blockEnd.getTime()) {
      blocks.push({ start: blockStart, end: blockEnd, entries: blockEntries });
      blockStart = sorted[i].timestamp;
      blockEnd = new Date(blockStart.getTime() + BLOCK_MS);
      blockEntries = [];
    }
    blockEntries.push(sorted[i]);
  }
  blocks.push({ start: blockStart, end: blockEnd, entries: blockEntries });

  return blocks;
}

export function computeBlock(entries: UsageEntry[], now: Date): BlockUsage {
  const blocks = splitIntoBlocks(entries);

  // Find the active block that contains "now" (started before now and not yet expired)
  const eligible = blocks.filter(b => b.start <= now && b.end > now);
  const currentBlock = eligible.length > 0 ? eligible[eligible.length - 1] : null;

  if (!currentBlock) {
    // No data at all
    const blockEnd = new Date(now.getTime() + BLOCK_MS);
    return {
      startTime: now, endTime: blockEnd,
      totalUsage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      totalTokens: 0, limitTokens: BLOCK_LIMIT_TOKENS, percentUsed: 0,
      burnRatePerHour: 0, estimatedExhaustionMs: null,
      timeRemainingMs: BLOCK_MS, cost: 0,
    };
  }

  const blockEntries = currentBlock.entries;
  const blockStart = currentBlock.start;
  const blockEnd = currentBlock.end;

  const totalUsage = sumUsage(blockEntries.map(e => e.usage));
  // All tokens: Claude Code counts input+output+cache_write+cache_read for the 5h block limit.
  const tokens = totalUsage.input_tokens + totalUsage.output_tokens +
    totalUsage.cache_creation_input_tokens + totalUsage.cache_read_input_tokens;
  const percentUsed = Math.min(100, (tokens / BLOCK_LIMIT_TOKENS) * 100);
  const totalCost = blockEntries.reduce((sum, e) => sum + calculateCost(e.usage, e.model), 0);

  const elapsedMs = now.getTime() - blockStart.getTime();
  const elapsedHours = elapsedMs / 3_600_000;
  const burnRatePerHour = elapsedHours > 0 ? tokens / elapsedHours : 0;

  const timeRemainingMs = Math.max(0, blockEnd.getTime() - now.getTime());
  let estimatedExhaustionMs: number | null = null;
  if (burnRatePerHour > 0) {
    const tokensRemaining = BLOCK_LIMIT_TOKENS - tokens;
    estimatedExhaustionMs = tokensRemaining > 0
      ? (tokensRemaining / burnRatePerHour) * 3_600_000
      : 0;
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
