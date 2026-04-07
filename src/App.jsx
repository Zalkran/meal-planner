import { useState, useRef } from 'react'
import PreferencesForm from './components/PreferencesForm'
import MealPlan from './components/MealPlan'
import RecipeModal from './components/RecipeModal'
import { supabase } from './lib/supabase'
import { getAppStrings } from './lib/i18n'

function App() {
  const [mealPlan, setMealPlan] = useState(null)
  const [preferences, setPreferences] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Incremented on each new generation and on reset — stale stream callbacks
  // check this ref before updating state, so they silently bail out.
  const generationRef = useRef(0)

  // Recipe modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [recipe, setRecipe] = useState(null)
  const [recipeLoading, setRecipeLoading] = useState(false)
  const [recipeError, setRecipeError] = useState(null)

  const handleSubmit = async (preferences) => {
    const generation = ++generationRef.current
    const strings = getAppStrings(navigator.language)
    setLoading(true)
    setError(null)
    setMealPlan(null)
    setPreferences(preferences)

    // Raw fetch — supabase.functions.invoke does not support streaming
    let response
    try {
      response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-meal-plan`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ ...preferences, language: navigator.language }),
        },
      )
    } catch {
      if (generation !== generationRef.current) return
      setError(strings.generalError)
      setLoading(false)
      return
    }

    if (!response.ok) {
      if (generation !== generationRef.current) return
      setError(response.status === 429 ? strings.rateLimitError : strings.generalError)
      setLoading(false)
      return
    }

    // Read the SSE stream
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    // Returns false when the stream should stop (error event or stale generation)
    function processBuffer() {
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() // last element may be an incomplete event

      for (const block of blocks) {
        if (!block.trim()) continue

        let eventType = ''
        let dataLine = ''
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim()
          else if (line.startsWith('data: ')) dataLine = line.slice(6)
        }
        if (!eventType || !dataLine) continue
        if (generation !== generationRef.current) return false

        let parsed
        try {
          parsed = JSON.parse(dataLine)
        } catch {
          continue // malformed data line, skip
        }

        if (eventType === 'labels') {
          setMealPlan({ days: [], labels: parsed })
          setLoading(false)
        } else if (eventType === 'day') {
          setMealPlan((prev) => prev ? { ...prev, days: [...prev.days, parsed] } : prev)
        } else if (eventType === 'error') {
          setError(strings.generalError)
          setLoading(false)
          return false
        }
      }
      return true
    }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        if (!processBuffer()) break
      }
    } catch {
      if (generation !== generationRef.current) return
      setError(strings.generalError)
      // Keep partial plan if any days arrived; otherwise fall back to the form
      setMealPlan((prev) => (prev?.days?.length > 0 ? prev : null))
      setLoading(false)
    }
  }

  const handleMealClick = async (meal) => {
    setModalOpen(true)
    setRecipe(null)
    setRecipeError(null)
    setRecipeLoading(true)

    const { data, error: fnError } = await supabase.functions.invoke(
      'get-recipe',
      {
        body: {
          dishName: meal.name,
          language: navigator.language,
          servings: mealPlan?.servings ?? 2,
        },
      },
    )

    setRecipeLoading(false)

    if (fnError) {
      const status = fnError.context?.status
      if (status === 429) {
        setRecipeError("Limite atteinte, veuillez réessayer plus tard.")
      } else {
        setRecipeError("Impossible de charger la recette, veuillez réessayer.")
      }
      return
    }

    setRecipe(data)
  }

  const handleReplaceMeal = async (dayLabel, mealType) => {
    const { data, error: fnError } = await supabase.functions.invoke('replace-meal', {
      body: {
        dayLabel,
        mealType,
        currentPlan: mealPlan.days.map((d) => ({
          day: d.day,
          meals: [
            { type: 'lunch', dish: d.lunch.name },
            { type: 'dinner', dish: d.dinner.name },
          ],
        })),
        preferences,
        language: navigator.language,
      },
    })

    if (fnError) throw fnError

    setMealPlan((prev) => ({
      ...prev,
      days: prev.days.map((d) => {
        if (d.day !== dayLabel) return d
        return { ...d, [mealType]: { ...d[mealType], name: data.dish } }
      }),
    }))
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setRecipe(null)
    setRecipeError(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-emerald-700 tracking-tight">
          Meal Planner
        </h1>
        <p className="text-gray-500 mt-1 text-sm sm:text-base">
          Votre plan de repas personnalisé en quelques secondes
        </p>
      </div>

      {mealPlan ? (
        <MealPlan
          days={mealPlan.days}
          labels={mealPlan.labels}
          onReset={() => {
            generationRef.current++ // cancel any in-flight stream
            setMealPlan(null)
            setError(null)
            setLoading(false)
          }}
          onMealClick={handleMealClick}
          onReplaceMeal={handleReplaceMeal}
        />
      ) : (
        <PreferencesForm onSubmit={handleSubmit} loading={loading} />
      )}

      {error && (
        <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 max-w-lg w-full text-center">
          {error}
        </p>
      )}

      {modalOpen && (
        <RecipeModal
          recipe={recipe}
          loading={recipeLoading}
          error={recipeError}
          onClose={handleCloseModal}
        />
      )}
    </div>
  )
}

export default App
