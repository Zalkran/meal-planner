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

---

### `get-recipe`

Returns a full recipe for a named dish.

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
