# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A VS Code extension (`claude-token-tracker`) that monitors Claude Code API token usage via a status bar indicator and sidebar dashboard. It combines OAuth-based real-time quota data (primary) with local JSONL log parsing (secondary) for detailed analytics.

## Build & Development Commands

```bash
npm run compile        # Type check + lint + esbuild bundle
npm run watch          # Continuous rebuild (esbuild + tsc in parallel)
npm run package        # Production build (minified)
npm run check-types    # TypeScript type checking only
npm run lint           # ESLint only
npm run test           # Run tests via @vscode/test-cli
```

Debug: press F5 in VS Code to launch Extension Development Host (uses `.vscode/launch.json`).

## Architecture

**Two-tier data model:**
1. **OAuth tier (primary):** `OAuthClient` polls `api.anthropic.com/api/oauth/usage` for real-time 5-hour and 7-day utilization percentages. Drives the status bar display.
2. **JSONL tier (secondary):** `jsonlParser` reads `~/.claude/projects/**/*.jsonl` session logs for per-project, per-model, daily breakdowns. Drives the dashboard detail tabs.

**Data flow:**
```
OAuthClient (event emitter) ──→ StatusBarProvider (status bar: "5h: X% | 7d: Y%")
         └──────────────────→ SidebarProvider ──→ webviewContent.ts (HTML dashboard)
JsonlParser → UsageAggregator ──────────────────↗
```

**Key source layout:**
- `src/extension.ts` — Entry point, wires up all components, manages lifecycle
- `src/core/` — Data layer: OAuth client, credential store, JSONL parsing, cost calculation, aggregation
- `src/providers/` — UI layer: status bar, sidebar webview provider, inline HTML/JS dashboard

**Credential resolution** (`credentialStore.ts`): env var `CLAUDE_CODE_OAUTH_TOKEN` → macOS Keychain (`security` CLI) → file-based fallback (`~/.claude/.credentials.json`).

**Webview dashboard** (`webviewContent.ts`): Single HTML string with inline CSS/JS, uses Chart.js 4.4.0 via CDN, three tabs (Usage/Report/Models), CSP nonce for script security.

## Key Constants

- OAuth poll: 150s default, 120s minimum, 30min max backoff on 429
- JSONL poll: 10s default
- Keychain service name: `Claude Code-credentials`
- Pricing is hardcoded in `costCalculator.ts` (sonnet-4-6, opus-4-6, haiku-4-5)

## Extension Configuration Keys

All under `claudeTracker.*`: `customClaudeDir`, `refreshIntervalSeconds`, `showInStatusBar`, `oauthPollIntervalSeconds`, `currency`.

## Notes

- The project roadmap is in `plan.md` (written in Italian)
- No runtime dependencies — only `vscode` (external to bundle)
- esbuild bundles everything into `dist/extension.js` (CommonJS)
- TypeScript strict mode is enabled
