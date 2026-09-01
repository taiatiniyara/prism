-- ============================================================================
-- Physicalise the energy-dimension names (drop the `energy_` prefix / label→column)
--   energy_provider_id       -> provider_id
--   energy_type_id           -> category_id
--   energy_source_id         -> technology_id
--   energy_resource_type_id  -> asset_id
--   energy_resource_id       -> unit_id
--   table energy_resources   -> units   (+ its own energy_* cols + id sequence)
--
-- Reverses the earlier "label-only, no column rename" decision (naming-change-log
-- §1.2a / ADR 0003 precedent). See docs/naming-change-log.md.
--
-- ⚠ RUN BY #2 (owns data_entries DDL) — REVIEW + TEST on a scratch copy first.
--   Must land ATOMICALLY with the code-rename PR + the formula_inputs JSON key
--   migration (scripts/sql/2026-07-27-rename-formula-input-energy-keys.sql), or the
--   app breaks against the renamed columns. This is a SHARED dev DB.
--
-- Postgres note: RENAME COLUMN/TABLE auto-updates FKs, indexes (incl. the 17-col
-- uniq_entry_address) and non-colliding views. The two views below MUST be dropped
-- first because energy_type_id->category_id and energy_resource_id->unit_id would
-- otherwise create DUPLICATE output columns (silver already emits category_id/unit_id
-- for the MEASURE group + unit-of-measure). We recreate them with disambiguated
-- aliases (measures_group_* / uom_*).
--
-- BACKUP FIRST:
--   CREATE TABLE backup.data_entries_pre_energyrename_20260727 AS TABLE data_entries;   -- (0 rows now, flushed)
--   CREATE TABLE backup.energy_resources_pre_unitrename_20260727 AS TABLE energy_resources;
--   -- view defs are in git; kpi_definitions.formula_inputs backup handled by the JSON script.
-- ============================================================================
begin;

-- 1) Drop the dependent views (recreated at the end).
drop view if exists gold.ext_data_entries;
drop view if exists silver.data_entries_enriched;

-- 2) Rename base columns (guarded so re-runs are no-ops).
do $$
begin
  -- data_entries (5)
  if exists (select 1 from information_schema.columns where table_name='data_entries' and column_name='energy_provider_id')      then alter table data_entries rename column energy_provider_id to provider_id; end if;
  if exists (select 1 from information_schema.columns where table_name='data_entries' and column_name='energy_type_id')          then alter table data_entries rename column energy_type_id to category_id; end if;
  if exists (select 1 from information_schema.columns where table_name='data_entries' and column_name='energy_source_id')        then alter table data_entries rename column energy_source_id to technology_id; end if;
  if exists (select 1 from information_schema.columns where table_name='data_entries' and column_name='energy_resource_type_id') then alter table data_entries rename column energy_resource_type_id to asset_id; end if;
  if exists (select 1 from information_schema.columns where table_name='data_entries' and column_name='energy_resource_id')      then alter table data_entries rename column energy_resource_id to unit_id; end if;

  -- energy_resource_type_relevance (3)
  if exists (select 1 from information_schema.columns where table_name='energy_resource_type_relevance' and column_name='energy_resource_type_id') then alter table energy_resource_type_relevance rename column energy_resource_type_id to asset_id; end if;
  if exists (select 1 from information_schema.columns where table_name='energy_resource_type_relevance' and column_name='energy_type_id')          then alter table energy_resource_type_relevance rename column energy_type_id to category_id; end if;
  if exists (select 1 from information_schema.columns where table_name='energy_resource_type_relevance' and column_name='energy_source_id')        then alter table energy_resource_type_relevance rename column energy_source_id to technology_id; end if;

  -- managed_list_items (1) — the item-level asset tag
  if exists (select 1 from information_schema.columns where table_name='managed_list_items' and column_name='energy_resource_type_id') then alter table managed_list_items rename column energy_resource_type_id to asset_id; end if;

  -- energy_resources own energy_* cols (3), before the table rename
  if exists (select 1 from information_schema.columns where table_name='energy_resources' and column_name='energy_provider_id') then alter table energy_resources rename column energy_provider_id to provider_id; end if;
  if exists (select 1 from information_schema.columns where table_name='energy_resources' and column_name='energy_type_id')     then alter table energy_resources rename column energy_type_id to category_id; end if;
  if exists (select 1 from information_schema.columns where table_name='energy_resources' and column_name='energy_source_id')   then alter table energy_resources rename column energy_source_id to technology_id; end if;
end $$;

-- 3) Rename the energy_resources table -> units (+ its id sequence for tidiness).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='energy_resources') then
    alter table energy_resources rename to units;
  end if;
  if exists (select 1 from pg_class where relkind='S' and relname='energy_resources_id_seq') then
    alter sequence energy_resources_id_seq rename to units_id_seq;
  end if;
end $$;

