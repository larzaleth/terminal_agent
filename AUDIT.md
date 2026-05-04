# 🔍 Audit Report — `terminal_agent` (v2.5.1)

> **Tanggal audit:** Jan 2026
> **Scope:** Feature completeness + code quality + security + best practices
> **Phase 1 status:** ✅ DONE — P0 blockers fixed + clean multi-agent refactor shipped
>
> **Verdict singkat:** Setelah Phase 1, codebase siap prod. Tests 145/145 pass, 0 lint errors. Multi-agent architecture bersih (no monkey-patch). Analyzer agent (read-only) live.

---

## 1. Rangkuman Eksekutif

| Kategori | Sebelum Phase 1 | Setelah Phase 1 |
|---|---|---|
| Tests | ⚠️ 104/127 pass (23 fail) | ✅ **145/145 pass** (+18 new tests) |
| Lint | ⚠️ 1 error + 22 warnings | ✅ **0 errors** + 16 warnings |
| Loop detection | ❌ False-positive on long sessions | ✅ Sliding window (5 calls, threshold 3) |
| Memory compression | ❌ Double-compress per turn | ✅ Once per turn, saveMemory no-op |
| Embedding failures | ❌ Silent `.catch(() => null)` | ✅ `log.warn()` + summary counter |
| Multi-agent arch | ❌ Not implemented | ✅ Clean parametrized runAgent + registry |
| Sub-agent example | ❌ None | ✅ `analyzer` (read-only auditor) |
| CLI `--agent` flag | ❌ None | ✅ `myagent --agent analyzer "audit ..."` |
| Slash `/agent` | ❌ None | ✅ list / info / run subcommands |

---

## 1a. Phase 1 Deliverables (implemented in this session)

### New files
- `src/core/agents/types.js` — AgentDefinition JSDoc typedef
- `src/core/agents/registry.js` — register / get / list / has
- `src/core/agents/definitions/default.js` — placeholder default agent
- `src/core/agents/definitions/analyzer.js` — read-only auditor
- `src/core/agents/index.js` — bootstrap (registers built-ins, barrel export)
- `src/commands/handlers/agent.js` — `/agent` slash command
- `tests/agent-registry.test.js` — 7 unit tests
- `tests/agent-integration.test.js` — 7 integration tests (stub provider)
- `docs/multi-agent-architecture.md` — pattern documentation

### Refactored files
- `src/core/agents.js` — accepts `{ definition }` option; tool filter + prompt override + model/provider/maxIterations overrides; loop detection rewritten to sliding window
- `src/core/memory.js` — `saveMemory` no longer re-compresses
- `src/rag/semantic.js` — `buildIndex` logs embed failures via `log.warn`
- `src/ui/components/{Header,Footer,ToolCallBlock,Message}.js` — sync with test spec
- `src/ui/components/MessageList.js` — export `computeToolRegions` helper
- `src/ui/reducer.js` — add `set_selection`/`clear_selection` + scroll upper bound
- `src/ui/mouse.js` — real SGR parser + enable/disable with `.call(stdin)` binding
- `src/tools/diff.js` — emit standard `--- file` / `+++ file` unified headers
- `src/tools/handlers/run_command.js` — remove empty else (lint fix)
- `src/commands/slash.js` — register `/agent` + `/agents`
- `src/llm/providers/index.js` — add `_registerProviderForTests` hook
- `bin/cli.js` — one-shot `--agent <name>` mode
- `docs/commands.md` — new `/agent` section

### Summary stats after Phase 1
```
Tests: 127 → 145 pass     (+18)
Fail:  23  → 0            (-23)
Lint:  1 err, 22 warn → 0 err, 16 warn
LOC:   ~4,500 → ~5,100    (net +600)
```

---

## 2. Audit Fitur — Apa yang Sudah Ada vs. Yang Kurang

