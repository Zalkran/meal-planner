import { useState } from 'react'
import PreferencesForm from './components/PreferencesForm'
import MealPlan from './components/MealPlan'
import RecipeModal from './components/RecipeModal'
import { supabase } from './lib/supabase'

function App() {
  const [mealPlan, setMealPlan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Recipe modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [recipe, setRecipe] = useState(null)
  const [recipeLoading, setRecipeLoading] = useState(false)
  const [recipeError, setRecipeError] = useState(null)

  const handleSubmit = async (preferences) => {
    setLoading(true)
    setError(null)
    setMealPlan(null)

    const { data, error: fnError } = await supabase.functions.invoke(
      'generate-meal-plan',
      { body: { ...preferences, language: navigator.language } },
    )

    setLoading(false)

    if (fnError) {
      const status = fnError.context?.status
      if (status === 429) {
        setError("Vous avez atteint la limite horaire, veuillez réessayer plus tard.")
      } else {
        setError("Une erreur est survenue, veuillez réessayer.")
      }
      return
    }

    setMealPlan(data)
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
          onReset={() => setMealPlan(null)}
          onMealClick={handleMealClick}
        />
      ) : (
        <>
          <PreferencesForm onSubmit={handleSubmit} loading={loading} />
          {error && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 max-w-lg w-full text-center">
              {error}
            </p>
          )}
        </>
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
