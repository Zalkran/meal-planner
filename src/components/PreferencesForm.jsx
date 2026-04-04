import { useState } from 'react'

const defaultValues = {
  diet: 'omnivore',
  allergies: '',
  servings: '2',
  prepTime: '30',
  budget: '30-50',
}

export default function PreferencesForm({ onSubmit, loading = false }) {
  const [form, setForm] = useState(defaultValues)

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-lg bg-white rounded-2xl shadow-lg p-6 sm:p-8 flex flex-col gap-5"
    >
      <div>
        <h2 className="text-2xl font-bold text-gray-800">Mes préférences</h2>
        <p className="text-sm text-gray-500 mt-1">
          Personnalisez votre plan de repas hebdomadaire
        </p>
      </div>

      {/* Régime alimentaire */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">
          Régime alimentaire
        </label>
        <select
          name="diet"
          value={form.diet}
          onChange={handleChange}
          className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        >
          <option value="omnivore">Omnivore</option>
          <option value="vegetarien">Végétarien</option>
          <option value="vegan">Vegan</option>
          <option value="sans-gluten">Sans gluten</option>
          <option value="sans-lactose">Sans lactose</option>
        </select>
      </div>

      {/* Allergies */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">
          Allergies ou intolérances
        </label>
        <input
          type="text"
          name="allergies"
          value={form.allergies}
          onChange={handleChange}
          placeholder="Ex : arachides, fruits de mer"
          className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-gray-800 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
      </div>

      {/* Nombre de personnes */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">
          Nombre de personnes
        </label>
        <select
          name="servings"
          value={form.servings}
          onChange={handleChange}
          className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        >
          {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={String(n)}>
              {n} {n === 1 ? 'personne' : 'personnes'}
            </option>
          ))}
        </select>
      </div>

      {/* Temps de préparation */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">
          Temps de préparation max par repas
        </label>
        <select
          name="prepTime"
          value={form.prepTime}
          onChange={handleChange}
          className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        >
          <option value="15">15 min</option>
          <option value="30">30 min</option>
          <option value="45">45 min</option>
          <option value="60+">1h+</option>
        </select>
      </div>

      {/* Budget hebdomadaire */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">
          Budget hebdomadaire
        </label>
        <select
          name="budget"
          value={form.budget}
          onChange={handleChange}
          className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        >
          <option value="<30">Moins de 30€</option>
          <option value="30-50">30 – 50€</option>
          <option value="50-80">50 – 80€</option>
          <option value=">80">Plus de 80€</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-1 w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white font-semibold py-3 text-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
      >
        {loading ? 'Génération en cours…' : 'Générer mon plan de repas'}
      </button>
    </form>
  )
}
