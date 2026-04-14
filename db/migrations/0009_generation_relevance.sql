CREATE TABLE IF NOT EXISTS "generation_relevance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "report_period_id" integer NOT NULL,
  "service_area_id" integer NOT NULL,
  "input_def_id" integer NOT NULL,
  "energy_provider_id" integer NOT NULL,
  "energy_source_id" integer NOT NULL,
  "is_relevant" boolean DEFAULT true NOT NULL,
  "is_deleted" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "updated_by_id" text
);

DO $$
BEGIN
  ALTER TABLE "generation_relevance"
    ADD CONSTRAINT "generation_relevance_report_period_id_report_periods_id_fk"
    FOREIGN KEY ("report_period_id") REFERENCES "public"."report_periods"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "generation_relevance"
    ADD CONSTRAINT "generation_relevance_service_area_id_service_areas_id_fk"
    FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "generation_relevance"
    ADD CONSTRAINT "generation_relevance_input_def_id_input_definitions_id_fk"
    FOREIGN KEY ("input_def_id") REFERENCES "public"."input_definitions"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "generation_relevance"
    ADD CONSTRAINT "generation_relevance_energy_provider_id_managed_list_items_id_fk"
    FOREIGN KEY ("energy_provider_id") REFERENCES "public"."managed_list_items"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "generation_relevance"
    ADD CONSTRAINT "generation_relevance_energy_source_id_managed_list_items_id_fk"
    FOREIGN KEY ("energy_source_id") REFERENCES "public"."managed_list_items"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "generation_relevance"
    ADD CONSTRAINT "generation_relevance_updated_by_id_user_id_fk"
    FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_generation_relevance"
  ON "generation_relevance" (
    "report_period_id",
    "service_area_id",
    "input_def_id",
    "energy_provider_id",
    "energy_source_id"
  );