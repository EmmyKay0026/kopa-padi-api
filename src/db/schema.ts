import { relations, sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { ACCOUNT_STATUSES, AUDIT_ACTIONS, CANCELLATION_REASONS, CIRCLE_MEMBERSHIP_STATUSES, CIRCLE_MESSAGE_TYPES, CIRCLE_NOTIFICATION_TYPES, DEPARTURE_WINDOWS, DOCUMENT_TYPES, FINAL_CONNECTION_RESPONSES, GROUP_PREFERENCES, GUIDE_ACCURACY_RESPONSES, GUIDE_CONFIDENCE_LEVELS, GUIDE_FEEDBACK_ISSUES, GUIDE_ORIGIN_SCOPES, GUIDE_SOURCE_TYPES, GUIDE_STATUSES, GUIDE_TRANSPORT_MODES, JOURNEY_CHECKIN_TYPES, JOURNEY_COHORT_STATUSES, JOURNEY_LEG_TYPES, JOURNEY_MODES, JOURNEY_SHARE_STATUSES, JOURNEY_STATUSES, LOCATION_SHARE_AUDIENCES, MATCHING_RESTRICTIONS, MATCH_OFFER_STATUSES, MATCH_OFFER_TYPES, MATCH_RESULT_TYPES, MEETUP_STATUSES, REJECTION_REASONS, ROLES, SAFETY_REPORT_CATEGORIES, SAFETY_REPORT_STATUSES, TRANSPORT_MODES, TRAVEL_CIRCLE_STATUSES, TRAVEL_PLAN_STATUSES, VERIFICATION_STATUSES } from '../domain.js';
import { ACCOUNT_RESTRICTION_TYPES, ADMIN_CAPABILITIES, CASE_NOTE_TYPES, CASE_PRIORITIES, CASE_STATUSES, REPORT_SEVERITIES, REPORT_STATUSES, RESTRICTION_STATUSES, SAFETY_REPORT_CATEGORIES_V2 } from '../domain.js';

export const accountStatusEnum = pgEnum('account_status', ACCOUNT_STATUSES);
export const roleEnum = pgEnum('user_role', ROLES);
export const verificationStatusEnum = pgEnum('pcm_verification_status', VERIFICATION_STATUSES);
export const rejectionReasonEnum = pgEnum('verification_rejection_reason', REJECTION_REASONS);
export const documentTypeEnum = pgEnum('verification_document_type', DOCUMENT_TYPES);
export const documentStatusEnum = pgEnum('verification_document_status', ['ACTIVE', 'SUPERSEDED', 'DELETED']);
export const intakeStatusEnum = pgEnum('nysc_intake_status', ['UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED']);
export const campStatusEnum = pgEnum('orientation_camp_status', ['ACTIVE', 'TEMPORARY', 'INACTIVE', 'UNKNOWN']);
export const hubTypeEnum = pgEnum('travel_hub_type', ['LOCAL', 'REGIONAL', 'INTERSTATE', 'DESTINATION_GATEWAY']);
export const hubStatusEnum = pgEnum('travel_hub_status', ['ACTIVE', 'INACTIVE', 'REVIEW_REQUIRED']);
export const geographySourceEnum = pgEnum('geography_source', ['OSRM', 'MANUAL_REVIEW', 'OPENSTREETMAP', 'IMPORTED_DATASET']);
export const travelPlanStatusEnum = pgEnum('travel_plan_status', TRAVEL_PLAN_STATUSES);
export const departureWindowEnum = pgEnum('departure_window', DEPARTURE_WINDOWS);
export const transportModeEnum = pgEnum('transport_mode', TRANSPORT_MODES);
export const groupPreferenceEnum = pgEnum('group_preference', GROUP_PREFERENCES);
export const cancellationReasonEnum = pgEnum('travel_plan_cancellation_reason', CANCELLATION_REASONS);
export const matchingRestrictionEnum = pgEnum('matching_restriction_type', MATCHING_RESTRICTIONS);
export const journeyCohortStatusEnum = pgEnum('journey_cohort_status', JOURNEY_COHORT_STATUSES);
export const travelCircleStatusEnum = pgEnum('travel_circle_status', TRAVEL_CIRCLE_STATUSES);
export const circleMembershipStatusEnum = pgEnum('circle_membership_status', CIRCLE_MEMBERSHIP_STATUSES);
export const matchOfferTypeEnum = pgEnum('match_offer_type', MATCH_OFFER_TYPES);
export const matchOfferStatusEnum = pgEnum('match_offer_status', MATCH_OFFER_STATUSES);
export const matchResultTypeEnum = pgEnum('match_result_type', MATCH_RESULT_TYPES);
export const circleMessageTypeEnum = pgEnum('circle_message_type', CIRCLE_MESSAGE_TYPES);
export const meetupStatusEnum = pgEnum('meetup_status', MEETUP_STATUSES);
export const safetyReportCategoryEnum = pgEnum('safety_report_category', SAFETY_REPORT_CATEGORIES);
export const safetyReportStatusEnum = pgEnum('safety_report_status', SAFETY_REPORT_STATUSES);
export const circleNotificationTypeEnum = pgEnum('circle_notification_type', CIRCLE_NOTIFICATION_TYPES);
export const journeyModeEnum = pgEnum('journey_mode', JOURNEY_MODES);
export const journeyStatusEnum = pgEnum('journey_status', JOURNEY_STATUSES);
export const journeyCheckInTypeEnum = pgEnum('journey_checkin_type', JOURNEY_CHECKIN_TYPES);
export const journeyShareStatusEnum = pgEnum('journey_share_status', JOURNEY_SHARE_STATUSES);
export const locationShareAudienceEnum = pgEnum('location_share_audience', LOCATION_SHARE_AUDIENCES);
export const guideOriginScopeEnum = pgEnum('guide_origin_scope', GUIDE_ORIGIN_SCOPES);
export const guideStatusEnum = pgEnum('journey_guide_status', GUIDE_STATUSES);
export const guideConfidenceEnum = pgEnum('guide_confidence', GUIDE_CONFIDENCE_LEVELS);
export const journeyLegTypeEnum = pgEnum('journey_leg_type', JOURNEY_LEG_TYPES);
export const guideSourceTypeEnum = pgEnum('guide_source_type', GUIDE_SOURCE_TYPES);
export const guideTransportModeEnum = pgEnum('guide_transport_mode', GUIDE_TRANSPORT_MODES);
export const guideAccuracyEnum = pgEnum('guide_accuracy_response', GUIDE_ACCURACY_RESPONSES);
export const finalConnectionAccuracyEnum = pgEnum('final_connection_response', FINAL_CONNECTION_RESPONSES);
export const guideFeedbackIssueEnum = pgEnum('guide_feedback_issue', GUIDE_FEEDBACK_ISSUES);
export const safetyReportCategoryV2Enum=pgEnum('safety_report_category_v2',SAFETY_REPORT_CATEGORIES_V2);
export const reportSeverityEnum=pgEnum('safety_report_severity',REPORT_SEVERITIES);
export const reportStatusEnum=pgEnum('safety_report_status_v2',REPORT_STATUSES);
export const casePriorityEnum=pgEnum('moderation_case_priority',CASE_PRIORITIES);
export const caseStatusEnum=pgEnum('moderation_case_status',CASE_STATUSES);
export const caseNoteTypeEnum=pgEnum('moderation_note_type',CASE_NOTE_TYPES);
export const accountRestrictionTypeEnum=pgEnum('account_restriction_type',ACCOUNT_RESTRICTION_TYPES);
export const restrictionStatusEnum=pgEnum('restriction_status',RESTRICTION_STATUSES);
export const adminCapabilityEnum=pgEnum('admin_capability',ADMIN_CAPABILITIES);
export const auditActionEnum = pgEnum('audit_action', AUDIT_ACTIONS);

export const users = pgTable('user', {
  id: uuid().defaultRandom().primaryKey(), name: text().notNull(), email: text().notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(), image: text(),
  accountStatus: accountStatusEnum('account_status').default('ACTIVE').notNull(), role: roleEnum().default('USER').notNull(),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
export const sessions = pgTable('session', {
  id: uuid().defaultRandom().primaryKey(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), token: text().notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  ipAddress: text('ip_address'), userAgent: text('user_agent'), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (t) => [index('session_user_idx').on(t.userId)]);
export const accounts = pgTable('account', {
  id: uuid().defaultRandom().primaryKey(), accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), accessToken: text('access_token'), refreshToken: text('refresh_token'),
  idToken: text('id_token'), accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }), refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text(), password: text(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('account_provider_uq').on(t.providerId, t.accountId), index('account_user_idx').on(t.userId)]);
export const authVerifications = pgTable('verification', {
  id: uuid().defaultRandom().primaryKey(), identifier: text().notNull(), value: text().notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('auth_verification_identifier_idx').on(t.identifier)]);

export const pcmProfiles = pgTable('pcm_profile', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }), firstName: text('first_name').notNull(),
  lastNamePrivate: text('last_name_private').notNull(), displayName: text('display_name').notNull(), profilePhotoKey: text('profile_photo_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
export const nyscIntakes = pgTable('nysc_intake', {
  id: uuid().defaultRandom().primaryKey(), serviceYear: text('service_year').notNull(), batch: text().notNull(), stream: text().notNull(),
  orientationStartDate: date('orientation_start_date'), orientationEndDate: date('orientation_end_date'), status: intakeStatusEnum().default('UPCOMING').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('nysc_intake_identity_uq').on(t.serviceYear, t.batch, t.stream)]);
export const states = pgTable('state', {
  id: text().primaryKey(), name: text().notNull().unique(), code: text().notNull().unique(),
  latitude: numeric({ precision: 9, scale: 6 }), longitude: numeric({ precision: 9, scale: 6 }),
  isActive: boolean('is_active').default(true).notNull(), source: text().default('Open Admin Data CC-BY-4.0').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
export const lgas = pgTable('lga', {
  id: text().primaryKey(), stateId: text('state_id').notNull().references(() => states.id, { onDelete: 'restrict' }),
  name: text().notNull(), slug: text().notNull().unique(), latitude: numeric({ precision: 9, scale: 6 }), longitude: numeric({ precision: 9, scale: 6 }),
  isActive: boolean('is_active').default(true).notNull(), source: text().default('Open Admin Data CC-BY-4.0').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('lga_state_name_uq').on(t.stateId, t.name), index('lga_state_idx').on(t.stateId)]);
export const towns = pgTable('town', {
  id: uuid().defaultRandom().primaryKey(), lgaId: text('lga_id').notNull().references(() => lgas.id, { onDelete: 'restrict' }), name: text().notNull(), slug: text().notNull(),
  latitude: numeric({ precision: 9, scale: 6 }), longitude: numeric({ precision: 9, scale: 6 }), isMajor: boolean('is_major').default(false).notNull(), isActive: boolean('is_active').default(true).notNull(),
  source: geographySourceEnum().default('MANUAL_REVIEW').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('town_lga_name_uq').on(t.lgaId, t.name), index('town_lga_idx').on(t.lgaId)]);
export const orientationCamps = pgTable('orientation_camp', {
  id: uuid().defaultRandom().primaryKey(), stateName: text('state_name').notNull(), campName: text('camp_name').notNull(), officialAddress: text('official_address'), lgaName: text('lga_name'),
  stateId: text('state_id').references(() => states.id, { onDelete: 'restrict' }), lgaId: text('lga_id').references(() => lgas.id, { onDelete: 'restrict' }),
  latitude: numeric({ precision: 9, scale: 6 }), longitude: numeric({ precision: 9, scale: 6 }), sourceReference: text('source_reference'), lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
  status: campStatusEnum().default('ACTIVE').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('orientation_camp_name_uq').on(t.stateName, t.campName), index('orientation_camp_state_idx').on(t.stateId), index('orientation_camp_lga_idx').on(t.lgaId), check('camp_lga_requires_state', sql`${t.lgaId} IS NULL OR ${t.stateId} IS NOT NULL`)]);
export const travelHubs = pgTable('travel_hub', {
  id: uuid().defaultRandom().primaryKey(), name: text().notNull(), stateId: text('state_id').notNull().references(() => states.id, { onDelete: 'restrict' }),
  lgaId: text('lga_id').references(() => lgas.id, { onDelete: 'restrict' }), townId: uuid('town_id').references(() => towns.id, { onDelete: 'set null' }),
  latitude: numeric({ precision: 9, scale: 6 }), longitude: numeric({ precision: 9, scale: 6 }), hubType: hubTypeEnum('hub_type').notNull(), status: hubStatusEnum().default('REVIEW_REQUIRED').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('travel_hub_state_name_uq').on(t.stateId, t.name), index('travel_hub_state_idx').on(t.stateId)]);
export const travelHubLgas = pgTable('travel_hub_lga', {
  travelHubId: uuid('travel_hub_id').notNull().references(() => travelHubs.id, { onDelete: 'cascade' }), lgaId: text('lga_id').notNull().references(() => lgas.id, { onDelete: 'restrict' }),
  estimatedMinutes: integer('estimated_minutes').notNull(), isPrimary: boolean('is_primary').default(false).notNull(), source: geographySourceEnum().notNull(),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.travelHubId, t.lgaId] }), index('hub_lga_lga_idx').on(t.lgaId), index('hub_lga_hub_idx').on(t.travelHubId), uniqueIndex('one_primary_hub_per_lga').on(t.lgaId).where(sql`${t.isPrimary} = true`), check('hub_minutes_nonnegative', sql`${t.estimatedMinutes} >= 0`)]);
export const lgaProximities = pgTable('lga_proximity', {
  id: uuid().defaultRandom().primaryKey(), lgaAId: text('lga_a_id').notNull().references(() => lgas.id, { onDelete: 'restrict' }), lgaBId: text('lga_b_id').notNull().references(() => lgas.id, { onDelete: 'restrict' }),
  estimatedRoadMinutes: integer('estimated_road_minutes').notNull(), estimatedRoadDistanceKm: numeric('estimated_road_distance_km', { precision: 8, scale: 2 }), commonHubId: uuid('common_hub_id').references(() => travelHubs.id, { onDelete: 'set null' }),
  isNearby: boolean('is_nearby').notNull(), source: geographySourceEnum().notNull(), calculatedAt: timestamp('calculated_at', { withTimezone: true }), lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('lga_proximity_pair_uq').on(t.lgaAId, t.lgaBId), index('lga_proximity_a_idx').on(t.lgaAId), index('lga_proximity_b_idx').on(t.lgaBId), index('lga_proximity_nearby_idx').on(t.isNearby), check('lga_pair_order_check', sql`${t.lgaAId} < ${t.lgaBId}`), check('proximity_minutes_nonnegative', sql`${t.estimatedRoadMinutes} >= 0`), check('proximity_distance_nonnegative', sql`${t.estimatedRoadDistanceKm} IS NULL OR ${t.estimatedRoadDistanceKm} >= 0`), check('proximity_nearby_derived', sql`${t.isNearby} = (${t.estimatedRoadMinutes} <= 60)`)]);
export const pcmVerifications = pgTable('pcm_verification', {
  id: uuid().defaultRandom().primaryKey(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  nyscIntakeId: uuid('nysc_intake_id').notNull().references(() => nyscIntakes.id, { onDelete: 'restrict' }), orientationCampId: uuid('orientation_camp_id').notNull().references(() => orientationCamps.id, { onDelete: 'restrict' }),
  status: verificationStatusEnum('verification_status').default('UNVERIFIED').notNull(), verificationMethod: text('verification_method').default('MANUAL_DOCUMENT_REVIEW').notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }), reviewedAt: timestamp('reviewed_at', { withTimezone: true }), verifiedAt: timestamp('verified_at', { withTimezone: true }),
  reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'restrict' }), rejectionReasonCode: rejectionReasonEnum('rejection_reason_code'), userSafeReason: text('user_safe_reason'), reviewNotesPrivate: text('review_notes_private'),
  version: text().default('1').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('one_open_verification_per_user').on(t.userId).where(sql`${t.status} in ('UNVERIFIED','SUBMITTED','UNDER_REVIEW','RESUBMISSION_REQUIRED')`),
  index('verification_queue_idx').on(t.status, t.submittedAt),
  check('verified_fields_check', sql`${t.status} <> 'VERIFIED' OR (${t.verifiedAt} IS NOT NULL AND ${t.reviewedBy} IS NOT NULL)`),
]);
export const verificationDocuments = pgTable('verification_document', {
  id: uuid().defaultRandom().primaryKey(), verificationId: uuid('verification_id').notNull().references(() => pcmVerifications.id, { onDelete: 'restrict' }),
  documentType: documentTypeEnum('document_type').notNull(), storageKey: text('storage_key').notNull().unique(), originalName: text('original_name').notNull(), mimeType: text('mime_type').notNull(), sizeBytes: text('size_bytes').notNull(), sha256: text().notNull(),
  status: documentStatusEnum().default('ACTIVE').notNull(), uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }), deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [index('document_verification_idx').on(t.verificationId)]);
