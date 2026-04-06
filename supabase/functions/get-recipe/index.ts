import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

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
// Rate limiting — 20 requests per IP per hour
// ---------------------------------------------------------------------------
interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()
const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitStore.get(ip)

  if (!entry || now >= entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }

  if (entry.count >= RATE_LIMIT_MAX) return true

  entry.count++
  return false
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RecipeRequest {
  dishName: string
  language: string
  servings: number
}

interface Ingredient {
  name: string
  quantity: string
}

interface Recipe {
  name: string
  prepTime: string
  cookTime: string
  servings: number
  ingredients: Ingredient[]
  steps: string[]
}

// ---------------------------------------------------------------------------
// Language helpers
// ---------------------------------------------------------------------------
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

function getLanguageName(language: string): string {
  const code = language.split("-")[0].toLowerCase()
  return LANGUAGE_NAMES[code] ?? "English"
}

// ---------------------------------------------------------------------------
// Supabase client (service role — cache reads/writes bypass RLS)
// ---------------------------------------------------------------------------
function getSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) throw new Error("Supabase env vars not configured")
  return createClient(url, key)
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------
function normalizeCacheKey(req: RecipeRequest): { dish_name: string; servings: number; language: string } {
  return {
    dish_name: req.dishName.toLowerCase().trim(),
    servings: req.servings,
    language: req.language.split("-")[0].toLowerCase(),
  }
}

async function getCachedRecipe(req: RecipeRequest): Promise<Recipe | null> {
  const key = normalizeCacheKey(req)
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from("recipes_cache")
    .select("name, prep_time, cook_time, servings, ingredients, steps")
    .eq("dish_name", key.dish_name)
    .eq("servings", key.servings)
    .eq("language", key.language)
    .maybeSingle()

  if (error || !data) return null

  return {
    name: data.name,
    prepTime: data.prep_time,
    cookTime: data.cook_time,
    servings: data.servings,
    ingredients: data.ingredients as Ingredient[],
    steps: data.steps as string[],
  }
}

async function writeCachedRecipe(req: RecipeRequest, recipe: Recipe): Promise<void> {
  const key = normalizeCacheKey(req)
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from("recipes_cache")
    .upsert(
      {
        dish_name: key.dish_name,
        servings: key.servings,
        language: key.language,
        name: recipe.name,
        prep_time: recipe.prepTime,
        cook_time: recipe.cookTime,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
      },
      { onConflict: "dish_name,servings,language", ignoreDuplicates: true },
    )

  if (error) {
    console.error("Cache write failed:", error.message)
  }
}

// ---------------------------------------------------------------------------
// Claude prompt
// ---------------------------------------------------------------------------
const MODEL = "claude-sonnet-4-20250514"

function buildPrompt(req: RecipeRequest): string {
  const langName = getLanguageName(req.language)

  return `Generate a complete recipe for "${req.dishName}" for ${req.servings} serving(s).

Write everything in ${langName} — ingredient names, step descriptions, and time labels.
Scale all ingredient quantities exactly for ${req.servings} serving(s).

Respond with ONLY a valid JSON object — no markdown fences, no commentary, no extra keys.
Use this exact structure:
{
  "name": "Dish name in ${langName}",
  "prepTime": "15 min",
  "cookTime": "25 min",
  "servings": ${req.servings},
  "ingredients": [
    { "name": "Ingredient name", "quantity": "200 g" }
  ],
  "steps": [
    "Step description",
    "Step description"
  ]
}

Requirements:
- Include all ingredients with precise quantities for ${req.servings} serving(s).
- Write 4–8 clear, concise step descriptions.
- prepTime and cookTime must be realistic strings like "15 min" or "1h 10 min".
- Use common measurements (g, ml, tbsp, tsp, cups, pieces, etc.).`
}

async function callClaude(req: RecipeRequest): Promise<Recipe> {
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
      max_tokens: 1024,
      system:
        "You are a professional chef. You write precise, complete recipes with accurate quantities and clear instructions. You always respond with valid JSON only — never markdown, never prose.",
      messages: [{ role: "user", content: buildPrompt(req) }],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude API error ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  const rawText: string = data?.content?.[0]?.text ?? ""

  let parsed: Recipe
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error("Claude returned non-JSON output")
  }

  if (
    !parsed?.name ||
    !Array.isArray(parsed?.ingredients) ||
    !Array.isArray(parsed?.steps) ||
    parsed.ingredients.length === 0 ||
    parsed.steps.length === 0
  ) {
    throw new Error("Recipe response has unexpected structure")
  }

  return parsed
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"

  if (isRateLimited(ip)) {
    return jsonResponse({ error: "Too many requests. Please try again in an hour." }, 429)
  }

  let recipeReq: RecipeRequest
  try {
    const body = await req.json()
    const { dishName, language, servings } = body

    if (!dishName) {
      return jsonResponse({ error: "Missing required field: dishName" }, 400)
    }

    recipeReq = {
      dishName: String(dishName),
      language: String(language || "en"),
      servings: Math.max(1, Math.min(8, Number(servings) || 2)),
    }
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400)
  }

  try {
    const cached = await getCachedRecipe(recipeReq)
    if (cached) {
      return jsonResponse(cached)
    }

    const recipe = await callClaude(recipeReq)

    writeCachedRecipe(recipeReq, recipe).catch((err) => {
      console.error("Cache write error (non-blocking):", err)
    })

    return jsonResponse(recipe)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    const status = message.startsWith("Claude API error") ? 502 : 500
    return jsonResponse({ error: message }, status)
  }
})
