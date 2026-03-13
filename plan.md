# Claude Code Tracker — Piano di Sviluppo v2

## Analisi della Situazione Attuale

### Cosa funziona

- Struttura dell'estensione VS Code solida (status bar, sidebar, dashboard)
- FileWatcher per aggiornamenti live
- UI con Chart.js e supporto temi VS Code
- Parsing base dei file JSONL

### Problemi identificati

1. **Calcolo percentuali/blocchi inaffidabile**: Il blocco 5h usa logica "dinamica" basata su gap tra entries, ma non corrisponde a come Claude Code calcola realmente i limiti. Le percentuali risultano sbagliate.

2. **Limite token hardcoded e potenzialmente errato**: `BLOCK_LIMIT_TOKENS = 1_000_000` non riflette necessariamente il piano dell'utente.

3. **Nessuna connessione al sistema reale di quota**: Tutto e' basato su parsing locale dei JSONL e calcoli interni. Claude Code ha un proprio sistema di tracking della quota che restituisce dati precisi — non lo stiamo usando.

4. **Costi hardcoded**: I prezzi sono fissi nel codice.

### Scoperta chiave: l'endpoint OAuth Usage

Claude Code usa internamente un endpoint non documentato per il comando `/usage`:

```text
GET https://api.anthropic.com/api/oauth/usage
Authorization: Bearer sk-ant-oat01-...
anthropic-beta: oauth-2025-04-20
```

Risposta:

```json
{
  "five_hour": { "utilization": 37.0, "resets_at": "2026-03-13T19:59:59Z" },
  "seven_day": { "utilization": 26.0, "resets_at": "2026-03-18T14:59:59Z" },
  "seven_day_opus": { "utilization": 0.0 },
  "seven_day_sonnet": { "utilization": 1.0 }
}
```

- `utilization` = percentuale (0-100), indipendente dal piano
- `resets_at` = timestamp preciso del prossimo reset
- Si adatta automaticamente a qualsiasi piano (Pro, Max 5, Max 20)

**Come ottenere il token OAuth:**

- **macOS**: Keychain, servizio `Claude Code-credentials`
  ```bash
  security find-generic-password -s 'Claude Code-credentials' -w
  ```
  Restituisce JSON con `accessToken`, `refreshToken`, `expiresAt`
- **Linux/WSL**: `~/.claude/.credentials.json`
- **Override**: env var `CLAUDE_CODE_OAUTH_TOKEN`

**Caveat importanti:**