export const auditLogs = pgTable('audit_log', {
  id: uuid().defaultRandom().primaryKey(), actorUserId: uuid('actor_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  action: auditActionEnum().notNull(), resourceType: text('resource_type').notNull(), resourceId: uuid('resource_id').notNull(), metadata: jsonb().$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('audit_resource_idx').on(t.resourceType, t.resourceId)]);
export const notificationOutbox = pgTable('notification_outbox', {
  id: uuid().defaultRandom().primaryKey(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }), type: text().notNull(), payload: jsonb().$type<Record<string, unknown>>().notNull(),
  attempts: text().default('0').notNull(), sentAt: timestamp('sent_at', { withTimezone: true }), lastError: text('last_error'), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const travelPlans = pgTable('travel_plan', {
  id: uuid().defaultRandom().primaryKey(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }), pcmVerificationId: uuid('pcm_verification_id').notNull().references(() => pcmVerifications.id, { onDelete: 'restrict' }),
  originStateId: text('origin_state_id').notNull().references(() => states.id, { onDelete: 'restrict' }), originLgaId: text('origin_lga_id').notNull().references(() => lgas.id, { onDelete: 'restrict' }), originTownId: uuid('origin_town_id').references(() => towns.id, { onDelete: 'restrict' }),
  destinationCampId: uuid('destination_camp_id').notNull().references(() => orientationCamps.id, { onDelete: 'restrict' }), intendedTravelDate: date('intended_travel_date').notNull(), dateFlexibilityDays: integer('date_flexibility_days').default(0).notNull(),
  departureWindow: departureWindowEnum('departure_window').notNull(), transportMode: transportModeEnum('transport_mode').notNull(), transportFlexible: boolean('transport_flexible').default(false).notNull(), nearbyMatchingEnabled: boolean('nearby_matching_enabled').default(true).notNull(),
  groupPreference: groupPreferenceEnum('group_preference').default('ANY_VERIFIED_PCM').notNull(), status: travelPlanStatusEnum().default('SEARCHING').notNull(), submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }), cancellationReason: cancellationReasonEnum('cancellation_reason'), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('one_active_travel_plan_per_user').on(t.userId).where(sql`${t.status} in ('DRAFT','SEARCHING','MATCHED','IN_CIRCLE','LOCKED','IN_JOURNEY')`), uniqueIndex('travel_plan_id_user_uq').on(t.id,t.userId),
  index('travel_plan_user_idx').on(t.userId), index('travel_plan_status_idx').on(t.status), index('travel_plan_destination_date_status_idx').on(t.destinationCampId, t.intendedTravelDate, t.status),
  index('travel_plan_origin_lga_idx').on(t.originLgaId), index('travel_plan_departure_idx').on(t.departureWindow), index('travel_plan_transport_idx').on(t.transportMode),
  check('travel_plan_flexibility_check', sql`${t.dateFlexibilityDays} in (0,1,2)`), check('travel_plan_cancelled_timestamp_check', sql`${t.status} <> 'CANCELLED' OR ${t.cancelledAt} IS NOT NULL`),
]);
export const domainOutbox = pgTable('domain_outbox', {
  id: uuid().defaultRandom().primaryKey(), aggregateType: text('aggregate_type').notNull(), aggregateId: uuid('aggregate_id').notNull(), eventType: text('event_type').notNull(),
  payload: jsonb().$type<Record<string, unknown>>().notNull(), availableAt: timestamp('available_at', { withTimezone: true }).defaultNow().notNull(), processedAt: timestamp('processed_at', { withTimezone: true }),
  attempts: integer().default(0).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('domain_outbox_pending_idx').on(t.processedAt, t.availableAt), index('domain_outbox_aggregate_idx').on(t.aggregateType, t.aggregateId)]);

export const userBlocks = pgTable('user_block', {
  id: uuid().defaultRandom().primaryKey(), blockerUserId: uuid('blocker_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), blockedUserId: uuid('blocked_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('user_block_pair_uq').on(t.blockerUserId, t.blockedUserId), index('user_block_blocked_idx').on(t.blockedUserId), check('user_block_not_self', sql`${t.blockerUserId} <> ${t.blockedUserId}`)]);

export const matchingRestrictions = pgTable('matching_restriction', {
  id: uuid().defaultRandom().primaryKey(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), type: matchingRestrictionEnum().notNull(), active: boolean().default(true).notNull(), reasonPrivate: text('reason_private'), expiresAt: timestamp('expires_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('matching_restriction_user_active_idx').on(t.userId, t.active)]);

export const journeyCohorts = pgTable('journey_cohort', {
  id: uuid().defaultRandom().primaryKey(), originHubId: uuid('origin_hub_id').references(() => travelHubs.id, { onDelete: 'set null' }), destinationCampId: uuid('destination_camp_id').notNull().references(() => orientationCamps.id, { onDelete: 'restrict' }), travelDate: date('travel_date').notNull(), departureWindow: departureWindowEnum('departure_window').notNull(), transportMode: transportModeEnum('transport_mode').notNull(), status: journeyCohortStatusEnum().default('OPEN').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('journey_cohort_lookup_idx').on(t.destinationCampId, t.travelDate, t.status)]);

export const travelCircles = pgTable('travel_circle', {
  id: uuid().defaultRandom().primaryKey(), journeyCohortId: uuid('journey_cohort_id').references(() => journeyCohorts.id, { onDelete: 'set null' }), originHubId: uuid('origin_hub_id').references(() => travelHubs.id, { onDelete: 'set null' }), originLgaId: text('origin_lga_id').notNull().references(() => lgas.id, { onDelete: 'restrict' }), originTownId: uuid('origin_town_id').references(() => towns.id, { onDelete: 'set null' }), destinationCampId: uuid('destination_camp_id').notNull().references(() => orientationCamps.id, { onDelete: 'restrict' }), travelDate: date('travel_date').notNull(), departureWindow: departureWindowEnum('departure_window').notNull(), transportMode: transportModeEnum('transport_mode').notNull(), status: travelCircleStatusEnum().default('FORMING').notNull(), maxMembers: integer('max_members').default(6).notNull(), memberCount: integer('member_count').default(0).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(), lockedAt: timestamp('locked_at', { withTimezone: true }), closedAt: timestamp('closed_at', { withTimezone: true }),
}, (t) => [index('travel_circle_lookup_idx').on(t.destinationCampId, t.travelDate, t.status), index('travel_circle_route_idx').on(t.destinationCampId, t.transportMode, t.departureWindow, t.status), check('travel_circle_capacity_check', sql`${t.maxMembers} between 2 and 6 AND (${t.memberCount} = 0 OR ${t.memberCount} between 2 and ${t.maxMembers})`)]);

export const travelCircleMembers = pgTable('travel_circle_member', {
  id: uuid().defaultRandom().primaryKey(), travelCircleId: uuid('travel_circle_id').notNull().references(() => travelCircles.id, { onDelete: 'restrict' }), travelPlanId: uuid('travel_plan_id').notNull().references(() => travelPlans.id, { onDelete: 'restrict' }), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }), membershipStatus: circleMembershipStatusEnum('membership_status').default('JOINED').notNull(), joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(), confirmedAt: timestamp('confirmed_at', { withTimezone: true }), leftAt: timestamp('left_at', { withTimezone: true }), removedAt: timestamp('removed_at', { withTimezone: true }),
}, (t) => [uniqueIndex('one_active_circle_per_plan').on(t.travelPlanId).where(sql`${t.membershipStatus} in ('JOINED','CONFIRMED')`), uniqueIndex('one_active_circle_per_user').on(t.userId).where(sql`${t.membershipStatus} in ('JOINED','CONFIRMED')`), index('circle_member_circle_status_idx').on(t.travelCircleId, t.membershipStatus), index('circle_member_plan_idx').on(t.travelPlanId), foreignKey({columns:[t.travelPlanId,t.userId],foreignColumns:[travelPlans.id,travelPlans.userId],name:'circle_member_plan_user_fk'}).onDelete('restrict'), check('circle_member_exit_timestamp_check', sql`(${t.membershipStatus} <> 'LEFT' OR ${t.leftAt} IS NOT NULL) AND (${t.membershipStatus} <> 'REMOVED' OR ${t.removedAt} IS NOT NULL)`)]);

export const matchOffers = pgTable('match_offer', {
  id: uuid().defaultRandom().primaryKey(), travelPlanId: uuid('travel_plan_id').notNull().references(() => travelPlans.id, { onDelete: 'restrict' }), candidateTravelPlanId: uuid('candidate_travel_plan_id').references(() => travelPlans.id, { onDelete: 'set null' }), proposedCircleId: uuid('proposed_circle_id').references(() => travelCircles.id, { onDelete: 'set null' }), offerType: matchOfferTypeEnum('offer_type').notNull(), proposedTravelDate: date('proposed_travel_date'), proposedDepartureWindow: departureWindowEnum('proposed_departure_window'), proposedTransportMode: transportModeEnum('proposed_transport_mode'), proposedOriginHubId: uuid('proposed_origin_hub_id').references(() => travelHubs.id, { onDelete: 'set null' }), status: matchOfferStatusEnum().default('PENDING').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), respondedAt: timestamp('responded_at', { withTimezone: true }),
}, (t) => [uniqueIndex('one_pending_match_offer_per_plan').on(t.travelPlanId).where(sql`${t.status} = 'PENDING'`), index('match_offer_plan_status_idx').on(t.travelPlanId, t.status), index('match_offer_expiry_idx').on(t.status, t.expiresAt)]);

export const matchAttempts = pgTable('match_attempt', {
  id: uuid().defaultRandom().primaryKey(), travelPlanId: uuid('travel_plan_id').notNull().references(() => travelPlans.id, { onDelete: 'restrict' }), algorithmVersion: text('algorithm_version').notNull(), candidateCount: integer('candidate_count').default(0).notNull(), directCandidateCount: integer('direct_candidate_count').default(0).notNull(), alternativeCandidateCount: integer('alternative_candidate_count').default(0).notNull(), resultType: matchResultTypeEnum('result_type').notNull(), selectedCircleId: uuid('selected_circle_id').references(() => travelCircles.id, { onDelete: 'set null' }), startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(), completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
}, (t) => [index('match_attempt_plan_idx').on(t.travelPlanId, t.startedAt), index('match_attempt_result_idx').on(t.resultType, t.completedAt)]);

export const circleConversations = pgTable('circle_conversation', {
  id: uuid().defaultRandom().primaryKey(), travelCircleId: uuid('travel_circle_id').notNull().references(() => travelCircles.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), closedAt: timestamp('closed_at', { withTimezone: true }),
}, (t) => [uniqueIndex('circle_conversation_circle_uq').on(t.travelCircleId)]);

export const circleMessages = pgTable('circle_message', {
  id: uuid().defaultRandom().primaryKey(), conversationId: uuid('conversation_id').notNull().references(() => circleConversations.id, { onDelete: 'restrict' }),
  senderUserId: uuid('sender_user_id').references(() => users.id, { onDelete: 'set null' }), type: circleMessageTypeEnum().notNull(), body: text().notNull(), eventKey: text('event_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), editedAt: timestamp('edited_at', { withTimezone: true }), deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [index('circle_message_cursor_idx').on(t.conversationId, t.createdAt, t.id), uniqueIndex('circle_message_event_uq').on(t.conversationId, t.eventKey).where(sql`${t.eventKey} IS NOT NULL`), check('circle_message_body_check', sql`char_length(${t.body}) between 1 and 2000`), check('circle_message_sender_check', sql`${t.type} = 'TEXT' OR ${t.senderUserId} IS NULL`)]);

export const conversationReadStates = pgTable('conversation_read_state', {
  conversationId: uuid('conversation_id').notNull().references(() => circleConversations.id, { onDelete: 'cascade' }), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lastReadMessageId: uuid('last_read_message_id').references(() => circleMessages.id, { onDelete: 'set null' }), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.conversationId, t.userId] })]);

export const circleMeetups = pgTable('circle_meetup', {
  id: uuid().defaultRandom().primaryKey(), travelCircleId: uuid('travel_circle_id').notNull().references(() => travelCircles.id, { onDelete: 'restrict' }),
  areaLabel: text('area_label').notNull(), locationDescription: text('location_description').notNull(), proposedByUserId: uuid('proposed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  status: meetupStatusEnum().default('PROPOSED').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(), agreedAt: timestamp('agreed_at', { withTimezone: true }), cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
}, (t) => [index('circle_meetup_circle_idx').on(t.travelCircleId, t.createdAt), uniqueIndex('one_active_meetup_per_circle').on(t.travelCircleId).where(sql`${t.status} in ('PROPOSED','AGREED')`), check('meetup_text_length_check', sql`char_length(${t.areaLabel}) between 2 and 120 AND char_length(${t.locationDescription}) between 3 and 500`)]);

export const meetupConfirmations = pgTable('meetup_confirmation', {
  meetupId: uuid('meetup_id').notNull().references(() => circleMeetups.id, { onDelete: 'cascade' }), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), confirmedAt: timestamp('confirmed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.meetupId, t.userId] })]);

export const circleSafetyReports = pgTable('circle_safety_report', {
  id: uuid().defaultRandom().primaryKey(), travelCircleId: uuid('travel_circle_id').notNull().references(() => travelCircles.id, { onDelete: 'restrict' }), reporterUserId: uuid('reporter_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  reportedUserId: uuid('reported_user_id').references(() => users.id, { onDelete: 'set null' }), meetupId: uuid('meetup_id').references(() => circleMeetups.id, { onDelete: 'set null' }), category: safetyReportCategoryEnum().notNull(), detailsPrivate: text('details_private'), status: safetyReportStatusEnum().default('OPEN').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
}, (t) => [index('circle_safety_report_status_idx').on(t.status, t.createdAt), check('circle_safety_report_target_check', sql`${t.reportedUserId} IS NOT NULL OR ${t.meetupId} IS NOT NULL`), check('circle_safety_report_details_check', sql`${t.detailsPrivate} IS NULL OR char_length(${t.detailsPrivate}) <= 1000`)]);

export const circleNotifications = pgTable('circle_notification', {
  id: uuid().defaultRandom().primaryKey(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), travelCircleId: uuid('travel_circle_id').notNull().references(() => travelCircles.id, { onDelete: 'restrict' }),
  type: circleNotificationTypeEnum().notNull(), body: text().notNull(), dedupeKey: text('dedupe_key').notNull(), readAt: timestamp('read_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('circle_notification_dedupe_uq').on(t.userId, t.dedupeKey), index('circle_notification_user_idx').on(t.userId, t.readAt, t.createdAt)]);

export const trustedContacts = pgTable('trusted_contact', {
  id: uuid().defaultRandom().primaryKey(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), name: text().notNull(), relationship: text().notNull(), phone: text(), email: text(), isActive: boolean('is_active').default(true).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('trusted_contact_user_active_idx').on(t.userId, t.isActive), check('trusted_contact_method_check', sql`${t.phone} IS NOT NULL OR ${t.email} IS NOT NULL`), check('trusted_contact_length_check', sql`char_length(${t.name}) between 2 and 100 AND char_length(${t.relationship}) between 2 and 80`)]);

export const journeyGuides = pgTable('journey_guide', {
  id: uuid().defaultRandom().primaryKey(), originScopeType: guideOriginScopeEnum('origin_scope_type').notNull(), originStateId: text('origin_state_id').references(() => states.id, { onDelete: 'restrict' }), originLgaId: text('origin_lga_id').references(() => lgas.id, { onDelete: 'restrict' }), originTownId: uuid('origin_town_id').references(() => towns.id, { onDelete: 'restrict' }), originHubId: uuid('origin_hub_id').references(() => travelHubs.id, { onDelete: 'restrict' }), destinationCampId: uuid('destination_camp_id').notNull().references(() => orientationCamps.id, { onDelete: 'restrict' }), title: text().notNull(), summary: text().notNull(), alternativeNotes: text('alternative_notes'), status: guideStatusEnum().default('DRAFT').notNull(), confidenceLevel: guideConfidenceEnum('confidence_level').default('UNVERIFIED').notNull(), version: integer().default(1).notNull(), publishedAt: timestamp('published_at', { withTimezone: true }), lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }), reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }), createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(), retiredAt: timestamp('retired_at', { withTimezone: true }),
}, (t) => [index('guide_destination_status_idx').on(t.destinationCampId, t.status), index('guide_lga_destination_status_idx').on(t.originLgaId, t.destinationCampId, t.status), index('guide_hub_destination_status_idx').on(t.originHubId, t.destinationCampId, t.status), index('guide_town_destination_status_idx').on(t.originTownId, t.destinationCampId, t.status), uniqueIndex('guide_scope_version_uq').on(t.originScopeType, t.originStateId, t.originLgaId, t.originTownId, t.originHubId, t.destinationCampId, t.version), check('guide_version_positive', sql`${t.version} > 0`), check('guide_origin_scope_check', sql`(${t.originScopeType}='TOWN' AND ${t.originTownId} IS NOT NULL AND ${t.originLgaId} IS NULL AND ${t.originHubId} IS NULL) OR (${t.originScopeType}='LGA' AND ${t.originLgaId} IS NOT NULL AND ${t.originTownId} IS NULL AND ${t.originHubId} IS NULL) OR (${t.originScopeType}='TRAVEL_HUB' AND ${t.originHubId} IS NOT NULL AND ${t.originTownId} IS NULL AND ${t.originLgaId} IS NULL) OR (${t.originScopeType}='STATE_AREA' AND ${t.originStateId} IS NOT NULL AND ${t.originTownId} IS NULL AND ${t.originLgaId} IS NULL AND ${t.originHubId} IS NULL)`)]);

export const journeyLegs = pgTable('journey_leg', {
  id: uuid().defaultRandom().primaryKey(), journeyGuideId: uuid('journey_guide_id').notNull().references(() => journeyGuides.id, { onDelete: 'cascade' }), sequenceNumber: integer('sequence_number').notNull(), legType: journeyLegTypeEnum('leg_type').notNull(), fromLabel: text('from_label').notNull(), toLabel: text('to_label').notNull(), fromStateId: text('from_state_id').references(() => states.id, { onDelete: 'restrict' }), fromLgaId: text('from_lga_id').references(() => lgas.id, { onDelete: 'restrict' }), fromTownId: uuid('from_town_id').references(() => towns.id, { onDelete: 'restrict' }), fromHubId: uuid('from_hub_id').references(() => travelHubs.id, { onDelete: 'restrict' }), toStateId: text('to_state_id').references(() => states.id, { onDelete: 'restrict' }), toLgaId: text('to_lga_id').references(() => lgas.id, { onDelete: 'restrict' }), toTownId: uuid('to_town_id').references(() => towns.id, { onDelete: 'restrict' }), toHubId: uuid('to_hub_id').references(() => travelHubs.id, { onDelete: 'restrict' }), toCampId: uuid('to_camp_id').references(() => orientationCamps.id, { onDelete: 'restrict' }), transportMode: guideTransportModeEnum('transport_mode'), instruction: text().notNull(), connectionNotes: text('connection_notes'), safetyNotes: text('safety_notes'), estimatedDurationMinutes: integer('estimated_duration_minutes'), estimatedDistanceKm: numeric('estimated_distance_km', { precision: 8, scale: 2 }), confidenceLevel: guideConfidenceEnum('confidence_level').notNull(), sourceType: guideSourceTypeEnum('source_type').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('guide_leg_sequence_uq').on(t.journeyGuideId, t.sequenceNumber), index('guide_leg_order_idx').on(t.journeyGuideId, t.sequenceNumber), check('guide_leg_sequence_positive', sql`${t.sequenceNumber} > 0`), check('guide_leg_instruction_check', sql`char_length(${t.instruction}) between 3 and 2000`), check('guide_leg_estimates_check', sql`(${t.estimatedDurationMinutes} IS NULL OR ${t.estimatedDurationMinutes} > 0) AND (${t.estimatedDistanceKm} IS NULL OR ${t.estimatedDistanceKm} > 0)`)]);

export const journeyGuideSources = pgTable('journey_guide_source', {
  id: uuid().defaultRandom().primaryKey(), journeyGuideId: uuid('journey_guide_id').notNull().references(() => journeyGuides.id, { onDelete: 'cascade' }), journeyLegId: uuid('journey_leg_id').references(() => journeyLegs.id, { onDelete: 'cascade' }), sourceType: guideSourceTypeEnum('source_type').notNull(), title: text().notNull(), reference: text().notNull(), sourceDate: date('source_date'), reviewedAt: timestamp('reviewed_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('guide_source_guide_idx').on(t.journeyGuideId), check('guide_source_text_check', sql`char_length(${t.title}) between 2 and 200 AND char_length(${t.reference}) between 3 and 1000`)]);

export const journeys = pgTable('journey', {
  id: uuid().defaultRandom().primaryKey(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }), travelPlanId: uuid('travel_plan_id').notNull().references(() => travelPlans.id, { onDelete: 'restrict' }), travelCircleId: uuid('travel_circle_id').references(() => travelCircles.id, { onDelete: 'set null' }), journeyGuideId: uuid('journey_guide_id').references(() => journeyGuides.id, { onDelete: 'set null' }), journeyGuideVersion: integer('journey_guide_version'), originStateId: text('origin_state_id').notNull().references(() => states.id, { onDelete: 'restrict' }), originLgaId: text('origin_lga_id').notNull().references(() => lgas.id, { onDelete: 'restrict' }), originTownId: uuid('origin_town_id').references(() => towns.id, { onDelete: 'set null' }), destinationCampId: uuid('destination_camp_id').notNull().references(() => orientationCamps.id, { onDelete: 'restrict' }), travelDate: date('travel_date').notNull(), departureWindow: departureWindowEnum('departure_window').notNull(), transportMode: transportModeEnum('transport_mode').notNull(), journeyMode: journeyModeEnum('journey_mode').notNull(), status: journeyStatusEnum().default('PREPARING').notNull(), startedAt: timestamp('started_at', { withTimezone: true }), expectedArrivalAt: timestamp('expected_arrival_at', { withTimezone: true }), lastCheckInAt: timestamp('last_check_in_at', { withTimezone: true }), lastSafeAt: timestamp('last_safe_at', { withTimezone: true }), arrivedAt: timestamp('arrived_at', { withTimezone: true }), completedAt: timestamp('completed_at', { withTimezone: true }), cancelledAt: timestamp('cancelled_at', { withTimezone: true }), cancellationReason: text('cancellation_reason'), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('one_active_journey_per_user').on(t.userId).where(sql`${t.status} in ('PREPARING','READY_TO_START','IN_PROGRESS','NEEDS_ATTENTION','ARRIVED')`), uniqueIndex('one_active_journey_per_plan').on(t.travelPlanId).where(sql`${t.status} in ('PREPARING','READY_TO_START','IN_PROGRESS','NEEDS_ATTENTION','ARRIVED')`), index('journey_user_status_idx').on(t.userId, t.status), index('journey_plan_idx').on(t.travelPlanId), index('journey_circle_status_idx').on(t.travelCircleId, t.status), check('journey_started_check', sql`${t.status} not in ('IN_PROGRESS','NEEDS_ATTENTION','ARRIVED','COMPLETED') OR ${t.startedAt} IS NOT NULL`), check('journey_arrived_check', sql`${t.status} not in ('ARRIVED','COMPLETED') OR ${t.arrivedAt} IS NOT NULL`)]);

export const journeyGuideFeedback = pgTable('journey_guide_feedback', {
  id: uuid().defaultRandom().primaryKey(), journeyId: uuid('journey_id').notNull().references(() => journeys.id, { onDelete: 'restrict' }), journeyGuideId: uuid('journey_guide_id').notNull().references(() => journeyGuides.id, { onDelete: 'restrict' }), journeyGuideVersion: integer('journey_guide_version').notNull(), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }), wasUseful: boolean('was_useful').notNull(), wasAccurate: guideAccuracyEnum('was_accurate').notNull(), finalConnectionAccurate: finalConnectionAccuracyEnum('final_connection_accurate'), issueType: guideFeedbackIssueEnum('issue_type'), comment: text(), submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('one_guide_feedback_per_journey_version').on(t.journeyId, t.journeyGuideId, t.journeyGuideVersion), index('guide_feedback_guide_date_idx').on(t.journeyGuideId, t.submittedAt), check('guide_feedback_version_positive', sql`${t.journeyGuideVersion} > 0`), check('guide_feedback_comment_check', sql`${t.comment} IS NULL OR char_length(${t.comment}) <= 1000`)]);

export const journeySafetyChecklist = pgTable('journey_safety_checklist', {
  journeyId: uuid('journey_id').notNull().references(() => journeys.id, { onDelete: 'cascade' }), itemKey: text('item_key').notNull(), label: text().notNull(), completed: boolean().default(false).notNull(), completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.journeyId, t.itemKey] })]);

export const journeyCheckIns = pgTable('journey_check_in', {
  id: uuid().defaultRandom().primaryKey(), journeyId: uuid('journey_id').notNull().references(() => journeys.id, { onDelete: 'restrict' }), userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }), type: journeyCheckInTypeEnum().notNull(), clientRequestId: uuid('client_request_id').notNull(), message: text(), latitude: numeric({ precision: 9, scale: 6 }), longitude: numeric({ precision: 9, scale: 6 }), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('journey_checkin_request_uq').on(t.journeyId, t.clientRequestId), index('journey_checkin_cursor_idx').on(t.journeyId, t.createdAt, t.id), check('journey_checkin_message_check', sql`${t.message} IS NULL OR char_length(${t.message}) <= 300`), check('journey_checkin_location_check', sql`(${t.latitude} IS NULL AND ${t.longitude} IS NULL) OR (${t.latitude} between -90 and 90 AND ${t.longitude} between -180 and 180)`)]);

