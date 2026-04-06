/**
 * Tests for get-recipe Edge Function — ZAL-14 cache behaviour
 *
 * AC coverage:
 *   AC2 — get-recipe checks cache before calling Claude
 *   AC3 — cache hit returns recipe without calling Claude API
 *   AC4 — cache miss calls Claude, writes result to DB, returns recipe
 *   AC5 — failed cache write does not block response; error is logged only
 */

import { stub } from "jsr:@std/testing/mock"
import { assertEquals } from "jsr:@std/assert"

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const MOCK_RECIPE = {
  name: "Gratin dauphinois",
  prepTime: "15 min",
  cookTime: "45 min",
  servings: 2,
  ingredients: [{ name: "Pommes de terre", quantity: "600 g" }],
  steps: ["Éplucher les pommes de terre.", "Enfourner 45 min."],
}

// DB row shape (snake_case columns)
const MOCK_DB_ROW = {
  name: MOCK_RECIPE.name,
  prep_time: MOCK_RECIPE.prepTime,
  cook_time: MOCK_RECIPE.cookTime,
  servings: MOCK_RECIPE.servings,
  ingredients: MOCK_RECIPE.ingredients,
  steps: MOCK_RECIPE.steps,
}

// Claude API response envelope
const CLAUDE_RESPONSE = {
  content: [{ text: JSON.stringify(MOCK_RECIPE) }],
}

function makePostRequest(body: unknown): Request {
  return new Request("https://edge.supabase.co/functions/v1/get-recipe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Capture the Deno.serve handler before importing the module
// ---------------------------------------------------------------------------
let handler: (req: Request) => Promise<Response>

const serveStub = stub(
  Deno,
  "serve",
  (h: unknown) => {
    handler = h as (req: Request) => Promise<Response>
    return { finished: Promise.resolve() } as unknown as Deno.HttpServer<Deno.NetAddr>
  },
)

const envStub = stub(Deno.env, "get", (key: string): string | undefined => {
  const vars: Record<string, string> = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    ANTHROPIC_API_KEY: "test-api-key",
  }
  return vars[key]
})

await import("./index.ts")
serveStub.restore()
envStub.restore()

// ---------------------------------------------------------------------------
// AC2 + AC3: cache hit — returns recipe without calling Claude
// ---------------------------------------------------------------------------
Deno.test("cache hit: returns recipe without calling Claude", async () => {
  let claudeCalled = false

  const fetchStub = stub(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = input.toString()

    if (url.includes("supabase.co")) {
      // Supabase maybeSingle() returns a single object (not an array) when Content-Type is application/vnd.pgrst.object+json
      return new Response(JSON.stringify(MOCK_DB_ROW), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (url.includes("anthropic.com")) {
      claudeCalled = true
      throw new Error("Claude must not be called on a cache hit")
    }

    throw new Error(`Unexpected fetch: ${url}`)
  })

  try {
    const res = await handler(
      makePostRequest({ dishName: "Gratin dauphinois", language: "fr", servings: 2 }),
    )
    const body = await res.json()

    assertEquals(res.status, 200)
    assertEquals(body.name, MOCK_RECIPE.name)
    assertEquals(body.prepTime, MOCK_RECIPE.prepTime)
    assertEquals(body.cookTime, MOCK_RECIPE.cookTime)
    assertEquals(body.servings, MOCK_RECIPE.servings)
    assertEquals(claudeCalled, false, "Claude API must not be called on cache hit")
  } finally {
    fetchStub.restore()
  }
})

// ---------------------------------------------------------------------------
// AC2 + AC4: cache miss — calls Claude, writes to DB, returns recipe
// ---------------------------------------------------------------------------
Deno.test("cache miss: calls Claude, writes to cache, returns recipe", async () => {
  let claudeCalled = false
  let dbWriteCalled = false

  const fetchStub = stub(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = input.toString()
    const method = (input instanceof Request ? input.method : "GET")

    if (url.includes("supabase.co")) {
      if (method === "POST") {
        // Cache write (upsert)
        dbWriteCalled = true
        return new Response(JSON.stringify([]), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        })
      }
      // Cache read — miss (empty body, 200 with PGRST 406 or null body)
      return new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (url.includes("anthropic.com")) {
      claudeCalled = true
      return new Response(JSON.stringify(CLAUDE_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    throw new Error(`Unexpected fetch: ${url}`)
  })

  try {
    const res = await handler(
      makePostRequest({ dishName: "Poulet rôti", language: "fr", servings: 4 }),
    )
    const body = await res.json()

    assertEquals(res.status, 200)
    assertEquals(body.name, MOCK_RECIPE.name)
    assertEquals(claudeCalled, true, "Claude API must be called on cache miss")

    // Give the fire-and-forget write time to settle
    await new Promise((r) => setTimeout(r, 50))
    assertEquals(dbWriteCalled, true, "Cache write must be attempted after Claude responds")
  } finally {
    fetchStub.restore()
  }
})

// ---------------------------------------------------------------------------
// AC5: failed cache write does not block the response
// ---------------------------------------------------------------------------
Deno.test("cache write failure: response still returned, error only logged", async () => {
  const fetchStub = stub(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = input.toString()
    const method = (input instanceof Request ? input.method : "GET")

    if (url.includes("supabase.co")) {
      if (method === "POST") {
        // Simulate DB write failure
        return new Response(JSON.stringify({ message: "DB error", code: "500" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }
      // Cache miss
      return new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (url.includes("anthropic.com")) {
      return new Response(JSON.stringify(CLAUDE_RESPONSE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    throw new Error(`Unexpected fetch: ${url}`)
  })

  try {
    const res = await handler(
      makePostRequest({ dishName: "Ratatouille", language: "fr", servings: 2 }),
    )
    const body = await res.json()

    // Recipe is still returned despite the write failure
    assertEquals(res.status, 200)
    assertEquals(body.name, MOCK_RECIPE.name)

    // Allow the fire-and-forget to resolve (should not throw)
    await new Promise((r) => setTimeout(r, 50))
  } finally {
    fetchStub.restore()
  }
})