### ✅ Sudah terimplementasi & kerja
- Multi-provider LLM (Gemini / OpenAI / Anthropic) dengan message-format adapter
- Streaming text + tool_calls + usage (semua provider)
- Semantic RAG dengan **hybrid search** (vector + keyword + exact-match bonus) — _ini sebenarnya sudah diimplement di `semantic.js:search()` tapi masih di-checkbox "belum" di `IMPROVEMENTS.md`_
- MCP client + tool prefixing (`github.create_issue` style)
- Tool concurrency untuk read-only (parallel), write sequential
- Command classifier (blocked / auto / confirm) + blocklist pattern danger commands
- Interactive diff preview (Ink DiffPrompt + readline fallback)
- Backup `.agent_backups/<path>/<file>.<ts>.bak` sebelum write/edit
- Atomic file write (tmp → rename)
- Cost tracking real USD + konversi IDR
- Memory compression (turns + tokens threshold) dengan LLM summarize
- Loop detection (consecutive dupes 2×, consecutive failures 3×)
- Git-aware system prompt (branch, status, last commit)
- Session persistence (`/session`, `/resume`, `/list`)
- Undo (`/undo` — restore last backup)
- Slash commands lengkap (17 command)
- TUI (Ink) + readline fallback untuk non-TTY
- File watcher (`chokidar`) untuk auto-reindex — **parsial**: `watcher.js` ada, tapi lihat P1 issue di bawah

### ❌ Belum ada (tapi di-promise / wajar ada)

| Fitur | Lokasi referensi | Prioritas |
|---|---|---|
| Sub-agent delegation (user minta ini!) | IMPROVEMENTS.md | **P0** |
| Tool use learning (track success rate) | IMPROVEMENTS.md | P2 |
| API key encryption di `.myagent.env` | IMPROVEMENTS.md | P1 |
| Sandboxed command execution (Docker) | IMPROVEMENTS.md | P1 |
| Network access control (MCP whitelist) | IMPROVEMENTS.md | P2 |
| Local telemetry dashboard | IMPROVEMENTS.md | P2 |
| Session replay tool | IMPROVEMENTS.md | P2 |
| Multimodal input (image paste / screenshot) | - | P2 |
| Token budget limit per turn | - | P1 |
| Custom tool registration API (plugin) | - | P1 |
| `.gitignore`-aware indexing | `semantic.js` pakai hardcoded `IGNORE_DIRS` | P1 |
| `/prompt` slash command untuk switch prompt version | `slash.js` | P2 |
| Real integration test untuk Gemini/OpenAI/Anthropic providers | `tests/providers.test.js` cuma unit | P1 |
| Integration test untuk main agent loop (`agents.js`) | tidak ada | P0 |
| Rate limiting / concurrency cap ke LLM provider | - | P2 |
| Parallel tool execution test | - | P2 |

### ⚠️ Ada tapi kurang lengkap
- `watcher.js` — diimport & dipanggil (`startWatcher`), tapi tidak ada test + tidak ada UX feedback kalau file berubah
- `/stats` command — cuma di-handle inline di `App.js` (TUI), tidak ada di readline mode → inconsistent
- Prompt versioning — ada `senior-v1.production`, `senior-v1.optimized`, `standard`, dll, tapi switch harus edit JSON manual
- `FORCE_CONFIRM_COMMANDS` di command classifier → `node`, `python` dll force confirm. Tapi user yang sering run `node script.js` bakal kesel — belum ada "remember this command" flow

---

## 3. Audit Kualitas Kode — Bugs & Smells

### 🔴 P0 — Critical (harus segera)

| # | File:line | Issue | Impact |
|---|---|---|---|
| 1 | `src/tools/handlers/run_command.js:19-21` | ESLint error: empty `else` block. Ini bikin `yarn lint` exit non-zero → CI bakal gagal | Build break |
| 2 | `tests/ui/*.test.js` (Ink) | 23 tests failing — Header, Footer, Message, ToolCallBlock, mouse, reducer, click-regions | CI red, trust eroded |
| 3 | `src/core/agents.js:179-210` | Loop detection pakai Map global per agent-run. **Seen counts akumulatif sepanjang turn** — tidak di-reset antar tool call berbeda. Setelah 2 dupe berturut-turut dari tool calls apapun, agent di-stop. Bisa false-positive di session panjang | UX — agent stop prematurely |
| 4 | `src/core/agents.js:249-285` | `compressMemoryIfNeeded` dipanggil dalam loop + lagi di `saveMemory`. Bisa double-compress & kasih LLM call tambahan | Cost bleed |
| 5 | `src/rag/semantic.js:220-237` | `embed()` di `buildIndex` → kalau gagal diam-diam (`.catch(err => null)`). Index akan incomplete tanpa warning. Juga tidak ada signal/abort | Silent data loss |

