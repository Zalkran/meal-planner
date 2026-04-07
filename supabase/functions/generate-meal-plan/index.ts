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
// Claude API prompt
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

// ---------------------------------------------------------------------------
// String-aware brace-depth parser
//
// Scans accumulated text and extracts complete JSON objects that appear at
// depth 2 inside the outer {"days":[...]} envelope (depth 0 = outside, 1 =
// inside the root object, 2 = inside the "days" array).
//
// String-awareness: characters inside quoted strings (including escaped
// quotes) are never counted as brace/bracket delimiters, preventing dish
// names like "Gratin {maison}" from corrupting the depth counter.
// ---------------------------------------------------------------------------
function extractNextDay(text: string, searchFrom: number): { json: string; end: number } | null {
  let depth = 0
  let inString = false
  let escaped = false
  let objectStart = -1

  for (let i = searchFrom; i < text.length; i++) {
    const ch = text[i]

    if (escaped) {
      escaped = false
      continue
    }
    if (ch === "\\" && inString) {
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (ch === "{" || ch === "[") {
      // A day object sits at depth 2: inside the outer { and inside the [ array.
      // Only open a capture window when we see { at exactly that depth.
      if (ch === "{" && depth === 2) objectStart = i
      depth++
    } else if (ch === "}" || ch === "]") {
      depth--
      // Closing } that returns us to depth 2 completes a day object.
      if (ch === "}" && depth === 2 && objectStart !== -1) {
        return { json: text.slice(objectStart, i + 1), end: i + 1 }
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// ---------------------------------------------------------------------------
// Streaming request handler
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

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (!apiKey) {
    return jsonResponse({ error: "ANTHROPIC_API_KEY is not configured" }, 500)
  }

  // Build the SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      function emit(event: string, data: unknown) {
        controller.enqueue(encoder.encode(sseEvent(event, data)))
      }

      // Emit labels immediately — no Claude call needed
      emit("labels", getUiLabels(prefs.language))

      // Call Claude with streaming enabled
      let claudeResponse: Response
      try {
        claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 2048,
            stream: true,
            system:
              "You are a professional nutritionist and chef. You create balanced, varied, and delicious meal plans tailored to dietary restrictions and budgets. You always respond with valid JSON only — never markdown, never prose.",
            messages: [{ role: "user", content: buildPrompt(prefs) }],
          }),
        })
      } catch (err) {
        emit("error", { message: "Failed to reach Claude API" })
        controller.close()
        return
      }

      if (!claudeResponse.ok) {
        emit("error", { message: `Claude API error ${claudeResponse.status}` })
        controller.close()
        return
      }

      // Read the Claude SSE stream, accumulate text_delta chunks
      const reader = claudeResponse.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ""
      let parseOffset = 0
      let daysEmitted = 0

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          // Claude streams SSE — extract text_delta content from each event
          const chunk = decoder.decode(value, { stream: true })
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue
            const payload = line.slice(6)
            if (payload === "[DONE]") continue
            try {
              const event = JSON.parse(payload)
              if (event?.type === "content_block_delta" && event?.delta?.type === "text_delta") {
                accumulated += event.delta.text
              }
            } catch {
              // Malformed SSE line — skip and continue
            }
          }

          // Try to extract complete day objects from accumulated text
          while (true) {
            const result = extractNextDay(accumulated, parseOffset)
            if (!result) break

            parseOffset = result.end

            let day: Day
            try {
              day = JSON.parse(result.json)
            } catch {
              emit("error", { message: "Received malformed day data from Claude" })
              controller.close()
              return
            }

            if (!day.day || !day.lunch?.name || !day.dinner?.name) {
              emit("error", { message: "Received incomplete day data from Claude" })
              controller.close()
              return
            }

            emit("day", day)
            daysEmitted++

            if (daysEmitted === 7) break
          }

          if (daysEmitted === 7) break
        }
      } catch (err) {
        emit("error", { message: "Stream interrupted" })
        controller.close()
        return
      }

      if (daysEmitted < 7) {
        emit("error", { message: "Meal plan generation was incomplete" })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      ...CORS_HEADERS,
    },
  })
})