- Endpoint **non documentato ufficialmente** — potrebbe cambiare
- Polling troppo frequente (< 60s) causa **429 persistenti**
- Anthropic potrebbe revocare token OAuth per app terze (precedente: issue #28091)
- Tool esistenti che usano lo stesso approccio: `claude-code-limit-tracker`, `claude-limitline`

---

## Strategia: Approccio Ibrido a Due Livelli

```text
Livello 1 (PRIMARIO): OAuth Usage API
  - Dati precisi di quota (%, reset time)
  - Funziona con qualsiasi piano
  - Zero calcoli da fare lato nostro

Livello 2 (FALLBACK + DETTAGLIO): Parsing JSONL
  - Breakdown per progetto, sessione, modello
  - Storico e trend
  - Stima costi
  - Funziona anche offline / senza token
```

I JSONL restano utili per il **dettaglio** (quale progetto consuma di piu', storico settimanale, costi), ma la **quota reale** viene dall'API OAuth.

---

## Piano di Sviluppo per Fasi

### Fase 1 — Integrazione OAuth Usage (fonte primaria)

**Priorita': CRITICA | Stima: 1 sessione**

**Obiettivo:** Leggere i dati di quota reali dall'endpoint OAuth, come fa `/usage`.

- [ ] **1.1** Creare `src/core/oauthClient.ts`:
  - Recuperare il token OAuth dal Keychain macOS (`security find-generic-password`)
  - Fallback: leggere da `~/.claude/.credentials.json` (Linux)
  - Fallback: env var `CLAUDE_CODE_OAUTH_TOKEN`
- [ ] **1.2** Implementare chiamata a `GET /api/oauth/usage`:
  - Headers: `Authorization: Bearer <token>`, `anthropic-beta: oauth-2025-04-20`
  - Parsing della risposta (`five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet`)
  - Gestione errori: 401 (token scaduto/invalido), 429 (rate limit), network errors
- [ ] **1.3** Gestire il refresh del token OAuth quando scade:
  - Leggere `refreshToken` e `expiresAt` dalle credenziali
  - Implementare refresh automatico se il token e' scaduto
- [ ] **1.4** Implementare polling intelligente:
  - Intervallo minimo: **120 secondi** (per evitare 429)
  - Polling solo quando VS Code e' in focus
  - Backoff esponenziale su errori
- [ ] **1.5** Aggiornare la status bar per mostrare i dati OAuth:
  - Formato: `5h: 37% | 7d: 26%`
  - Colori: verde (0-50%), giallo (50-80%), rosso (80%+)
  - Tooltip con dettaglio: reset time, breakdown opus/sonnet
- [ ] **1.6** Gestire gracefully il caso "token non disponibile":
  - Mostrare messaggio nella status bar: `Claude Tracker: login required`
  - Comando per forzare il re-read del token
  - Fallback automatico al Livello 2 (JSONL)

**File da creare:** `src/core/oauthClient.ts`, `src/core/credentialStore.ts`
**File da modificare:** `extension.ts`, `statusBarProvider.ts`, `types.ts`

---

### Fase 2 — Fix e Pulizia del Parser JSONL (fonte secondaria)

**Priorita': ALTA | Stima: 1 sessione**

**Obiettivo:** Rendere il parser JSONL affidabile come fonte di dettaglio (per progetto, modello, costi).

- [ ] **2.1** Rimuovere la logica di calcolo blocchi 5h dal parser — non serve piu' (la quota reale viene dall'OAuth)
- [ ] **2.2** Semplificare `usageAggregator.ts`: tenere solo `computeDaily`, `computeProjects`, `computeModels`
- [ ] **2.3** Fix parsing `cwd`: correlarlo dall'entry `user` precedente, non dall'entry `assistant`
- [ ] **2.4** Aggiungere logging diagnostico (VS Code output channel)
- [ ] **2.5** Gestire file JSONL grandi con streaming (`readline` o `createReadStream`)
- [ ] **2.6** Test unitari con dati JSONL realistici

**File coinvolti:** `usageAggregator.ts`, `jsonlParser.ts`, test files

---

### Fase 3 — Unificazione Dashboard

**Priorita': ALTA | Stima: 1 sessione**

**Obiettivo:** Riunire i dati OAuth (quota) e JSONL (dettaglio) in una dashboard coerente.

- [ ] **3.1** Ridisegnare il tab "Blocco 5h" con i dati OAuth:
  - Progress bar basata su `five_hour.utilization` (dato reale, non calcolato)
  - Countdown al reset basato su `five_hour.resets_at`
  - Nessun calcolo locale di percentuali
- [ ] **3.2** Aggiungere sezione "Limite Settimanale":
  - Progress bar per `seven_day.utilization`
  - Breakdown per modello (opus/sonnet) se disponibile
  - Countdown al reset settimanale
- [ ] **3.3** Mantenere tab "Settimana", "Progetti", "Modelli" alimentati dai JSONL:
  - Questi forniscono il dettaglio che l'OAuth non da'
  - Grafici giornalieri, breakdown per progetto, costi stimati
- [ ] **3.4** Aggiungere indicatore di stato della connessione:
  - `LIVE` = dati OAuth freschi
  - `OFFLINE` = solo dati JSONL (con warning)
  - Ultimo aggiornamento timestamp
- [ ] **3.5** Notifica VS Code al superamento soglie (80%, 95%)

**File coinvolti:** `webviewContent.ts`, `dashboardPanel.ts`, `sidebarProvider.ts`, `statusBarProvider.ts`

---

### Fase 4 — Cross-Platform e Robustezza

**Priorita': MEDIA | Stima: 1 sessione**

**Obiettivo:** Garantire funzionamento su macOS, Linux e Windows.

VS Code e' gia' cross-platform di suo — l'estensione gira ovunque VS Code giri. Le differenze sono solo nel recupero delle credenziali OAuth e nel path di `.claude`.

- [ ] **4.1** Credential retrieval per piattaforma:
  - **macOS**: `security find-generic-password -s 'Claude Code-credentials' -w`
  - **Linux**: `~/.claude/.credentials.json` (lettura diretta)
  - **Windows**: credenziali in `%APPDATA%\Claude Code\credentials` o Windows Credential Manager
- [ ] **4.2** Path `.claude` per piattaforma:
  - macOS/Linux: `~/.claude/projects/`
  - Windows: `%USERPROFILE%\.claude\projects\` o `%APPDATA%\claude\projects\`
- [ ] **4.3** Test su ciascuna piattaforma (almeno macOS + Linux)
- [ ] **4.4** Gestione errori platform-specific con messaggi chiari

**File coinvolti:** `credentialStore.ts`, `jsonlParser.ts`

---

### Fase 5 — Prezzi Dinamici e Configurazione

**Priorita': BASSA | Stima: 1 sessione**

**Obiettivo:** Rendere i prezzi aggiornabili e la configurazione completa.

- [ ] **5.1** Spostare tabella prezzi in `prices.json` bundled
- [ ] **5.2** Fetch opzionale dei prezzi da endpoint remoto (GitHub raw file) all'avvio
- [ ] **5.3** Override dei prezzi tramite settings utente
- [ ] **5.4** Implementare conversione EUR (setting gia' definito)
- [ ] **5.5** Aggiungere setting per intervallo di polling OAuth (min 120s)

**File coinvolti:** `costCalculator.ts`, `prices.json`, `package.json`

---

### Fase 6 — Polish e Pubblicazione

**Priorita': BASSA | Stima: 1 sessione**

- [ ] **6.1** Gestione errori migliorata con messaggi user-friendly
- [ ] **6.2** README con screenshot/GIF
- [ ] **6.3** Icona e branding per il marketplace
- [ ] **6.4** Pubblicazione su VS Code Marketplace
- [ ] **6.5** CHANGELOG e versioning semantico

---

## Ordine di Esecuzione

```text
Fase 1 (OAuth) ──→ Fase 2 (fix JSONL) ──→ Fase 3 (dashboard unificata)
                                         ──→ Fase 4 (cross-platform)
                                                    ──→ Fase 5 (prezzi)
                                                            ──→ Fase 6 (publish)
```

**Fase 1 e' il game-changer**: una volta che hai i dati reali dall'OAuth, il problema dei calcoli sbagliati sparisce completamente. I JSONL diventano solo una fonte di dettaglio, non la fonte di verita' per la quota.

---

## Note Tecniche

### Rate Limiting dell'endpoint OAuth

- Polling consigliato: ogni **2-5 minuti** (mai sotto i 60 secondi)
- Su 429: backoff esponenziale (2min, 4min, 8min, max 30min)
- Polling solo con VS Code in foreground (`vscode.window.state.focused`)

### Sicurezza del token OAuth

- Mai salvare il token in settings o file di configurazione dell'estensione
- Leggere sempre dal Keychain/credentials file al momento della richiesta
- Non loggare mai il token (neanche parzialmente)

### Progetti di riferimento

- [claude-code-limit-tracker](https://github.com/TylerGallenbeck/claude-code-limit-tracker) — stesso approccio OAuth
- [claude-limitline](https://github.com/tylergraydev/claude-limitline) — statusline con OAuth
- [Claude-Usage-Tracker](https://github.com/hamed-elfayome/Claude-Usage-Tracker) — app nativa macOS

### Rischio: endpoint non ufficiale

L'endpoint `/api/oauth/usage` non e' documentato. Mitigazioni:
1. Fallback automatico ai JSONL se l'endpoint smette di funzionare
2. Architettura a due livelli (OAuth + JSONL) — l'estensione funziona sempre
3. Monitorare le issue GitHub di Claude Code per cambiamenti
