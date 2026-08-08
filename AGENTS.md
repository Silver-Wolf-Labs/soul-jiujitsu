# AGENTS.md — Soul Jiu-Jitsu Gym Portal

Guidance for coding agents working in this repo.

## Project

Next.js 15 (App Router) + Supabase (Postgres + RLS) + Tailwind v3. No payment
processor — the profe collects payment in person; the app records which plan
each member is on. Prices are stored as `price_cents` and displayed in colones
(`src/lib/currency.ts`).
Deployed via Amplify (`amplify.yml`) with a Vercel config also present.

```
src/app/          Routes: landing, team, blog, join, waiver, kiosk, portal,
                  admin, super-admin, auth, api
src/components/   landing/ admin/ member/ kiosk/ analytics/ signature/ ui/
src/lib/          Business logic; actions/ = server actions (mutations),
                  supabase/ = client+server setup, validations/ = zod schemas
src/lib/__tests__ Vitest specs (pure functions only)
supabase/         schema.sql, seed.sql, migrations/
scripts/          One-off ops scripts (smoke-test, bootstrap-gym)
docs/             Runbook, hardening sprint HLD/handoff, account security
```

Gym branding (name, tagline, contact, social, timezone) comes from
`src/lib/gym-profile.ts`, which reads DB overrides from `site_settings` and
falls back to in-file defaults. Read it from there rather than hardcoding
gym-specific strings in components.

This repo was forked from the MGD Dallas portal (`Silver-Wolf-Labs/mgdjj`) and
re-skinned. Values still marked `TODO_*` are unset placeholders — see SETUP.md.
`npx tsx scripts/smoke-test.ts` fails on any `TODO_` or leftover MGD string in
rendered HTML; treat a hit as a real bug, not noise.

## Commands

```bash
npm run dev          # next dev on :3000
npm run build        # next build
npm run lint         # eslint (next/core-web-vitals + next/typescript)
npm run test         # vitest run
npm run test:watch   # vitest watch
```

## Conventions

- TypeScript `strict` is on. Import via the `@/*` alias, not deep relative paths.
- Tests cover pure functions only — no DB or network in Vitest.
  Vitest excludes `.claude/worktrees/**` so parallel agent worktrees don't
  report against stale code.
- Mutations go through server actions in `src/lib/actions/`, validated with zod
  schemas from `src/lib/validations/`.
- Security-sensitive reads (kiosk PIN/session token) are gated by RLS and
  `SECURITY DEFINER` RPCs — do not widen `site_settings` read policies.
- Never commit secrets. `.env.local.example` documents required env vars.
- Run `npm run lint` and `npm run test` before reporting work complete.
- Vitest needs Node >= 22 (`styleText` from `node:util`). Node 21 fails at
  startup before any test runs.
- Known pre-existing failures inherited from upstream: two colour tests
  (`constants.test.ts`, `pricing-colors.test.ts`) assert hex strings but the
  code now returns `var(--color-*)` CSS variables. Unrelated to branding.

---

# Herdr

