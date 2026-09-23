ALTER TABLE "travel_circle" DROP CONSTRAINT "travel_circle_capacity_check";--> statement-breakpoint
CREATE UNIQUE INDEX "travel_plan_id_user_uq" ON "travel_plan" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "travel_circle_member" ADD CONSTRAINT "circle_member_plan_user_fk" FOREIGN KEY ("travel_plan_id","user_id") REFERENCES "public"."travel_plan"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_circle" ADD CONSTRAINT "travel_circle_capacity_check" CHECK ("travel_circle"."max_members" between 2 and 6 AND ("travel_circle"."member_count" = 0 OR "travel_circle"."member_count" between 2 and "travel_circle"."max_members"));
