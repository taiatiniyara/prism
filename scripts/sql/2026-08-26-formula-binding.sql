-- Calculator formula-binding store (spec §5.3). Additive, calculator-owned.
-- Applied surgically (NOT drizzle-kit push --force) to avoid touching the
-- rest of the shared dev schema while #2/#4 are mid-migration.

CREATE TABLE IF NOT EXISTS formula_binding (
  id serial PRIMARY KEY NOT NULL,
  owner_kind varchar(16) NOT NULL,
  owner_id integer NOT NULL,
  variable_name varchar(255) NOT NULL,
  input_measure_def_id integer NOT NULL REFERENCES measure_definitions(id),
  grain_mode varchar(16) NOT NULL DEFAULT 'inherit',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS formula_binding_owner_idx
  ON formula_binding (owner_kind, owner_id);

CREATE TABLE IF NOT EXISTS formula_binding_dimension (
  id serial PRIMARY KEY NOT NULL,
  binding_id integer NOT NULL REFERENCES formula_binding(id) ON DELETE CASCADE,
  dimension_key varchar(32) NOT NULL,
  member_id integer REFERENCES managed_list_items(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_formula_binding_dimension
  ON formula_binding_dimension (binding_id, dimension_key);
