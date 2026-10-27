-- Preserve existing assignments. Ambiguous legacy activation requires an explicit choice.
DO $$ BEGIN
  IF (SELECT count(*) FROM "nysc_intake" WHERE "status" = 'ACTIVE') > 1 THEN
    RAISE EXCEPTION 'Select exactly one active NYSC intake before applying the single-active-intake migration';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_nysc_intake" ON "nysc_intake" ("status") WHERE "status" = 'ACTIVE';
--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'NYSC_INTAKE_CREATED';
--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'NYSC_INTAKE_ACTIVATED';
--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'NYSC_INTAKE_CLOSED';
