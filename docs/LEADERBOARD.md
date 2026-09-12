# Joining the leaderboard (optional)

`dsh-usage-unified` is **local by default**. Installing the plugin renders a
dashboard from your own session logs; it makes no network request and uploads
nothing. Putting your machine's combined usage on the
[tokscale](https://github.com/junhoyeo/tokscale) leaderboard is a separate,
**opt-in** step.

Run the guided setup:

```powershell
npm run leaderboard:setup
```

…or read the same steps below and do them by hand.

## What leaves the machine

tokscale submits **aggregates only**. Per its [privacy page](https://tokscale.ai/privacy)
and source, a submit contains:

- token counts, split by input / output / cache read / cache write / reasoning,
  with a per-day breakdown;
- estimated cost, derived from public pricing;
- message counts (never their content);
- client names (which tool) and **model names** (which model);
- **MCP server names** configured in your clients;
- session timing metrics (active time, longest continuous, max concurrent,
  session count);
- a random device key (`dev_…`) — the device *name* only if you set
  `TOKSCALE_DEVICE_NAME`; the CLI rejects an email-shaped name;
- the CLI version.

It **never** sends prompts, responses, source code, or workspace/file paths —
the submit payload has no such fields.

Two things cannot be redacted at upload, by tokscale's design:

- **model / provider names** — they are part of the public per-model breakdown.
  `modelAliases` in `settings.json` is local-only; its own source says it "can
  never rewrite the model identity that leaves the machine".
- **MCP server names** — always included, no toggle. Rename the servers in your
  MCP configs if those names are sensitive.

## Step by step

### 1. Install tokscale

```powershell
bun add -g tokscale@latest      # or: npm i -g tokscale
tokscale --version
```

### 2. Opt in (log in)

```powershell
tokscale login                  # opens GitHub OAuth in the browser
tokscale whoami                 # confirm the account
```

Skip this and nothing is ever uploaded.

### 3. Let tokscale see DSH and CC Switch

tokscale reads most agents (Claude Code, Codex, OpenCode) directly, but not:

- DSH's **versioned** `session.v<N>.jsonl.zstd` logs, and
- CC Switch's proxy-side Claude usage (tokscale reads the agent's local
  transcripts, which can be nearly empty).

Two exporters fill the gap, and their output is registered in
`%APPDATA%\tokscale\settings.json` under `scanner.extraScanPaths`:

```powershell
npm run tokscale:export          # .tokscale-home/  (versioned DSH logs only)
node scripts/ccswitch-export.mjs # .ccswitch-home/ (CC Switch claude only)
node scripts/custom-pricing.mjs  # price custom providers (optional, cost only)
```

`leaderboard:setup` runs all three for you.

### 4. First submit

```powershell
tokscale submit --dry-run        # preview: tokens, cost, clients, range
tokscale submit                  # upload
tokscale whoami                  # then check your rank on tokscale.ai
```

### 5. Keep it fresh (optional)

A daily task re-exports the two supplements and re-submits:

```powershell
Get-ScheduledTask -TaskName ai.tokscale.refresh | Select TaskName,State
```

## Turning it off

```powershell
npm run leaderboard:off          # removes the daily task, disables autosubmit
```

That stops future uploads. To erase what was already uploaded:

```powershell
tokscale delete-submitted-data   # answers: y / y / "delete my data"
```

## Non-Windows

The exporters are cross-platform (Node). Only the scheduled-task step
(`refresh-and-submit.ps1`) is Windows-specific; on macOS/Linux use tokscale's
own `tokscale autosubmit enable --interval 24h` after running the exporters
once, or add a cron/launchd job that calls them before `tokscale submit`.