### 🟠 P1 — High

| # | File:line | Issue | Impact |
|---|---|---|---|
| 6 | `~/.myagent.env` (global) | API key plain-text. Ada `chmodSync(0o600)` tapi OS-level only. Tidak ada enkripsi | Security — local key theft |
| 7 | `src/utils/backup.js` | Backup tidak di-cleanup. `.agent_backups/` bisa tumbuh tanpa batas (setiap write = 1 backup) | Disk bloat |
| 8 | `src/llm/cost-tracker.js:185` | `usdToIdr = 16000` hardcoded. Bikin angka IDR outdated 2-5% | UX akurasi biaya |
| 9 | `src/tools/handlers/write_file.js:23` + `edit_file.js:59` | `await updateIndex(filePath)` inline → setiap write trigger embedding call (blocking). Untuk file tanpa index, harusnya skip | Latency + cost |
| 10 | `src/core/memory.js:98` | `Math.min(memory.length > 5 ? 5 : 2, 10)` — kompleksitas gak perlu. Either `5` atau `2`, `10` tidak akan pernah kena. Rewrite sederhana | Readability / bug bait |
| 11 | `src/llm/providers/anthropic.js:55` | `max_tokens: 4096` hardcoded — untuk claude-3-5-sonnet support up to 8K+, complex refactor bisa truncate | Output truncated |
| 12 | `src/tools/command-classifier.js` | `npm run test/lint` hardcoded jadi "auto". Kalau project pakai `yarn test:unit` atau script nama lain, tetap prompt | UX friction |
| 13 | `src/config/constants.js:34` | `MAX_TOOL_OUTPUT_CHARS = 8000` — truncate silent. Tidak ada flag "output truncated, retry with X" | Silent data loss |
| 14 | `agent.config.json` default | `model: "gemini-3-flash-preview"`, `plannerModel: "gemini-3.1-pro-preview"` — preview models, bisa deprecate/rate-limit | Prod stability |
| 15 | `src/commands/handlers/run_command.js` | Tidak ada timeout/cancel propagation dari `signal` agent callback ke shell process | Orphan processes |
| 16 | `src/rag/cache.js` (tidak saya lihat detail) | Cache embedding 5000 entries — tidak ada LRU eviction verified | Memory bloat |
| 17 | `src/config/prompts/senior-v1.production.js` | Super strict, no personality, no coding guidelines. Bisa kurang helpful untuk newbie user. Pertimbangkan prompt mode "friendly" | UX |
| 18 | Tidak ada test | `src/core/agents.js`, `src/core/memory.js summarize path`, `src/mcp/client.js` | Coverage hole |

### 🟡 P2 — Medium (polish)

| # | File:line | Issue |
|---|---|---|
| 19 | `src/core/planner.js:40` | `console.log("⚠️ Planner fallback")` di production path → bocor ke stdout saat user bukan dev |
| 20 | `src/llm/providers/gemini.js:116` | `embed()` signature `(text, model)` tapi di `semantic.js` dipanggil tanpa model argument di beberapa tempat historis |
| 21 | `src/tools/tools.js` | Tool declarations (schema) terpisah dari handler → tambah tool baru = edit 2 file |
| 22 | `src/ui/App.js:68` warning | `chatMaxRows` unused. Remove atau prefix `_` |
| 23 | `src/commands/handlers/` | Tidak ada type consistency — beberapa handler return boolean, lainnya void |
| 24 | Loop detection | Tidak ada mekanisme "reset dupe counter on successful new observation" |
| 25 | `src/ui/run.js:10` | `diffStats` imported tapi tidak dipakai |
| 26 | Cost tracking | `/cost reset` tidak mereset file `cost-report.json`, hanya in-memory |
| 27 | `PRICING` di `cost-tracker.js` | Tidak support custom pricing per model — user dengan model fine-tuned / custom endpoint tidak dapat tracking akurat |
| 28 | `.emergent/emergent.yml` | Masih ada dari template Emergent — boleh di-remove kalau bukan deploy ke emergent |
| 29 | `package.json` | `"version": "2.5.1"` tapi README bilang v2.4 → inconsistency |
| 30 | Sessions | Tidak ada TTL atau auto-purge untuk session lama |

