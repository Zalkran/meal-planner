const TRANSLATIONS = {
  fr: {
    replaceMeal: 'Remplacer ce repas',
    replacing: 'Remplacement…',
    replaceError: 'Échec du remplacement. Réessayez.',
  },
  de: {
    replaceMeal: 'Dieses Gericht ersetzen',
    replacing: 'Wird ersetzt…',
    replaceError: 'Ersetzen fehlgeschlagen. Erneut versuchen.',
  },
  en: {
    replaceMeal: 'Replace this meal',
    replacing: 'Replacing…',
    replaceError: 'Failed to replace. Try again.',
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
