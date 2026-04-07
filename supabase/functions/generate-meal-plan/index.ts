import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  })
}

// ---------------------------------------------------------------------------
// Rate limiting — in-memory, per isolate lifetime
// ---------------------------------------------------------------------------
interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitStore.get(ip)

  if (!entry || now >= entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return true
  }

  entry.count++
  return false
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface UserPreferences {
  diet: string
  allergies: string
  servings: string
  prepTime: string
  budget: string
  language: string
}

interface Meal {
  name: string
  prepTime: string
}

interface Day {
  day: string
  lunch: Meal
  dinner: Meal
}

interface UiLabels {
  lunch: string
  dinner: string
  yourMealPlan: string
  modifyPreferences: string
}

interface MealPlanResponse {
  days: Day[]
  labels: UiLabels
}

// ---------------------------------------------------------------------------
// Localisation
// ---------------------------------------------------------------------------

// Human-readable language name for the Claude prompt
const LANGUAGE_NAMES: Record<string, string> = {
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  pl: "Polish",
  sv: "Swedish",
  da: "Danish",
  fi: "Finnish",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ar: "Arabic",
}

// Static UI labels — deterministic, no LLM call needed
const UI_LABELS: Record<string, UiLabels> = {
  fr: {
    lunch: "Déjeuner",
    dinner: "Dîner",
    yourMealPlan: "Votre plan de repas",
    modifyPreferences: "← Modifier mes préférences",
  },
  es: {
    lunch: "Almuerzo",
    dinner: "Cena",
    yourMealPlan: "Tu plan de comidas",
    modifyPreferences: "← Modificar mis preferencias",
  },
  de: {
    lunch: "Mittagessen",
    dinner: "Abendessen",
    yourMealPlan: "Ihr Speiseplan",
    modifyPreferences: "← Präferenzen ändern",
  },
  it: {
    lunch: "Pranzo",
    dinner: "Cena",
    yourMealPlan: "Il tuo piano alimentare",
    modifyPreferences: "← Modifica preferenze",
  },
  pt: {
    lunch: "Almoço",
    dinner: "Jantar",
    yourMealPlan: "Seu plano de refeições",
    modifyPreferences: "← Modificar preferências",
  },
  nl: {
    lunch: "Lunch",
    dinner: "Diner",
    yourMealPlan: "Uw maaltijdplan",
    modifyPreferences: "← Voorkeuren aanpassen",
  },
  sv: {
    lunch: "Lunch",
    dinner: "Middag",
    yourMealPlan: "Din måltidsplan",
    modifyPreferences: "← Ändra preferenser",
  },
}

const DEFAULT_LABELS: UiLabels = {
  lunch: "Lunch",
  dinner: "Dinner",
  yourMealPlan: "Your meal plan",
  modifyPreferences: "← Modify my preferences",
}

function getUiLabels(language: string): UiLabels {
  const code = language.split("-")[0].toLowerCase()
  return UI_LABELS[code] ?? DEFAULT_LABELS
}

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------
const MODEL = "claude-sonnet-4-20250514"

const BUDGET_LABELS: Record<string, string> = {
  "<30": "less than €30",
  "30-50": "€30–50",
  "50-80": "€50–80",
  ">80": "more than €80",
}

function buildPrompt(prefs: UserPreferences): string {
  const prepLabel = prefs.prepTime === "60+" ? "more than 1 hour" : `${prefs.prepTime} minutes`
  const budgetLabel = BUDGET_LABELS[prefs.budget] ?? prefs.budget
  const langCode = prefs.language.split("-")[0].toLowerCase()
  const langName = LANGUAGE_NAMES[langCode] ?? "English"

  return `Generate a 7-day meal plan for ${prefs.servings} person(s) with these constraints:
- Diet: ${prefs.diet}
- Allergies / intolerances: ${prefs.allergies.trim() || "none"}
- Max preparation time per meal: ${prepLabel}
- Weekly grocery budget: ${budgetLabel}
- Output language: ${langName} — use localized day names (e.g. "Lundi" for French, "Lunes" for Spanish) and write all dish names in ${langName}.

Rules:
- Strictly respect all dietary and allergy constraints.
- No dish should repeat across the 7 days.
- Keep prep times realistic and within the constraint.
- Use varied cuisines and ingredients.

Respond with ONLY a valid JSON object — no markdown fences, no commentary, no extra keys.
The "days" array must contain exactly 7 entries, ordered Monday through Sunday using localized day names.
Use this exact structure:
{
  "days": [
    {
      "day": "<localized day name>",
      "lunch": { "name": "<dish name in ${langName}>", "prepTime": "20 min" },
      "dinner": { "name": "<dish name in ${langName}>", "prepTime": "35 min" }
    }
  ]
}`
}

async function callClaude(prefs: UserPreferences): Promise<MealPlanResponse> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured")

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system:
        "You are a professional nutritionist and chef. You create balanced, varied, and delicious meal plans tailored to dietary restrictions and budgets. You always respond with valid JSON only — never markdown, never prose.",
      messages: [{ role: "user", content: buildPrompt(prefs) }],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude API error ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  const rawText: string = data?.content?.[0]?.text ?? ""

  let parsed: { days: Day[] }
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error("Claude returned non-JSON output")
  }

  if (!Array.isArray(parsed?.days) || parsed.days.length !== 7) {
    throw new Error("Meal plan response has unexpected structure")
  }

  return {
    days: parsed.days,
    labels: getUiLabels(prefs.language),
  }
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  // Rate limit by IP
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"

  if (isRateLimited(ip)) {
    return jsonResponse({ error: "Too many requests. Please try again in an hour." }, 429)
  }

  // Validate body
  let prefs: UserPreferences
  try {
    const body = await req.json()
    const { diet, allergies, servings, prepTime, budget, language } = body

    if (!diet || !servings || !prepTime || !budget) {
      return jsonResponse(
        { error: "Missing required fields: diet, servings, prepTime, budget" },
        400,
      )
    }

    prefs = {
      diet: String(diet),
      allergies: String(allergies ?? ""),
      servings: String(servings),
      prepTime: String(prepTime),
      budget: String(budget),
      language: String(language || "en"),
    }
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400)
  }

  // Generate meal plan
  try {
    const result = await callClaude(prefs)
    return jsonResponse(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    const status = message.startsWith("Claude API error") ? 502 : 500
    return jsonResponse({ error: message }, status)
  }
})
