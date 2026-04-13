# CLAUDE.md — Meal Planner Project Context

## What this project is
AI-powered weekly meal plan generator.
Built by a solo product owner learning to ship a real web app 
with AI assistance (Claude Code + Claude API).

## Target users
French-speaking users who struggle to decide what to cook each 
week. App is multilingual — always detect and use the user's 
browser language (navigator.language).

## Business goal
Reach 100+ weekly active users within 3 months of launch.
No account required — friction zero is a core principle.

---

## Tech Stack

### Frontend
- React + Vite
- Tailwind CSS (mobile first, always)
- Deployed on Vercel (not yet done)
- Language: detect via navigator.language, pass to backend

### Backend
- Supabase Edge Functions (Deno runtime)
- verify_jwt = false (anonymous app, no auth)
- Rate limiting: 10 req/IP/hour on generate-meal-plan
- Rate limiting: 20 req/IP/hour on get-recipe

### AI
- Claude API (claude-sonnet-4-20250514)
- Called server-side ONLY — never from the browser
- API key stored in Supabase secrets as ANTHROPIC_API_KEY

### Secrets & env vars
- ANTHROPIC_API_KEY → Supabase secrets (never in frontend)
- PREWARM_SECRET → Supabase secrets (shared secret for internal pre-warm bypass)
- VITE_SUPABASE_URL → .env file (never committed to Git)
- VITE_SUPABASE_ANON_KEY → .env file (never committed to Git)

---

## Non-negotiable rules
- NEVER call Claude API directly from the frontend
- ALWAYS handle loading AND error states on any async operation
- ALWAYS mobile first with Tailwind
- ALWAYS use the user's browser language for generated content
- NEVER commit .env to Git
- ALWAYS redeploy Edge Functions with verify_jwt = false
- ALWAYS use the user's browser language (navigator.language) for every user-facing string — labels, buttons, messages, placeholders, errors. No hardcoded English. Pass the language to the Edge Function and let Claude API handle translation in its response.

## Code conventions
- One component per file in src/components/
- Functional React components only (no class components)
- Tailwind for all styling — no separate CSS files
- Conventional commits: feat / fix / chore / refactor / docs

---

## Project structure
meal-planner/
├── src/
│   ├── components/
│   │   ├── PreferencesForm.jsx   ← US-01 ✅
│   │   ├── MealPlan.jsx          ← US-02 (display bug to fix)
│   │   └── RecipeModal.jsx       ← not built yet
│   ├── lib/
│   │   └── supabase.js           ← Supabase client init
│   └── App.jsx                   ← main app state & routing
├── supabase/
│   └── functions/
│       ├── generate-meal-plan/   ← US-02 ✅ deployed
│       └── get-recipe/           ← not built yet
├── .claude/
│   └── PROGRESS.md               ← current status
│   └── WORKFLOW.md               ← AI collaboration preferences (read this too)
├── .env                          ← never committed
└── CLAUDE.md                     ← you are here

---

## Current status
See .claude/PROGRESS.md for detailed progress.

### Done
- ZAL-5: Enter dietary preferences ✅
- ZAL-6: Generate a 7-day meal plan ✅
- ZAL-10: Create the Supabase Edge Function ✅
- ZAL-11: Rate limit the Edge Function ✅
- ZAL-12: View full recipe detail for a meal ✅
- ZAL-16: Normalize recipes schema (recipes + recipe_translations) ✅
- ZAL-17: Update get-recipe to read/write normalized schema ✅
- ZAL-18: Pre-warm recipe cache after meal plan generation ✅
- ZAL-25: PREWARM_SECRET bypass for internal pre-warm calls ✅

### Backlog
- ZAL-7: Regenerate a single meal
- ZAL-8: Generate a consolidated shopping list
- ZAL-9: Check off and copy the shopping list

### Not yet in Linear
- Deploy frontend to Vercel
- Restrict CORS to Vercel domain (before public launch)

---

## Key architectural decisions

### Why Supabase Edge Function instead of direct API call
Claude API key must never be exposed in the browser.
Any user could open DevTools and steal the key.
Edge Function acts as a secure proxy. Decided session 1.

### Why no user accounts in v1
Friction zero = more users = better usage data.
Anonymous session storage only.
Auth can be added in v2 once concept is validated.

### Why Linear over GitHub Issues
Better PO experience, roadmap view, cycle management.
Linear is the single source of truth for all issues.

### Planned automation pipeline (not yet built)
Goal: automatically generate user stories from real user behaviour,
without manual observation or writing.

Stack:
- PostHog: tracks user events in the app (clicks, errors, drop-offs)
- n8n: orchestration layer — triggers on PostHog webhooks
- Claude API: receives the raw event data and writes a properly
  formatted user story from it
- Linear: receives the generated story as a new issue, ready to
  prioritize

Example flow:
1. PostHog detects that 80% of users drop off after clicking
   "Replace this meal" (ZAL-7)
2. n8n webhook fires and sends the event data to Claude API
3. Claude writes: "As a user, I want replacing a meal to feel
   faster, because the current loading time causes me to abandon
   the action"
4. Linear issue created automatically in the backlog

This pipeline is a v2 feature — to be built after public launch.

### Why verify_jwt = false
App is fully anonymous — no logged-in users, no JWT tokens.
Rate limiting is our protection layer instead.