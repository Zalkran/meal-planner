import { useEffect } from 'react'

function CloseButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Close"
      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    </button>
  )
}

function MetaBadge({ icon, label }) {
  return (
    <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 rounded-lg px-3 py-1.5">
      <span className="text-base leading-none">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-6 bg-gray-200 rounded w-3/4" />
      <div className="flex gap-2">
        <div className="h-8 bg-gray-200 rounded-lg w-24" />
        <div className="h-8 bg-gray-200 rounded-lg w-24" />
        <div className="h-8 bg-gray-200 rounded-lg w-24" />
      </div>
      <div className="h-4 bg-gray-200 rounded w-1/3 mt-6" />
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-3 bg-gray-200 rounded" style={{ width: `${75 + (i % 3) * 10}%` }} />
        ))}
      </div>
      <div className="h-4 bg-gray-200 rounded w-1/3 mt-4" />
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-3 bg-gray-200 rounded w-full" />
        ))}
      </div>
    </div>
  )
}

export default function RecipeModal({ recipe, loading, error, onClose }) {
  // Close on Escape key
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full sm:max-w-lg bg-white sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[85vh]">

        {/* Header — always visible */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900 leading-tight">
            {loading ? '…' : (recipe?.name ?? error)}
          </h2>
          <CloseButton onClick={onClose} />
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto overscroll-contain px-5 py-4 space-y-5">
          {loading && <LoadingSkeleton />}

          {error && !loading && (
            <p className="text-sm text-red-500 text-center py-6">{error}</p>
          )}

          {recipe && !loading && (
            <>
              {/* Meta badges */}
              <div className="flex flex-wrap gap-2">
                <MetaBadge icon="⏱️" label={recipe.prepTime} />
                <MetaBadge icon="🔥" label={recipe.cookTime} />
                <MetaBadge icon="👤" label={`×${recipe.servings}`} />
              </div>

              {/* Ingredients */}
              <section>
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-2">
                  Ingrédients
                </h3>
                <ul className="space-y-1">
                  {recipe.ingredients.map((ing, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 text-sm py-1.5 border-b border-gray-50 last:border-0">
                      <span className="text-gray-800">{ing.name}</span>
                      <span className="shrink-0 text-gray-500 font-medium">{ing.quantity}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Steps */}
              <section>
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-2">
                  Préparation
                </h3>
                <ol className="space-y-3">
                  {recipe.steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-gray-700 leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
