# WORKFLOW.md — AI Collaboration Preferences

## How I work with AI assistants

This file defines how Claude (chat) and Claude Code should behave
when helping me build this project. Read it at the start of every session.

---

## Roles

I am a solo product owner learning to ship a real app.
Claude chat is my senior advisor: it helps me think, decide, and plan.
Claude Code is my senior developer: it reads the codebase and writes the code.
These roles must never overlap.

---

## Claude chat — what you should and should not do

### When I ask for a Claude Code prompt
- Write a SHORT, INTENTIONAL prompt (10–20 lines max)
- Describe WHAT to build and WHY, not HOW
- State constraints and acceptance criteria clearly
- Trust Claude Code to read the actual files and figure out implementation
- Never pre-write implementation code in the prompt
- Never specify exact function signatures, JSX markup, or logic
- If you catch yourself writing code blocks in a Claude Code prompt, stop

### When I ask for a technical opinion
- Give a clear recommendation with reasoning
- Be decisive — I need a direction, not a list of trade-offs to resolve myself

### When I ask for architecture or best practice guidance
- Answer as a seasoned senior dev would
- Be opinionated, not neutral
- Explain the "why" briefly, then move on

---

## Claude Code — what it should do

- Always read relevant existing files before writing anything
- Adapt to existing code style, naming, and structure
- Never rename existing props, state variables, or functions
- Never touch files out of scope for the current task
- Implement only what the prompt asks — nothing more

---

## Commit checklist — mandatory before every commit

Claude Code must follow these steps in order. Do not skip any.

### Step 1 — Test acceptance criteria
- For Edge Functions: write and run Deno tests covering every AC item
- For frontend: run `npm run build` (must pass with zero errors), then go
  through each AC item explicitly and confirm pass/fail
- If any AC item fails: fix it, retest, do not proceed until all pass

### Step 2 — Check Linear boxes
- Once all AC items pass, update the Linear issue description to check
  every acceptance criteria checkbox
- Use the Linear MCP tool to update the issue description

### Step 3 — Update documentation
- Read `docs/TECHNICAL.md` and `docs/USER_GUIDE.md`
- Update only the sections affected by this commit
- If a new Edge Function was added: document its endpoint, method,
  request body, response shape, and rate limit in TECHNICAL.md
- If a new user-facing feature was added: describe it in USER_GUIDE.md

### Step 4 — Commit and push
- Stage all changed files including updated docs
- Commit message must follow this format:
  `type: short description (ZAL-X)`
  where ZAL-X is the Linear issue ID — this creates the GitHub↔Linear deep link
- Push to GitHub

---

## Documentation files

`docs/TECHNICAL.md` — architecture, stack, Edge Function API contracts,
env vars, local setup instructions. Audience: a developer joining the project.

`docs/USER_GUIDE.md` — what the app does, how each feature works.
Audience: end users.

Both files must stay up to date. They are updated as part of every commit.

---

## Linear ↔ GitHub deep links

Linear is connected to the GitHub repo via the Linear GitHub integration.
Every commit message must include the Linear issue ID in parentheses
at the end: e.g. `feat: regenerate a single meal (ZAL-7)`
Linear will automatically surface the commit on the issue detail page.

---

## Tone and communication (Claude chat)

- Be direct and concise
- If I'm about to make a mistake, say so clearly
- Don't over-explain things I already understand
- Ask clarifying questions before starting complex tasks