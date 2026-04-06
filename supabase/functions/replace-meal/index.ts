import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Rate limiting: 20 req/IP/hour
  const clientIp = req.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimitKey = `replace-meal:${clientIp}`;
  const RATE_LIMIT = 20;
  const windowMs = 60 * 60 * 1000;

  const rateLimitStore = (globalThis as any).__rateLimitStore ?? {};
  (globalThis as any).__rateLimitStore = rateLimitStore;

  const now = Date.now();
  if (!rateLimitStore[rateLimitKey]) {
    rateLimitStore[rateLimitKey] = { count: 0, windowStart: now };
  }
  const entry = rateLimitStore[rateLimitKey];
  if (now - entry.windowStart > windowMs) {
    entry.count = 0;
    entry.windowStart = now;
  }
  if (entry.count >= RATE_LIMIT) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  entry.count++;

  // Parse & validate body
  let body: {
    dayLabel: string;
    mealType: string;
    currentPlan: { day: string; meals: { type: string; dish: string }[] }[];
    preferences: { diet: string; allergies: string; people: number };
    language: string;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { dayLabel, mealType, currentPlan, preferences, language } = body;

  if (!dayLabel || !mealType || !currentPlan || !preferences || !language) {
    return new Response(
      JSON.stringify({ error: "Missing required fields." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Build dedup list from existing plan
  const existingDishes = currentPlan
    .flatMap((day) => day.meals.map((m) => m.dish))
    .join(", ");

  // Call Claude API
  const anthropic = new Anthropic({
    apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
  });

  const prompt = `You are a meal planning assistant. A user wants to replace a single meal in their weekly plan.

User preferences:
- Diet: ${preferences.diet}
- Allergies: ${preferences.allergies}
- Number of people: ${preferences.people}

Meal to replace:
- Day: ${dayLabel}
- Meal type: ${mealType}

Existing dishes already in the plan (DO NOT suggest any of these):
${existingDishes}

Respond in this language: ${language}

Return ONLY a valid JSON object with this exact shape, no markdown, no explanation:
{"dish": "<name of the new meal>"}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = (message.content[0] as { type: string; text: string }).text.trim();

    let parsed: { dish: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(
        JSON.stringify({ error: "AI returned unexpected format.", raw }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ dish: parsed.dish }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Claude API error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to generate replacement meal." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
