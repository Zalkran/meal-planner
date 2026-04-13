-- Migration: normalize recipes schema
-- Replaces flat recipes_cache with a two-table normalized schema.
-- recipes_cache is renamed (not dropped) for safe rollback.

-- ---------------------------------------------------------------------------
-- 1. Rename the legacy table
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS recipes_cache RENAME TO recipes_cache_deprecated;

-- ---------------------------------------------------------------------------
-- 2. recipes — one row per canonical dish name
-- ---------------------------------------------------------------------------
CREATE TABLE recipes (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  canonical_name text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipes_canonical_name_key UNIQUE (canonical_name)
);

-- ---------------------------------------------------------------------------
-- 3. recipe_translations — one row per dish × language × serving count
-- ---------------------------------------------------------------------------
CREATE TABLE recipe_translations (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipe_id   bigint      NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  language    text        NOT NULL,
  servings    integer     NOT NULL CHECK (servings BETWEEN 1 AND 8),
  name        text        NOT NULL,
  prep_time   text        NOT NULL,
  cook_time   text        NOT NULL,
  ingredients jsonb       NOT NULL,
  steps       jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_translations_recipe_id_language_servings_key
    UNIQUE (recipe_id, language, servings)
);