export const journeyShares = pgTable('journey_share', {
  id: uuid().defaultRandom().primaryKey(), journeyId: uuid('journey_id').notNull().references(() => journeys.id, { onDelete: 'cascade' }), trustedContactId: uuid('trusted_contact_id').notNull().references(() => trustedContacts.id, { onDelete: 'restrict' }), tokenHash: text('token_hash').notNull(), status: journeyShareStatusEnum().default('ACTIVE').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), revokedAt: timestamp('revoked_at', { withTimezone: true }), lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),
}, (t) => [uniqueIndex('journey_share_token_uq').on(t.tokenHash), uniqueIndex('one_active_share_per_contact_journey').on(t.journeyId, t.trustedContactId).where(sql`${t.status} = 'ACTIVE'`), index('journey_share_journey_status_idx').on(t.journeyId, t.status), index('journey_share_expiry_idx').on(t.status, t.expiresAt)]);

export const journeyLocationShares = pgTable('journey_location_share', {
  id: uuid().defaultRandom().primaryKey(), journeyId: uuid('journey_id').notNull().references(() => journeys.id, { onDelete: 'cascade' }), latitude: numeric({ precision: 9, scale: 6 }).notNull(), longitude: numeric({ precision: 9, scale: 6 }).notNull(), audience: locationShareAudienceEnum().notNull(), purpose: text().default('EMERGENCY').notNull(), sharedAt: timestamp('shared_at', { withTimezone: true }).defaultNow().notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => [index('journey_location_current_idx').on(t.journeyId, t.audience, t.expiresAt), check('journey_location_bounds_check', sql`${t.latitude} between -90 and 90 AND ${t.longitude} between -180 and 180`)]);

export const journeyReminders = pgTable('journey_reminder', {
  id: uuid().defaultRandom().primaryKey(), journeyId: uuid('journey_id').notNull().references(() => journeys.id, { onDelete: 'cascade' }), reminderNumber: integer('reminder_number').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('journey_reminder_dedupe_uq').on(t.journeyId, t.reminderNumber), index('journey_reminder_created_idx').on(t.createdAt)]);

export const adminCapabilityGrants=pgTable('admin_capability_grant',{adminUserId:uuid('admin_user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),capability:adminCapabilityEnum().notNull(),grantedBy:uuid('granted_by').notNull().references(()=>users.id,{onDelete:'restrict'}),createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull()},t=>[primaryKey({columns:[t.adminUserId,t.capability]})]);
export const safetyReports=pgTable('safety_report',{id:uuid().defaultRandom().primaryKey(),reporterUserId:uuid('reporter_user_id').notNull().references(()=>users.id,{onDelete:'restrict'}),reportedUserId:uuid('reported_user_id').references(()=>users.id,{onDelete:'restrict'}),travelCircleId:uuid('travel_circle_id').references(()=>travelCircles.id,{onDelete:'restrict'}),journeyId:uuid('journey_id').references(()=>journeys.id,{onDelete:'restrict'}),messageId:uuid('message_id').references(()=>circleMessages.id,{onDelete:'set null'}),meetupId:uuid('meetup_id').references(()=>circleMeetups.id,{onDelete:'set null'}),category:safetyReportCategoryV2Enum().notNull(),description:text(),reportedContentSnapshot:text('reported_content_snapshot'),severity:reportSeverityEnum().default('MEDIUM').notNull(),status:reportStatusEnum().default('SUBMITTED').notNull(),createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),updatedAt:timestamp('updated_at',{withTimezone:true}).defaultNow().notNull()},t=>[index('safety_report_subject_status_idx').on(t.reportedUserId,t.status),index('safety_report_queue_idx').on(t.status,t.severity,t.createdAt),check('safety_report_target_check',sql`${t.reportedUserId} IS NOT NULL OR ${t.travelCircleId} IS NOT NULL OR ${t.journeyId} IS NOT NULL OR ${t.messageId} IS NOT NULL OR ${t.meetupId} IS NOT NULL`),check('safety_report_not_self',sql`${t.reportedUserId} IS NULL OR ${t.reportedUserId}<>${t.reporterUserId}`),check('safety_report_text_check',sql`(${t.description} IS NULL OR char_length(${t.description})<=2000) AND (${t.reportedContentSnapshot} IS NULL OR char_length(${t.reportedContentSnapshot})<=4000)`)]);
export const moderationCases=pgTable('moderation_case',{id:uuid().defaultRandom().primaryKey(),primaryReportId:uuid('primary_report_id').references(()=>safetyReports.id,{onDelete:'set null'}),subjectUserId:uuid('subject_user_id').notNull().references(()=>users.id,{onDelete:'restrict'}),priority:casePriorityEnum().default('NORMAL').notNull(),status:caseStatusEnum().default('OPEN').notNull(),assignedAdminId:uuid('assigned_admin_id').references(()=>users.id,{onDelete:'set null'}),summaryInternal:text('summary_internal'),openedAt:timestamp('opened_at',{withTimezone:true}).defaultNow().notNull(),updatedAt:timestamp('updated_at',{withTimezone:true}).defaultNow().notNull(),resolvedAt:timestamp('resolved_at',{withTimezone:true})},t=>[index('moderation_case_subject_status_idx').on(t.subjectUserId,t.status),index('moderation_case_queue_idx').on(t.priority,t.status,t.openedAt)]);
export const moderationCaseReports=pgTable('moderation_case_report',{moderationCaseId:uuid('moderation_case_id').notNull().references(()=>moderationCases.id,{onDelete:'cascade'}),safetyReportId:uuid('safety_report_id').notNull().references(()=>safetyReports.id,{onDelete:'restrict'}),linkedAt:timestamp('linked_at',{withTimezone:true}).defaultNow().notNull()},t=>[primaryKey({columns:[t.moderationCaseId,t.safetyReportId]}),uniqueIndex('report_one_case_uq').on(t.safetyReportId)]);
export const moderationCaseNotes=pgTable('moderation_case_note',{id:uuid().defaultRandom().primaryKey(),moderationCaseId:uuid('moderation_case_id').notNull().references(()=>moderationCases.id,{onDelete:'cascade'}),authorAdminId:uuid('author_admin_id').notNull().references(()=>users.id,{onDelete:'restrict'}),noteType:caseNoteTypeEnum().notNull(),body:text().notNull(),createdAt:timestamp('created_at',{withTimezone:true}).defaultNow().notNull()},t=>[index('moderation_note_case_idx').on(t.moderationCaseId,t.createdAt),check('moderation_note_body_check',sql`char_length(${t.body}) between 2 and 4000`)]);
export const accountRestrictions=pgTable('account_restriction',{id:uuid().defaultRandom().primaryKey(),userId:uuid('user_id').notNull().references(()=>users.id,{onDelete:'restrict'}),restrictionType:accountRestrictionTypeEnum('restriction_type').notNull(),status:restrictionStatusEnum().default('ACTIVE').notNull(),reasonCode:text('reason_code').notNull(),reasonInternal:text('reason_internal'),appliedBy:uuid('applied_by').notNull().references(()=>users.id,{onDelete:'restrict'}),appliedAt:timestamp('applied_at',{withTimezone:true}).defaultNow().notNull(),expiresAt:timestamp('expires_at',{withTimezone:true}),revokedBy:uuid('revoked_by').references(()=>users.id,{onDelete:'restrict'}),revokedAt:timestamp('revoked_at',{withTimezone:true})},t=>[uniqueIndex('one_active_restriction_type_uq').on(t.userId,t.restrictionType).where(sql`${t.status}='ACTIVE'`),index('restriction_user_status_type_idx').on(t.userId,t.status,t.restrictionType),index('restriction_expiry_idx').on(t.status,t.expiresAt)]);

export const userRelations = relations(users, ({ one, many }) => ({ profile: one(pcmProfiles), verifications: many(pcmVerifications), sessions: many(sessions) }));
