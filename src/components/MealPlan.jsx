import { useState } from 'react'

const MEAL_ICON = { lunch: '☀️', dinner: '🌙' }

const DEFAULT_LABELS = {
  lunch: 'Lunch',
  dinner: 'Dinner',
  yourMealPlan: 'Your meal plan',
  modifyPreferences: '← Modify my preferences',
  replaceMeal: 'Replace this meal',
  replacing: 'Replacing…',
  replaceError: 'Failed to replace. Try again.',
}

function Spinner() {
  return (
    <svg
      className="w-3 h-3 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-3 h-3"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function MealRow({ type, meal, labels, onMealClick, onReplace, isReplacing, isAnyReplacing, error }) {
  return (
    <div className="py-2">
      <button
        onClick={onMealClick}
        disabled={isAnyReplacing}
        className="w-full flex items-start justify-between gap-2 text-left hover:bg-emerald-50 rounded-lg px-1 -mx-1 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-3.5 h-3.5 text-gray-300 group-hover:text-emerald-400 transition-colors"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>

      <div className="mt-1 px-1">
        {isReplacing ? (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600">
            <Spinner />
            {labels.replacing}
          </span>
        ) : (
          <button
            onClick={onReplace}
            disabled={isAnyReplacing}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshIcon />
            {labels.replaceMeal}
          </button>
        )}
        {error && (
          <p className="mt-0.5 text-xs text-red-500">{error}</p>
        )}
      </div>
    </div>
  )
}

function DayCard({ day, lunch, dinner, labels, onMealClick, onReplace, replacingKey, replaceError }) {
  const lunchKey = `${day}-lunch`
  const dinnerKey = `${day}-dinner`

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="bg-emerald-500 px-4 py-2">
        <h3 className="text-white font-bold text-sm tracking-wide">{day}</h3>
      </div>
      <div className="px-4 divide-y divide-gray-100">
        <MealRow
          type="lunch"
          meal={lunch}
          labels={labels}
          onMealClick={() => onMealClick(lunch)}
          onReplace={() => onReplace(day, 'lunch')}
          isReplacing={replacingKey === lunchKey}
          isAnyReplacing={!!replacingKey}
          error={replaceError?.key === lunchKey ? replaceError.message : null}
        />
        <MealRow
          type="dinner"
          meal={dinner}
          labels={labels}
          onMealClick={() => onMealClick(dinner)}
          onReplace={() => onReplace(day, 'dinner')}
          isReplacing={replacingKey === dinnerKey}
          isAnyReplacing={!!replacingKey}
          error={replaceError?.key === dinnerKey ? replaceError.message : null}
        />
      </div>
    </div>
  )
}

export default function MealPlan({ days, labels = DEFAULT_LABELS, onReset, onMealClick, onReplaceMeal }) {
  const mergedLabels = { ...DEFAULT_LABELS, ...labels }

  const [replacingKey, setReplacingKey] = useState(null)
  const [replaceError, setReplaceError] = useState(null)

  const handleReplace = async (dayLabel, mealType) => {
    const key = `${dayLabel}-${mealType}`
    setReplacingKey(key)
    setReplaceError(null)
    try {
      await onReplaceMeal(dayLabel, mealType)
    } catch (err) {
      console.error('Replace meal error:', err)
      setReplaceError({ key, message: mergedLabels.replaceError })
    } finally {
      setReplacingKey(null)
    }
  }

  return (
    <div className="w-full max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">{mergedLabels.yourMealPlan}</h2>
        <button
          onClick={onReset}
          className="text-sm text-emerald-600 hover:text-emerald-700 font-medium border border-emerald-300 hover:border-emerald-500 rounded-lg px-3 py-1.5 transition-colors"
        >
          {mergedLabels.modifyPreferences}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {days.map(({ day, lunch, dinner }) => (
          <DayCard
            key={day}
            day={day}
            lunch={lunch}
            dinner={dinner}
            labels={mergedLabels}
            onMealClick={onMealClick}
            onReplace={handleReplace}
            replacingKey={replacingKey}
            replaceError={replaceError}
          />
        ))}
      </div>
    </div>
  )
}
