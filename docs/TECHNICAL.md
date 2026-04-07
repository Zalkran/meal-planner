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

The `ANTHROPIC_API_KEY` is stored as a Supabase secret and is never placed in `.env`.

### Deploy an Edge Function

```bash
supabase functions deploy <function-name> --no-verify-jwt
```

---

## Edge Functions

All functions accept `POST` requests with a JSON body and return JSON. CORS is open (`*`) for all origins during development — restrict to the Vercel domain before public launch.

---

### `generate-meal-plan`

Generates a 7-day meal plan based on user preferences. The response is streamed as Server-Sent Events (SSE) — the frontend receives and renders each day as soon as it is ready, rather than waiting for the full response.

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

**Response — SSE stream (`text/event-stream`)**

The function emits three event types over the stream:

```
event: labels
data: {"lunch":"Déjeuner","dinner":"Dîner","yourMealPlan":"Votre plan de repas","modifyPreferences":"← Modifier mes préférences"}

event: day
data: {"day":"Lundi","lunch":{"name":"Soupe de lentilles","prepTime":"20 min"},"dinner":{"name":"Gratin dauphinois","prepTime":"45 min"}}

event: error
data: {"message":"<server-side reason>"}
```

| Event | When emitted | Notes |
|---|---|---|
| `labels` | Immediately, before Claude is called | UI strings resolved from a static lookup — no AI latency |
| `day` | As each day is parsed from the Claude stream | Emitted 7 times total, one per day in order |
| `error` | On any failure | Stream closes after this event; 0–6 `day` events may have already arrived |

**Streaming implementation**

Claude is called with `stream: true`. The Edge Function accumulates the raw text delta chunks and uses a string-aware brace-depth parser to detect complete day JSON objects. Each valid object is emitted as a `day` event immediately. The parser tracks characters inside quoted strings to avoid miscounting `{`/`}` that appear in dish names.

> **i18n note:** `labels` covers the static meal-plan UI strings (`lunch`, `dinner`, `yourMealPlan`, `modifyPreferences`). The replace-meal button strings and app-level error messages are handled client-side via `src/lib/i18n.js` using `navigator.language`, so they do not appear in this response.

---

### `get-recipe`

Returns a full recipe for a named dish. Responses are cached in the `recipes_cache` Supabase table — a cache hit returns instantly without calling Claude API.

**Cache behaviour**

1. Normalise the key: lowercase + trim `dishName`, extract base language tag (e.g. `"fr"` from `"fr-FR"`), clamp `servings` to 1–8.
2. Query `recipes_cache` for `(dish_name, servings, language)`.
3. **Hit** — return the cached row immediately; Claude is never called.
4. **Miss** — call Claude, return the recipe, write to cache in the background (fire-and-forget). A write failure is logged but never surfaced to the caller.

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

### `recipes_cache`

Caches Claude API recipe responses to avoid redundant calls. Populated automatically by `get-recipe` on cache miss.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint (identity) | Primary key |
| `dish_name` | text | Lowercased, trimmed dish name |
| `servings` | integer (1–8) | Number of servings |
| `language` | text | Base language tag (`"fr"`, `"en"`, etc.) |
| `name` | text | Localised dish name as returned by Claude |
| `prep_time` | text | e.g. `"15 min"` |
| `cook_time` | text | e.g. `"45 min"` |
| `ingredients` | jsonb | Array of `{ name, quantity }` objects |
| `steps` | jsonb | Array of step strings |
| `created_at` | timestamptz | Set on insert, defaults to `now()` |

**Unique constraint:** `(dish_name, servings, language)` — used as the cache key. Upserts with `ignoreDuplicates: true` make concurrent writes safe.

---

## Frontend i18n

All user-facing strings in the frontend are language-aware. There are two sources:

| Source | Strings covered | How |
|---|---|---|
| Edge Function response (`labels`) | Day names, meal-type labels, plan header, modify-preferences button | Resolved from a static lookup table keyed by language |
| `src/lib/i18n.js` — `getReplaceMealStrings` | Replace-meal button, replacing spinner text, replace-error message | Resolved client-side from `navigator.language` |
| `src/lib/i18n.js` — `getAppStrings` | General error message, rate-limit error message | Resolved client-side from `navigator.language` |

Both functions in `src/lib/i18n.js` map the base language tag (`fr`, `de`, `en`) and fall back to English for any unmapped language. No hardcoded strings remain in the UI.

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
