# Technical Documentation

## Project overview

AI-powered weekly meal plan generator. Users enter dietary preferences and receive a personalised 7-day plan with lunch and dinner for each day. Individual meals can be replaced, and full recipes can be viewed on demand. No account required.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 8, Tailwind CSS 4 |
| Backend | Supabase Edge Functions (Deno runtime) |
| AI | Claude API — `claude-sonnet-4-20250514` |
| Hosting (frontend) | Vercel (not yet deployed) |
| Hosting (backend) | Supabase (deployed) |

All Claude API calls are made server-side only. The API key is never exposed to the browser.

---

## Local setup

### Prerequisites

- Node.js 18+
- Supabase CLI (`npm install -g supabase`)

### Steps

```bash
# 1. Install frontend dependencies
npm install

# 2. Create .env file (never commit this)
cp .env.example .env   # or create manually — see below

# 3. Start the dev server
npm run dev
```

### Environment variables

Create a `.env` file at the project root:

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

Both values are found in your Supabase project under **Settings → API**.

The following secrets are stored in Supabase (via `supabase secrets set`) and are never placed in `.env`:

| Secret | Used by | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `get-recipe`, `generate-meal-plan` | Authenticates calls to the Claude API |
| `PREWARM_SECRET` | `generate-meal-plan` (sender), `get-recipe` (receiver) | Shared secret that lets internal pre-warm calls bypass the `get-recipe` rate limiter. Set to any long random string. Without it, pre-warm calls are rate-limited under the shared `"unknown"` IP bucket. |

### Deploy an Edge Function

```bash
supabase functions deploy <function-name> --no-verify-jwt
```

---

## Edge Functions

All functions accept `POST` requests with a JSON body and return JSON. CORS is open (`*`) for all origins during development — restrict to the Vercel domain before public launch.

---

### `generate-meal-plan`

Generates a 7-day meal plan based on user preferences.

**Rate limit:** 10 requests / IP / hour

**Request body**

