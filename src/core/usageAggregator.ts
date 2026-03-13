import * as path from 'path';
import { UsageEntry, DailyUsage, ProjectUsage, ModelUsage, DashboardData } from './types';
import { calculateCost, sumUsage, totalTokens } from './costCalculator';

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
  return {
    block: null,
    weekly: computeDaily(entries, 7),
    projects: computeProjects(entries, 7),
    models: computeModels(entries, 30),
    oauth: null,
    lastUpdated: new Date().toISOString(),
  };
}
