-- AI primary-source setting: generic app_settings table + "AI Settings" sidebar item.
-- Feature: DEV-configurable AI Primary Source (WebApp | Power BI); the AI's source policy
-- (lib/ai/prompt.ts) is derived from it. Additive — apply promptly after the code merges
-- (getAiPrimarySource() defensively defaults to 'powerbi' if this table isn't present yet).
-- git-first: committed + pushed before running against p2.

CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the default: Power BI primary (preserves the historical policy). Idempotent.
INSERT INTO app_settings (key, value)
VALUES ('ai_primary_source', 'powerbi')
ON CONFLICT (key) DO NOTHING;

-- Left-sidebar menu item "AI Settings" (DEV only), next to "AI Usage" (order 37).
-- Idempotent via NOT EXISTS on the page (sidebar_access PK is a random uuid).
INSERT INTO sidebar_access (id, name, page, roles, "order")
SELECT gen_random_uuid(), 'AI Settings', '/settings/ai-settings', 'DEV', 37
WHERE NOT EXISTS (
  SELECT 1 FROM sidebar_access WHERE page = '/settings/ai-settings'
);

-- Verify:
--   SELECT * FROM app_settings WHERE key = 'ai_primary_source';
--   SELECT name, page, roles, "order" FROM sidebar_access WHERE page = '/settings/ai-settings';
