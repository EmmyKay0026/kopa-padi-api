import { Controller, Get } from '@nestjs/common';
import { count, eq, isNull, sql } from 'drizzle-orm';
import { AdminOnly, RequiresCapability } from '../common/auth.guard.js';
import { db } from '../db/database.js';
import { domainOutbox, journeys, notificationOutbox, safetyReports, travelPlans } from '../db/schema.js';
@Controller('admin/operations') @AdminOnly()
export class OperationsController {
 @Get('summary') @RequiresCapability('audit_logs.read') async summary(){const[verified,activePlans,activeJourneys,pendingJobs,failedEmails,reports]=await Promise.all([db.execute(sql`select count(distinct user_id)::int value from pcm_verification where verification_status='VERIFIED'`),db.select({value:count()}).from(travelPlans).where(eq(travelPlans.status,'SEARCHING')),db.select({value:count()}).from(journeys).where(sql`${journeys.status} in ('IN_PROGRESS','NEEDS_ATTENTION')`),db.select({value:count()}).from(domainOutbox).where(isNull(domainOutbox.processedAt)),db.select({value:count()}).from(notificationOutbox).where(sql`${notificationOutbox.sentAt} is null and ${notificationOutbox.lastError} is not null`),db.select({value:count()}).from(safetyReports).where(sql`${safetyReports.status} not in ('RESOLVED','DISMISSED','DUPLICATE')`)]);return{api:'healthy',database:'reachable',verifiedUsers:Number(verified.rows[0]?.value??0),matchingBacklog:Number(activePlans[0]?.value??0),activeJourneys:Number(activeJourneys[0]?.value??0),pendingDomainJobs:Number(pendingJobs[0]?.value??0),failedEmails:Number(failedEmails[0]?.value??0),openSafetyReports:Number(reports[0]?.value??0)};}
 @Get('metrics') @RequiresCapability('audit_logs.read') async metrics(){const result=await db.execute(sql`
   select
    (select count(*)::int from "user") registered_users,
     (select count(distinct user_id)::int from pcm_verification where verification_status='VERIFIED') verified_pcms,
    (select count(*)::int from travel_plan) travel_plans,
    (select count(*)::int from travel_plan where status in ('MATCHED','IN_CIRCLE','LOCKED','IN_JOURNEY','COMPLETED')) matched_plans,
    (select count(*)::int from travel_circle) circles_formed,
     (select count(*)::int from travel_circle where status in ('READY','LOCKED','IN_JOURNEY','ARRIVED')) ready_circles,
    (select coalesce(avg(member_count),0)::numeric(8,2) from travel_circle) average_circle_size,
    (select count(*)::int from journey where started_at is not null) journeys_started,
    (select count(*)::int from journey where started_at is not null and journey_mode='SOLO') solo_journeys,
    (select count(*)::int from journey where arrived_at is not null) safe_arrivals,
    (select count(distinct user_id)::int from trusted_contact where is_active=true) trusted_contact_users,
    (select count(*)::int from journey_guide where status='PUBLISHED') published_guides,
    (select count(*)::int from journey where journey_guide_id is not null) guided_journeys,
    (select count(*)::int from journey_guide_feedback) guide_feedback,
    (select count(*)::int from journey_guide_feedback where was_useful=true) helpful_guide_feedback,
    (select count(*)::int from safety_report) safety_reports,
    (select count(*)::int from journey_check_in where type not in ('STARTED','ARRIVED')) journey_checkins,
    (select coalesce(avg(extract(epoch from (ma.completed_at-tp.created_at))),0)::numeric(12,2) from match_attempt ma join travel_plan tp on tp.id=ma.travel_plan_id where ma.selected_circle_id is not null) average_seconds_to_first_match,
    (select count(*)::int from match_attempt where alternative_candidate_count>0 and selected_circle_id is not null) nearby_lga_match_attempts
  `);return result.rows[0];}
}
