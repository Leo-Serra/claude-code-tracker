import { TokenUsage } from './types';

interface ModelPrices {
  input: number;        // per million tokens
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

const PRICES: Record<string, ModelPrices> = {
  'claude-sonnet-4-6': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-sonnet-4-5': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-opus-4-6':   { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-opus-4-5':   { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-haiku-4-5':  { input: 0.80, output: 4, cacheWrite: 1, cacheRead: 0.08 },
  'claude-haiku-4-6':  { input: 0.80, output: 4, cacheWrite: 1, cacheRead: 0.08 },
};

const DEFAULT_PRICES: ModelPrices = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 };

function getPrices(model: string): ModelPrices {
  // Try exact match first, then prefix match
  if (PRICES[model]) {
    return PRICES[model];
  }
  for (const [key, prices] of Object.entries(PRICES)) {
    if (model.startsWith(key) || key.startsWith(model)) {
      return prices;
    }
  }
  // Fallback by family name
  if (model.includes('opus')) { return PRICES['claude-opus-4-6']; }
  if (model.includes('haiku')) { return PRICES['claude-haiku-4-5']; }
  return DEFAULT_PRICES;
}

export function calculateCost(usage: TokenUsage, model: string): number {
  const p = getPrices(model);
  const M = 1_000_000;
  return (
    (usage.input_tokens / M) * p.input +
    (usage.output_tokens / M) * p.output +
    (usage.cache_creation_input_tokens / M) * p.cacheWrite +
    (usage.cache_read_input_tokens / M) * p.cacheRead
  );
}

export function sumUsage(usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (acc, u) => ({
      input_tokens: acc.input_tokens + u.input_tokens,
      output_tokens: acc.output_tokens + u.output_tokens,
      cache_creation_input_tokens: acc.cache_creation_input_tokens + u.cache_creation_input_tokens,
      cache_read_input_tokens: acc.cache_read_input_tokens + u.cache_read_input_tokens,
    }),
    { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
  );
}

export function totalTokens(usage: TokenUsage): number {
  return usage.input_tokens + usage.output_tokens +
    usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
}
