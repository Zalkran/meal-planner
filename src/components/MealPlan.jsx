const MEAL_ICON = { lunch: '☀️', dinner: '🌙' }

const DEFAULT_LABELS = {
  lunch: 'Lunch',
  dinner: 'Dinner',
  yourMealPlan: 'Your meal plan',
  modifyPreferences: '← Modify my preferences',
}

function MealRow({ type, meal, labels, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start justify-between gap-2 py-2 text-left hover:bg-emerald-50 rounded-lg px-1 -mx-1 transition-colors group"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base leading-none">{MEAL_ICON[type]}</span>
        <div className="min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
            {labels[type]}
          </span>
          <p className="text-sm text-gray-800 font-medium truncate group-hover:text-emerald-700 transition-colors">
            {meal.name}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 whitespace-nowrap">
          {meal.prepTime}
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-300 group-hover:text-emerald-400 transition-colors" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      </div>
    </button>
  )
}

function DayCard({ day, lunch, dinner, labels, onMealClick }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="bg-emerald-500 px-4 py-2">
        <h3 className="text-white font-bold text-sm tracking-wide">{day}</h3>
      </div>
      <div className="px-4 divide-y divide-gray-100">
        <MealRow type="lunch" meal={lunch} labels={labels} onClick={() => onMealClick(lunch)} />
        <MealRow type="dinner" meal={dinner} labels={labels} onClick={() => onMealClick(dinner)} />
      </div>
    </div>
  )
}

export default function MealPlan({ days, labels = DEFAULT_LABELS, onReset, onMealClick }) {
  return (
    <div className="w-full max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">{labels.yourMealPlan}</h2>
        <button
          onClick={onReset}
          className="text-sm text-emerald-600 hover:text-emerald-700 font-medium border border-emerald-300 hover:border-emerald-500 rounded-lg px-3 py-1.5 transition-colors"
        >
          {labels.modifyPreferences}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {days.map(({ day, lunch, dinner }) => (
          <DayCard
            key={day}
            day={day}
            lunch={lunch}
            dinner={dinner}
            labels={labels}
            onMealClick={onMealClick}
          />
        ))}
      </div>
    </div>
  )
}
