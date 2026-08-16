-- Retire legacy free-text registration intake (#10, 2026-07-28).
-- `external_registrations` is superseded by the pending-user flow (user.status)
-- and the future structured `access_request` intake. Verified on the dev DB
-- before dropping: 0 rows, no inbound/outbound FKs, no dependent views.
DROP TABLE IF EXISTS external_registrations;
