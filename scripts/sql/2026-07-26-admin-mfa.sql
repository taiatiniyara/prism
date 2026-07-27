-- Admin MFA (app-layer TOTP) — security stream, 2026-07-26.
-- Backs the better-auth two-factor plugin + PRISM's per-session challenge marker.
-- ADDITIVE ONLY and idempotent (IF NOT EXISTS) — safe to run against the live DB.
-- Apply this INSTEAD of a full `db-push`, which would also push any other
-- session's in-progress schema changes from the working tree.

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "two_factor_enabled" boolean NOT NULL DEFAULT false;

ALTER TABLE "session"
  ADD COLUMN IF NOT EXISTS "two_factor_verified_at" timestamp;

CREATE TABLE IF NOT EXISTS "two_factor" (
  "id" text PRIMARY KEY NOT NULL,
  "secret" text NOT NULL,
  "backup_codes" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "verified" boolean NOT NULL DEFAULT true,
  "failed_verification_count" integer NOT NULL DEFAULT 0,
  "locked_until" timestamp
);

CREATE INDEX IF NOT EXISTS "two_factor_user_id_idx" ON "two_factor" ("user_id");
