const TRANSLATIONS = {
  fr: {
    replaceMeal: 'Remplacer ce repas',
    replacing: 'Remplacement…',
    replaceError: 'Échec du remplacement. Réessayez.',
    generalError: 'Une erreur est survenue, veuillez réessayer.',
    rateLimitError: 'Vous avez atteint la limite horaire, veuillez réessayer plus tard.',
  },
  de: {
    replaceMeal: 'Dieses Gericht ersetzen',
    replacing: 'Wird ersetzt…',
    replaceError: 'Ersetzen fehlgeschlagen. Erneut versuchen.',
    generalError: 'Ein Fehler ist aufgetreten, bitte versuche es erneut.',
    rateLimitError: 'Stündliches Limit erreicht, bitte später erneut versuchen.',
  },
  en: {
    replaceMeal: 'Replace this meal',
    replacing: 'Replacing…',
    replaceError: 'Failed to replace. Try again.',
    generalError: 'An error occurred, please try again.',
    rateLimitError: 'You have reached the hourly limit, please try again later.',
  },
}

/**
 * Returns translated UI strings for the given BCP 47 language tag.
 * Falls back to English for any language not explicitly mapped.
 *
 * @param {string} lang - e.g. navigator.language ("fr-FR", "de", "en-US")
 * @returns {{ replaceMeal: string, replacing: string, replaceError: string }}
 */
export function getReplaceMealStrings(lang) {
  const base = lang ? lang.split('-')[0].toLowerCase() : 'en'
  return TRANSLATIONS[base] ?? TRANSLATIONS.en
}

/**
 * Returns translated error strings used in the main app flow.
 * Falls back to English for any language not explicitly mapped.
 *
 * @param {string} lang - e.g. navigator.language ("fr-FR", "de", "en-US")
 * @returns {{ generalError: string, rateLimitError: string }}
 */
export function getAppStrings(lang) {
  const base = lang ? lang.split('-')[0].toLowerCase() : 'en'
  const t = TRANSLATIONS[base] ?? TRANSLATIONS.en
  return { generalError: t.generalError, rateLimitError: t.rateLimitError }
}