```json
{
  "diet": "vegetarian",
  "allergies": "gluten",
  "servings": "2",
  "prepTime": "30",
  "budget": "30-50",
  "language": "fr"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `diet` | string | yes | e.g. `"omnivore"`, `"vegetarian"`, `"vegan"` |
| `allergies` | string | yes | Free text; empty string if none |
| `servings` | string | yes | Number of people |
| `prepTime` | string | yes | Max minutes per meal; `"60+"` means over 1 hour |
| `budget` | string | yes | One of `"<30"`, `"30-50"`, `"50-80"`, `">80"` (€/week) |
| `language` | string | yes | BCP 47 tag, e.g. `"fr"`, `"en-US"` |

**Response (200)**

```json
{
  "days": [
    {
      "day": "Lundi",
      "lunch": { "name": "Soupe de lentilles", "prepTime": "20 min" },
      "dinner": { "name": "Gratin dauphinois", "prepTime": "45 min" }
    }
  ],
  "labels": {
    "lunch": "Déjeuner",
    "dinner": "Dîner",
    "yourMealPlan": "Votre plan de repas",
    "modifyPreferences": "← Modifier mes préférences"
  }
}
```

`days` always contains exactly 7 entries. Day names and dish names are localised to the requested language. `labels` contains UI strings for the frontend in the same language.

> **i18n note:** `labels` covers the static meal-plan UI strings (`lunch`, `dinner`, `yourMealPlan`, `modifyPreferences`). The replace-meal button strings (`replaceMeal`, `replacing`, `replaceError`) are handled client-side via `src/lib/i18n.js` using `navigator.language`, so they do not appear in this response.

**Recipe cache pre-warming**

After the meal plan response is returned to the caller, `generate-meal-plan` fires a background job (via `EdgeRuntime.waitUntil`) that calls `get-recipe` for all 14 dishes (7 days × lunch + dinner) in parallel using `Promise.allSettled`. This pre-populates the `recipes` and `recipe_translations` tables so that when the user opens any recipe, the cache is already warm and Claude is never called. A failure for any individual dish is logged and does not affect the others or the meal plan response.

---

### `get-recipe`

Returns a full recipe for a named dish. Responses are cached in the normalized `recipes` / `recipe_translations` tables — a cache hit returns instantly without calling Claude API.

**Cache behaviour**

1. Normalise the key: lowercase + trim `dishName` → `canonical_name`; extract base language tag (e.g. `"fr"` from `"fr-FR"`); clamp `servings` to 1–8.
2. Query `recipes` for a row matching `canonical_name`.
3. If found, query `recipe_translations` for `(recipe_id, language, servings)`.
4. **Hit** — return the translation row immediately; Claude is never called.
5. **Miss** — call Claude, return the recipe to the caller immediately, then fire-and-forget in the background:
   a. Upsert into `recipes` on `canonical_name` (on conflict do nothing, then fetch the `id`).
   b. Upsert into `recipe_translations` on `(recipe_id, language, servings)` (on conflict do nothing).
   A write failure is logged but never surfaced to the caller.

**Rate limit:** 20 requests / IP / hour

**Request body**

```json
{
  "dishName": "Gratin dauphinois",
  "language": "fr",
  "servings": 2
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `dishName` | string | yes | Dish name as it appears in the meal plan |
| `language` | string | yes | BCP 47 tag |
| `servings` | number | no | Defaults to 2, clamped to 1–8 |

**Response (200)**

```json
{
  "name": "Gratin dauphinois",
  "prepTime": "15 min",
  "cookTime": "45 min",
  "servings": 2,
  "ingredients": [
    { "name": "Pommes de terre", "quantity": "600 g" }
  ],
  "steps": [
    "Éplucher et trancher finement les pommes de terre.",
    "..."
  ]
}
```

---

### `replace-meal`

Suggests a single replacement dish for one meal slot, avoiding all dishes already in the plan.

**Rate limit:** 20 requests / IP / hour

**Request body**

```json
{
  "dayLabel": "Lundi",
  "mealType": "lunch",
  "currentPlan": [
    {
      "day": "Lundi",
      "meals": [
        { "type": "lunch", "dish": "Soupe de lentilles" },
        { "type": "dinner", "dish": "Gratin dauphinois" }
      ]
    }
  ],
  "preferences": {
    "diet": "vegetarian",
    "allergies": "",
    "people": 2
  },
  "language": "fr"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `dayLabel` | string | yes | Localised day name matching the plan |
| `mealType` | string | yes | `"lunch"` or `"dinner"` |
| `currentPlan` | array | yes | Full plan used to deduplicate suggestions |
| `preferences` | object | yes | `diet`, `allergies`, `people` |
| `language` | string | yes | BCP 47 tag |

**Response (200)**

```json
{ "dish": "Ratatouille" }
```

---

## Database

The recipe cache uses a normalized two-table schema. The former flat `recipes_cache` table has been renamed to `recipes_cache_deprecated` and is no longer written to.

### `recipes`

One row per canonical dish name (lowercased, trimmed). Acts as the lookup key shared across all languages and serving counts.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint (identity) | Primary key |
| `canonical_name` | text | Lowercased, trimmed dish name — lookup key |
| `created_at` | timestamptz | Defaults to `now()` |

**Unique constraint:** `canonical_name`

---

### `recipe_translations`

One row per dish × language × serving count. Foreign-keyed to `recipes`.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint (identity) | Primary key |
| `recipe_id` | bigint | FK → `recipes.id`, `ON DELETE CASCADE` |
| `language` | text | Base language tag (`"fr"`, `"en"`, etc.) |
| `servings` | integer (1–8) | Number of servings |
| `name` | text | Localised dish name as returned by Claude |
| `prep_time` | text | e.g. `"15 min"` |
| `cook_time` | text | e.g. `"45 min"` |
| `ingredients` | jsonb | Array of `{ name, quantity }` objects |
| `steps` | jsonb | Array of step strings |
| `created_at` | timestamptz | Defaults to `now()` |

**Unique constraint:** `(recipe_id, language, servings)` — cache key. Concurrent writes are safe via upsert with `ignoreDuplicates: true`.

---

### `recipes_cache_deprecated`

Legacy flat table — renamed from `recipes_cache` during the ZAL-16 migration. Kept for rollback safety; not written to by any current function.

---

## Frontend i18n

All user-facing strings in the frontend are language-aware. There are two sources:

| Source | Strings covered | How |
|---|---|---|
| Edge Function response (`labels`) | Day names, meal-type labels, plan header, modify-preferences button | Generated by Claude API in the requested language |
| `src/lib/i18n.js` | Replace-meal button, replacing spinner text, replace-error message | Resolved client-side from `navigator.language` |

`getReplaceMealStrings(lang)` in `src/lib/i18n.js` maps the base language tag (`fr`, `de`, `en`) and falls back to English for any unmapped language. No hardcoded English strings remain in the UI.

---

## Error responses

All functions return errors in the same shape:

```json
{ "error": "<message>" }
```

| Status | Meaning |
|---|---|
| 400 | Missing or invalid request body |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
| 502 | Claude API returned an unexpected response |