Source: [`skills/herdr/SKILL.md` @ v0.8.0](https://github.com/herdrdev/herdr/blob/v0.8.0/skills/herdr/SKILL.md).
Verified against the locally installed `herdr 0.8.0`. Regenerate with
`herdr --skill` — the installed binary is the authority, not this file.

Use only when the user explicitly mentions Herdr or asks to inspect/control
panes, tabs, workspaces, commands, or another agent. Do **not** use it merely
because a task could benefit from a background terminal, delegation, or
parallel work.

## Gate

Before any control command, verify you are inside a Herdr-managed pane:

```bash
test "${HERDR_ENV:-}" = 1
```

If it fails, say you are not running inside Herdr and stop. Do not control a
focused Herdr session from outside Herdr.

## Discover the CLI

```bash
herdr --help
herdr agent      # group without subcommand prints its usage
herdr pane
herdr workspace
herdr tab
herdr worktree
herdr terminal
herdr notification
herdr integration
herdr session
```

Do not run bare `herdr` — it launches or attaches the TUI. Do not probe a
mutating nested command by omitting arguments; `herdr workspace create` is
valid with defaults and will execute.

Most control commands return JSON. Read identifiers and state from those
responses instead of predicting them.

## Panes vs agents

- Workspace / tab / pane topology organizes terminal locations.
- **Pane** commands control raw terminals, shells, tests, servers, I/O.
- **Agent** commands control the recognized coding agent occupying a pane.

A pane exists whether or not it contains an agent. `agent start` requires an
existing available shell pane and never creates, splits, or moves layout. Use
pane commands for ordinary processes; agent commands when Herdr must validate
agent identity or interpret lifecycle state.

Agent targets accept a unique live agent name or the pane ID currently hosting
it — not terminal IDs or bare agent-kind labels. Names match
`[a-z][a-z0-9_-]{0,31}` and must be unique among live agents. A name follows
the pane occupant and clears when that agent exits, is released, or is replaced.

Lifecycle states:

- `idle` — ready for input, and its tab has been seen in the focused UI.
- `done` — the same idle state after *unseen* background work finishes.
- `blocked` — Herdr recognized an approval or question UI.
- `unknown` — an agent is present but unclassified; **not** proof of completion.

Focusing the tab, or targeting the pane/agent with a focus command, marks it
seen. CLI reads do not.

## IDs and caller context

Public IDs are opaque stable handles: workspace `w1`, tab `w1:t1`, pane `w1:p1`.
Closed tab/pane IDs are never reused. A pane moved to another workspace gets a
new workspace-qualified ID: after `pane move`, continue with
`.result.move_result.pane.pane_id` or the live agent name. The old value appears
as `.result.move_result.previous_pane_id`; only the moved process's inherited
caller context still resolves it, so don't use it as a general agent target.

Herdr injects caller context into each managed pane:

```bash
printf '%s\n' "$HERDR_WORKSPACE_ID" "$HERDR_TAB_ID" "$HERDR_PANE_ID"
```

Prefer `--current` when a pane command should target the calling pane. Omitting
a target may hit the UI-focused pane, which can belong to the user or another
client.

```bash
herdr workspace list
herdr tab list --workspace "$HERDR_WORKSPACE_ID"
herdr pane current --current
herdr pane list --workspace "$HERDR_WORKSPACE_ID"
herdr agent list
```

Creation responses expose the next IDs: `workspace create` returns
`.result.workspace`, `.result.tab`, `.result.root_pane`; `tab create` returns
`.result.tab` and `.result.root_pane`; `pane split` returns `.result.pane`.

## Start and coordinate an agent

Default to a sibling pane in the current tab and the current working directory.
Do not create a workspace, tab, worktree, or different cwd unless explicitly
requested.

Honor a user-requested direction. Otherwise inspect the caller pane:

```bash
herdr pane layout --pane "$HERDR_PANE_ID"
```

Split a wide pane `right`, a narrow or tall pane `down`. Avoid repeated
same-direction splits that create unusably narrow columns or short rows. Keep
focus in the calling pane and preserve the caller's cwd:

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
```

Read the new pane ID from `.result.pane.pane_id`.

An available shell pane must be at its interactive prompt — shell in the
foreground, no foreground command, editor, or agent running.

```bash
herdr agent start reviewer --kind claude --pane <returned-pane-id>
```

Use the kind the user asked for; run `herdr agent` for the installed kind list.
Pass native agent arguments only after `--`:

```bash
herdr agent start reviewer --kind claude --pane <returned-pane-id> -- <agent-args...>
```

`agent start` returns only after Herdr detects the expected agent in the same
pane and considers it ready for input. Default startup timeout: 30s.

Submit work through the agent surface:

```bash
herdr agent prompt reviewer "Review the current diff and report only actionable findings." --wait --timeout 120000
```

`agent prompt` atomically submits text plus encoded Enter, honoring the pane's
live bracketed-paste mode. For normal work `--wait` is enough — it waits for the
first settled `idle`, `done`, or `blocked`. Do not restate those defaults with
`--until`.

A prompt sent from a non-working state must produce an observed lifecycle change
within five seconds, else Herdr returns `agent_prompt_stalled` rather than
waiting indefinitely. The wait tracks lifecycle state, not an individual turn:
if the agent is already working, completion of the active turn may satisfy it.

Use `--until` only for a state-specific workflow, e.g. waiting for an
already-running agent to request input:

```bash
herdr agent wait reviewer --until blocked --timeout 120000
```

Without `--until`, standalone `agent wait` uses the same settled-state defaults.

Logical keys drive interactive agent UI controls (all keys are validated before
any bytes are written):

```bash
herdr agent send-keys reviewer esc
herdr agent send-keys reviewer ctrl+c
```

Read results through the resolved agent:

```bash
herdr agent get reviewer
herdr agent read reviewer --source recent-unwrapped --lines 120
```

If a wait fails or returns `blocked`, inspect `agent get` and `agent read`
before deciding what to send. Use the pane surface only when raw terminal
control is intentional.

## Run an ordinary command in another pane

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
# read .result.pane.pane_id, then:
herdr pane run <returned-pane-id> "npm run test"
herdr pane wait-output <returned-pane-id> --match "Test Files" --timeout 120000
herdr pane read <returned-pane-id> --source recent-unwrapped --lines 120
```

`pane run` atomically sends command text and Enter. `pane wait-output` searches
the selected snapshot immediately, so pre-existing output can match. Use
`--match <text>` for a literal substring or `--regex <pattern>` for a Rust
regex. Omitting `--timeout` allows an indefinite wait.

Read sources:

- `visible` — the currently rendered viewport.
- `recent` — recent rendered output, including soft wraps.
- `recent-unwrapped` — soft wraps joined; prefer for logs and transcripts.
- `detection` — plain-text bottom-buffer snapshot used for agent detection.
  Available on `agent read` only; `pane read` accepts the first three.

Use `--format ansi` when colors and styling are evidence; otherwise text.

`--lines` asks for more rows from the pane's screen and host scrollback. If
raising it reveals no more of a completed response, the pane is probably running
the agent on the terminal's alternate screen — rows leaving the alternate screen
never enter host scrollback, so a larger count cannot recover them. Only *after*
that failed read, ask the agent to write its full response as Markdown in a temp
directory and reply with just the path, then read the file. Fallback only; don't
request file output in the initial prompt.

## Safety and coordination

- Use `--no-focus` for background work unless asked to switch context.
- Target `--current`, an explicit pane ID, or a unique agent name. Never rely on
  another client's focused pane.
- Parse IDs from JSON. Do not derive them from sidebar order or examples.
- Do not close workspaces, tabs, panes, or sessions you did not create unless
  explicitly asked.
- Never run `herdr server stop` from an active session unless the user
  explicitly intends to stop the server and its pane processes.
- Never kill the main Herdr process. Use named test sessions for experiments
  needing an isolated server.
- Server errors are JSON on stderr with exit status 1. Syntax errors exit 2.