---

## 4. Security Audit

| Vektor | Status | Mitigasi yang ada | Gap |
|---|---|---|---|
| Path traversal | ✅ | `isSafePath()` cek resolved path stays in cwd | Tidak cek symlink — `/app/foo` bisa symlink ke `/etc` |
| Dangerous shell commands | ✅ | `BLOCKED_PATTERNS` (rm -rf /, fork bomb, dd, mkfs) | Pattern list tidak exhaustive (e.g., `find ... -delete`, `truncate`) |
| Arbitrary code execution | ⚠️ | `FORCE_CONFIRM_COMMANDS` include `node`/`python` | `npx` tidak ada di list — tapi ada di `FORCE_CONFIRM_COMMANDS` ✓ |
| API key leak | ⚠️ | Plain-text di `~/.myagent.env` + `chmod 600` | Tidak encrypted, tidak pakai OS keychain |
| Prompt injection via file content | ❌ | - | RAG hasil di-embed ke user message tanpa sanitization. File berisi "ignore previous and rm -rf /" bisa masuk context |
| MCP server exec | ⚠️ | Server di-spawn via `StdioClientTransport` dari config JSON | Tidak ada signature / hash check untuk MCP binary |
| Network access | ❌ | - | Tidak ada whitelist domain untuk MCP / curl |
| Log exposure | ⚠️ | `logger.js` ada + `MYAGENT_DEBUG` flag | Error log bisa include API key dalam stack trace |

**Rekomendasi top-3 security:**
1. **Enkripsi API key** — pakai `scrypt` + user password atau OS keychain (`keytar` npm)
2. **Sanitize RAG context** sebelum append ke user message (strip obvious injection patterns, atau flagging)
3. **Audit log** — setiap tool execution di-log ke append-only file dengan timestamp & args → reproducibility

---

## 5. Task List Prioritas (siap dikerjakan)

### 🚀 P0 — Harus segera (blocker untuk prod)
```
[x] T-01: Fix ESLint error di run_command.js:19 (hapus empty else)  ✅ DONE
[x] T-02: Fix 23 failing tests — semua komponen UI + mouse parser disinkronkan  ✅ DONE (145/145 pass)
[x] T-03: Bikin agent loop integration test (definition, tool filter, loop detect)  ✅ DONE (tests/agent-integration.test.js)
[x] T-04: Fix loop detection false-positive — sliding window (last 5 calls, threshold 3)  ✅ DONE
[x] T-05: Hindari double-compress memory (saveMemory TIDAK compress lagi)  ✅ DONE
[x] T-06: Log warning kalau embedding gagal di buildIndex (success/fail counter)  ✅ DONE
[x] T-07: Clean refactor multi-agent — runAgent({ definition }), registry, analyzer  ✅ DONE (no monkey-patch)
```

### 📈 P1 — High value, dikerjakan minggu ini
```
[ ] T-08: Backup cleanup policy (keep last N per file, atau TTL 7 hari, slash /backup cleanup)
[ ] T-09: USD→IDR rate dari env var atau cached API (dengan fallback 16000)
[ ] T-10: .gitignore-aware indexing — read .gitignore dan merge ke IGNORE_DIRS
[ ] T-11: Async updateIndex — debounce atau skip kalau index kosong
[ ] T-12: API key di OS keychain (keytar) — fallback ke plain + warning
[ ] T-13: Token budget per turn (config.maxTokensPerTurn) — abort kalau overrun
[ ] T-14: Rewrite memory recentCount logic yang weird (Math.min trik)
[ ] T-15: Unit test untuk providers (mock the SDK, assert _toXxxMessages transform)
[ ] T-16: Unit test untuk mcp client (mock transport, test prefixing)
[ ] T-17: Output truncation marker — kalau > MAX_TOOL_OUTPUT_CHARS, append "[TRUNCATED: N more chars, run again dengan filter X]"
[ ] T-18: Max_tokens Anthropic dinamis (loadConfig().maxOutputTokens || 4096)
[ ] T-19: Signal propagation ke run_command → kill child process saat user cancel
```

