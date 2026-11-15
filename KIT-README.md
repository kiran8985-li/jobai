# JobPilot AI – Claude Code kit

Everything you need to build JobPilot AI on your own computer with Claude Code.

## What is in this folder

| File | What it is |
| --- | --- |
| `CLAUDE.md` | Project brief and rules. Claude Code reads it automatically every session. |
| `AGENTS.md` | Same brief as `CLAUDE.md`, for Codex (and other coding agents) that look for this file name. Keep the two in sync. |
| `PROMPTS.md` | 13 prompts (Prompt 0 to 12; 12 is the browser extension, do it last). Paste them in order, one per phase. |
| `.env.example` | Every setting the app needs, with comments. |
| `reference/` | Working Python from an earlier prototype: CV parser, skill matcher, job-source connectors, AI client, and a sample CV. For Claude Code to port to TypeScript. |

## Before you start (about 30 minutes)

1. Install Node.js (a current LTS version) and Git on your laptop.
2. Install Claude Code by following the current steps in the Claude Code documentation: https://docs.claude.com
3. Create the free accounts and keep the keys somewhere safe:
   - Supabase: https://supabase.com (new project; copy the Project URL, anon key and service role key)
   - Adzuna: https://developer.adzuna.com (App ID and App Key)
   - Reed: https://www.reed.co.uk/developers (API key)
   - Resend: https://resend.com (API key; only needed for live sending)
   - DeepSeek: your existing API key and the exact model ID from its dashboard
4. Make a GitHub account if you do not have one (needed for the 15-minute scheduler and for hosting later).

## Start

1. Make a new empty folder, for example `jobpilot`, and copy everything from this kit into it.
2. Copy `.env.example` to `.env.local` and fill in what you have. Leave the rest empty; the demo job source and
   the offline fallbacks mean the app runs without most keys.
3. Open a terminal in that folder and run `claude`.
4. Paste **Prompt 0** from `PROMPTS.md`. (Using Codex instead? Open it in the same folder and paste the same prompts; it reads `AGENTS.md`.) When it is done and checked, commit, then paste Prompt 1, and so on.

## Rules of thumb

- Keep `APPLY_MODE=dry_run` until you have reviewed several prepared applications by hand.
- Never paste real keys into chats or commit `.env.local`.
- If a phase goes wrong, ask Claude Code to explain what it did and revert with git; do not stack fixes.
- Test with your own CV first, then your 8–10 testers.

## Beta checklist

- [ ] 8–10 IT testers invited, one invite each; each ticks the consent box (CV text processed by DeepSeek, servers in China)
- [ ] Optional: email privacy@deepseek.com to opt out of training
- [ ] You review the first prepared applications by hand before any tester goes live
- [ ] Success measure agreed: at least half get a reply or interview, no wrong applications
- [ ] Dry run reviewed for at least a week of scans
- [ ] Match threshold agreed (default 75)
- [ ] Privacy page, data export and delete working
- [ ] Spend limits set on the DeepSeek and Resend accounts
