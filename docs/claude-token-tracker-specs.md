# Claude Token Tracker — Specifiche Estensione VS Code

## Panoramica

Estensione VS Code che visualizza le statistiche di utilizzo token di **Claude Code** in tempo reale, leggendo i log JSONL salvati localmente da Claude Code in `~/.claude/projects/`.

> **Nota:** Esiste già un tool CLI chiamato [ccusage](https://github.com/ryoppippi/ccusage) che fa qualcosa di simile da terminale. L'obiettivo di questa estensione è portare quella visibilità _direttamente dentro VS Code_, integrata nel workflow dello sviluppatore.

---

## Fonte Dati

Claude Code salva ogni sessione come file JSONL in:

```
~/.claude/projects/<directory-encoded>/<session-uuid>.jsonl
```

Ogni riga del file è un oggetto JSON con questa struttura rilevante:

```json
{
  "uuid": "...",
  "sessionId": "...",
  "timestamp": "2025-03-05T10:23:00.000Z",
  "message": {
    "role": "assistant",
    "usage": {
      "input_tokens": 4200,
      "output_tokens": 850,
      "cache_creation_input_tokens": 12000,
      "cache_read_input_tokens": 3500
    }
  }
}
```

Solo i messaggi con `role: "assistant"` contengono il campo `usage`.

---

## Funzionalità

### F1 — Status Bar (sempre visibile)

- Mostra token usati nell'ultimo blocco da 5 ore vs il limite (200k)
- Formato: `⚡ 87k / 200k tokens (43%)`
- Colore verde → giallo → rosso al crescere della percentuale
- Click → apre il pannello dettagli

### F2 — Pannello Webview (dettagli)

Accessibile da:

- Click sulla status bar
- Comando palette: `Claude Tracker: Open Dashboard`
- Icona nella Activity Bar

**Tab 1 — Blocco 5h corrente**

- Progress bar con token input / output / cache
- Tempo rimanente al reset del blocco
- Stima del burn rate (token/ora)
- Previsione: "A questo ritmo terminerai i token in ~2h"

**Tab 2 — Ultima settimana**

- Grafico a barre per giorno (input + output separati)
- Totale token e costo stimato in USD per giorno
- Media giornaliera

**Tab 3 — Per progetto**

- Breakdown per directory di progetto
- Token e costo per progetto nell'ultima settimana

**Tab 4 — Modelli usati**

- Ripartizione tra Sonnet, Opus, Haiku
- Token e costo stimato per modello

### F3 — FileSystemWatcher (aggiornamenti live)

- L'estensione osserva `~/.claude/projects/**/*.jsonl` con `vscode.workspace.createFileSystemWatcher`
- Aggiorna la status bar entro 5 secondi da ogni nuova entry

### F4 — Configurazione

Settings in `settings.json`:

```json
{
  "claudeTracker.customClaudeDir": "", // path alternativo a ~/.claude
  "claudeTracker.refreshIntervalSeconds": 10, // polling interval
  "claudeTracker.showInStatusBar": true,
  "claudeTracker.currency": "USD" // USD o EUR
}
```

---

## Calcolo Costo Stimato

Prezzi per milione di token (da aggiornare periodicamente, configurabili):

| Modello         | Input | Output | Cache Write | Cache Read |
| --------------- | ----- | ------ | ----------- | ---------- |
| claude-sonnet-4 | $3    | $15    | $3.75       | $0.30      |
| claude-opus-4   | $15   | $75    | $18.75      | $1.50      |
| claude-haiku-4  | $0.80 | $4     | $1          | $0.08      |

> I prezzi vanno memorizzati in un file JSON aggiornabile e/o fetchati all'avvio dall'API pubblica di Anthropic se disponibile.

---

## Architettura

```
claude-token-tracker/
├── src/
│   ├── extension.ts              # Entry point, registra comandi e providers
│   ├── core/
│   │   ├── jsonlParser.ts        # Parsing file JSONL
│   │   ├── usageAggregator.ts    # Calcola blocchi 5h, daily, weekly
│   │   ├── costCalculator.ts     # Calcola costi da token
│   │   └── fileWatcher.ts        # FileSystemWatcher
│   ├── providers/
│   │   ├── statusBarProvider.ts  # Status bar item
│   │   └── dashboardPanel.ts     # WebviewPanel
│   └── webview/
│       ├── index.html
│       ├── dashboard.js          # Logic webview (vanilla JS o bundled)
│       └── styles.css
├── package.json
├── tsconfig.json
└── README.md
```

---

## Passi di Sviluppo

### Fase 1 — Setup e Parser (giorni 1-2)

1. Scaffold estensione con `yo code` → TypeScript
2. Implementare `jsonlParser.ts`:
   - Trova tutti i file `.jsonl` in `~/.claude/projects/`
   - Legge e parsifica riga per riga
   - Filtra solo entries con `message.usage` presente
   - Restituisce array di `UsageEntry { timestamp, sessionId, projectPath, model, usage, cost }`
3. Implementare `usageAggregator.ts`:
   - `getBlockUsage(now)` → somma token negli ultimi 5 ore (es. dalla 00:00 al 04:59, 05:00 al 09:59, ecc.)
   - `getDailyUsage(days)` → aggrega per giorno degli ultimi N giorni
   - `getWeeklyUsage()` → ultimi 7 giorni
   - `getProjectUsage()` → raggruppa per `cwd` / nome progetto

> **Nota sul blocco 5h:** Claude Code usa finestre fisse (00:00–04:59, 05:00–09:59, ...) non sliding windows. Va calcolato a partire dall'ora di inizio del blocco corrente.

4. Implementare `costCalculator.ts` con tabella prezzi e metodo `calculateCost(usage, model)`

**Test:** Script Node standalone che legge i tuoi log reali e stampa i risultati in console

---

### Fase 2 — Status Bar (giorno 3)

1. Registrare `StatusBarItem` in `extension.ts` con `vscode.window.createStatusBarItem`
2. Implementare `statusBarProvider.ts`:
   - Calcola token usati nel blocco 5h corrente
   - Formatta la stringa (es. `⚡ 87k / 200k (43%)`)
   - Imposta colore basato sulla soglia: `$(warning)` giallo > 70%, `$(error)` rosso > 90%
3. Collegare il click al comando `claudeTracker.openDashboard`
4. Implementare `fileWatcher.ts` con `vscode.workspace.createFileSystemWatcher`
5. Aggiornare la status bar ad ogni evento `onDidChange` / `onDidCreate`

---

### Fase 3 — Dashboard Webview (giorni 4-6)

1. Creare `dashboardPanel.ts` che registra un `WebviewPanel`
2. Struttura HTML base con 4 tab (Blocco 5h, Settimana, Progetti, Modelli)
3. Comunicazione `extension ↔ webview` via `postMessage`:
   ```typescript
   // Extension → Webview
   panel.webview.postMessage({ type: 'updateData', payload: aggregatedData });
   // Webview → Extension
   window.addEventListener('message', event => { ... });
   ```
4. Implementare grafici con **Chart.js** (via CDN in webview) o **Recharts** se usi React
5. Styling: usare i CSS variables di VS Code per supportare i temi (`--vscode-editor-background`, ecc.)

---

### Fase 4 — Settings e Configurazione (giorno 7)

1. Definire `contributes.configuration` in `package.json`
2. Leggere settings con `vscode.workspace.getConfiguration('claudeTracker')`
3. Supportare path custom per `~/.claude`
4. Gestire il caso Windows (`%APPDATA%\Claude` o `C:\Users\<user>\.claude`)

---

### Fase 5 — Polish e Publish (giorni 8-10)

1. Aggiungere gestione errori (JSONL corrotto, directory mancante, permessi)
2. Aggiungere comando `Claude Tracker: Reset Cache` per forzare rilettura
3. Scrivere README con GIF demo
4. Testare su macOS, Windows, Linux
5. Pubblicare su VS Code Marketplace con `vsce publish`

---

## Note Tecniche Importanti

**Encoding del path nei nomi cartella:**
Claude Code codifica il path del progetto nel nome della directory sotto `~/.claude/projects/`. Ad esempio `/home/user/myapp` diventa qualcosa come `-home-user-myapp`. Va decodificato per mostrare il nome leggibile del progetto.

**Blocchi 5h vs sliding window:**
Il limite 200k è su una finestra fissa di 5 ore che si resetta a orari precisi (00:00, 05:00, 10:00, 15:00, 20:00 UTC). Non è una sliding window. Questo è lo stesso approccio usato da ccusage con il comando `blocks`.

**Token di cache:**
I `cache_read_input_tokens` costano molto meno degli `input_tokens` standard. Vanno contati separatamente sia per la visualizzazione che per il calcolo del costo (non sommati semplicemente agli input token).

**Concorrenza file:**
Claude Code scrive sui JSONL mentre è in esecuzione. Usare lettura non-bloccante e gestire file parzialmente scritti (l'ultima riga potrebbe essere incompleta).

---

## Differenziatori rispetto a ccusage

| Feature              | ccusage (CLI)    | Questa estensione             |
| -------------------- | ---------------- | ----------------------------- |
| Integrazione VS Code | ❌               | ✅ Status bar sempre visibile |
| Aggiornamenti live   | ❌               | ✅ FileSystemWatcher          |
| Grafici interattivi  | ❌ tabelle testo | ✅ Webview con Chart.js       |
| Zero setup           | ✅               | ✅                            |
| Funziona offline     | ✅               | ✅                            |

---

## Riferimenti Utili

- [VS Code Extension API — Webview](https://code.visualstudio.com/api/extension-guides/webview)
- [VS Code Extension API — StatusBarItem](https://code.visualstudio.com/api/references/vscode-api#StatusBarItem)
- [ccusage source](https://github.com/ryoppippi/ccusage) — ottimo riferimento per il parsing JSONL e il calcolo dei blocchi 5h
- [JSONL format reference](https://github.com/HillviewCap/clog) — struttura completa del file JSONL
- [yo code generator](https://code.visualstudio.com/api/get-started/your-first-extension)