-- 4) Recreate silver.data_entries_enriched with the new base column names and
--    DISAMBIGUATED aliases: measure group -> measures_group_*, measure UoM -> uom_*,
--    energy dims -> provider/category/technology + unit_id (energy_resource_id).
create view silver.data_entries_enriched as
 select de.id,
    de.report_period_id,
    de.service_area_id,
    de.measure_def_id as measure_id,
    idf.name as measure_name,
    idf.variable_name as measure_variable_name,
    idf.definition as measure_definition,
    idf.definition_status as measure_definition_status,
    mli_unit.name as uom_name,
    mli_unit.id as uom_id,
    mli_dt.name as data_type_name,
    mli_dt.id as data_type_id,
    mli_cat.name as measures_group_name,
    mli_cat.id as measures_group_id,
    mli_sub.name as measures_subgroup_name,
    mli_sub.id as measures_subgroup_id,
    de.value_numeric,
    de.value_boolean,
    de.value_option_id,
    de.value_text as value_string,
        case
            when mli_dt.name::text = any (array['number'::character varying, 'numeric'::character varying, 'integer'::character varying, 'decimal'::character varying]::text[]) then de.value_numeric::text
            when mli_dt.name::text = any (array['boolean'::character varying, 'bool'::character varying]::text[]) then
            case when de.value_boolean then 'Yes'::text else 'No'::text end
            when mli_dt.name::text = any (array['option'::character varying, 'select'::character varying]::text[]) then mli_opt.name::text
            when mli_dt.name::text = any (array['text'::character varying, 'string'::character varying]::text[]) then de.value_text
            else null::text
        end as value_display,
    de.provider_id,
    mli_ep.name as provider_name,
    de.category_id,
    mli_et.name as category_name,
    de.technology_id,
    mli_es.name as technology_name,
    de.customer_type_id,
    mli_ct.name as customer_type_name,
    de.payment_mode_id,
    mli_pm.name as payment_mode_name,
    de.consumption_band_id,
    mli_cb.name as consumption_band_name,
    de.division_id,
    mli_div.name as division_name,
    de.gender_id,
    mli_gen.name as gender_name,
    de.unit_id,
    org.id as utility_id,
    org.name as utility_name,
    org.acronym as utility_acronym,
    c.id as country_id,
    c.name as country_name,
    sr.id as sub_region_id,
    sr.name as sub_region_name,
    mli_usize.name as utility_size,
    mli_utype.name as utility_type,
    rp.report_date,
    mli_rt.name as report_type,
    de.status_id,
    mli_st.name as status_name,
    de.status_id >= 5 as is_approved,
    de.is_relevant,
    de.is_deleted,
    de.comments,
    de.updated_at,
    de.updated_by_id
   from data_entries de
     join measure_definitions idf on idf.id = de.measure_def_id
     join report_periods rp on rp.id = de.report_period_id
     join organisations org on org.id = rp.utility_id
     join countries c on c.id = org.country_id
     left join sub_regions sr on sr.id = c.sub_region_id
     left join managed_list_items mli_unit on mli_unit.id = idf.unit_id
     left join managed_list_items mli_dt on mli_dt.id = idf.data_type_id
     left join managed_list_items mli_cat on mli_cat.id = idf.measures_group_id
     left join managed_list_items mli_sub on mli_sub.id = idf.measures_subgroup_id
     left join managed_list_items mli_ep on mli_ep.id = de.provider_id
     left join managed_list_items mli_et on mli_et.id = de.category_id
     left join managed_list_items mli_es on mli_es.id = de.technology_id
     left join managed_list_items mli_ct on mli_ct.id = de.customer_type_id
     left join managed_list_items mli_pm on mli_pm.id = de.payment_mode_id
     left join managed_list_items mli_cb on mli_cb.id = de.consumption_band_id
     left join managed_list_items mli_div on mli_div.id = de.division_id
     left join managed_list_items mli_gen on mli_gen.id = de.gender_id
     left join managed_list_items mli_opt on mli_opt.id = de.value_option_id
     left join managed_list_items mli_rt on mli_rt.id = rp.report_type_id
     left join managed_list_items mli_usize on mli_usize.id = org.utility_size_id
     left join managed_list_items mli_utype on mli_utype.id = org.utility_type_id
     left join managed_list_items mli_st on mli_st.id = de.status_id
  where de.is_deleted = false;

-- 5) Recreate gold.ext_data_entries against silver's new output names.
create view gold.ext_data_entries as
 select data_entries_enriched.utility_name,
    data_entries_enriched.utility_acronym,
    data_entries_enriched.country_name,
    data_entries_enriched.sub_region_name,
    data_entries_enriched.report_date,
    data_entries_enriched.report_type,
    data_entries_enriched.measure_name,
    data_entries_enriched.uom_name,
    data_entries_enriched.measures_group_name,
    data_entries_enriched.measures_subgroup_name,
    data_entries_enriched.value_display,
    data_entries_enriched.provider_name,
    data_entries_enriched.category_name,
    data_entries_enriched.technology_name,
    data_entries_enriched.customer_type_name,
    data_entries_enriched.payment_mode_name,
    data_entries_enriched.consumption_band_name,
    data_entries_enriched.division_name,
    data_entries_enriched.gender_name
   from silver.data_entries_enriched
  where data_entries_enriched.is_approved = true;

commit;