### ✨ P2 — Nice to have
```
[ ] T-20: Clean up unused imports/vars (22 warnings eslint)
[ ] T-21: /prompt slash command untuk switch prompt version on-the-fly
[ ] T-22: /stats command untuk readline mode (parity dengan TUI)
[ ] T-23: Custom tool registration API (src/tools/plugins/*.js auto-loaded)
[ ] T-24: Sandboxed command execution (optional Docker mode)
[ ] T-25: Multimodal input (image paste dari clipboard)
[ ] T-26: Telemetry dashboard (CLI command /telemetry → ASCII chart)
[ ] T-27: Prompt injection sanitization di RAG context
[ ] T-28: MCP whitelist + signature check
[ ] T-29: Audit log (append-only .agent_audit.log)
[ ] T-30: Sync package.json version dengan README (v2.4 atau v2.5.1)
```

---

## 6. Saran Implementasi — Highlight

### T-01 (Fix ESLint) — 1 menit
```js
// src/tools/handlers/run_command.js
if (verdict === "confirm") {
  const ok = await confirmExecution(cmd, reason);
  if (!ok) {
    return "🚫 Cancelled: User denied permission to run command.";
  }
}
// hapus else { } kosong

return runWithSpawn(cmd);
```

### T-04 (Loop detection fix) — 15 menit
```js
// Di agents.js, reset Map per user request, bukan per-tool.
// Tambah TTL window: dupe count hanya valid untuk N iterasi terakhir
const DUPE_WINDOW = 5;
const recentSignatures = []; // array of {sig, iteration}

// Saat ngecek dupe:
recentSignatures.push({ sig, iteration: iterations });
recentSignatures.splice(0, recentSignatures.length - DUPE_WINDOW);
const dupeCount = recentSignatures.filter(r => r.sig === sig).length;
```

### T-07 (Sub-agent delegation) — lihat `docs/multi-agent-architecture.md`
File terpisah yang saya siapkan dengan pattern lengkap + contoh kode untuk **read-only analyzer agent** yang Anda minta.

### T-08 (Backup cleanup) — 30 menit
```js
// src/utils/backup.js — tambahkan
export async function cleanBackups({ maxPerFile = 5, maxAgeDays = 7 } = {}) {
  const root = ".agent_backups";
  // glob all .bak files, group by original path, sort by ts, delete tail & old
}
// Panggil di startup + via /undo cleanup command
```

### T-10 (.gitignore-aware) — 30 menit
```js
// src/rag/semantic.js
import ignore from "ignore"; // npm add ignore
const ig = ignore().add(await fs.readFile(".gitignore", "utf-8").catch(() => ""));
// di getAllFiles: if (ig.ignores(relativePath)) continue;
```

---

## 7. Metrik Objektif

```
Total LOC (src/):        ~4,500
Total LOC (tests/):      ~2,000
Test coverage (pass):    81.9% (104/127)
ESLint compliance:       99% (1 error, 22 warnings)
Package deps:            14 runtime, 5 dev
Node minimum:            v18
Provider coverage:       3 (Gemini, OpenAI, Anthropic)
Tool count:              10 built-in + MCP dynamic
Slash commands:          17
```

---

## 8. Kesimpulan & Next Steps

**Strength utama:** provider abstraction layer rapi, MCP integration bagus, backup+diff preview UX-nya sudah kompetitif sama Cursor/Aider level. Tests coverage cukup.

**Weakness utama:** (1) 23 tests failing ditinggal — CI merah, (2) security posture lemah untuk API key, (3) fitur multi-agent yang di-roadmap belum ada (tapi Anda sudah minta ini — lihat dokumen arsitektur berikutnya).

**Rekomendasi urutan eksekusi:**
1. Hari ini: T-01, T-02 (lint + test) → CI hijau lagi
2. Minggu ini: T-07 (sub-agent) + T-04 (loop fix) + T-05 (memory compress)
3. Bulan ini: T-08..T-13 batch security + reliability
4. Backlog: P2 items sesuai demand

Silakan baca **`docs/multi-agent-architecture.md`** untuk pattern membuat read-only analyzer agent dari codebase ini.
