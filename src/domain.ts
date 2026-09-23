export const ACCOUNT_STATUSES = [
  "ACTIVE",
  "RESTRICTED",
  "SUSPENDED",
  "CLOSED",
] as const;
export const ROLES = ["USER", "ADMIN"] as const;
export const VERIFICATION_STATUSES = [
  "UNVERIFIED",
  "SUBMITTED",
  "UNDER_REVIEW",
  "VERIFIED",
  "REJECTED",
  "RESUBMISSION_REQUIRED",
  "REVOKED",
] as const;
export const REJECTION_REASONS = [
  "DOCUMENT_UNREADABLE",
  "DOCUMENT_INCOMPLETE",
  "POSTING_INFORMATION_MISMATCH",
  "UNABLE_TO_VERIFY",
  "DUPLICATE_OR_SUSPICIOUS_SUBMISSION",
  "OTHER",
] as const;
export const DOCUMENT_TYPES = [
  "CALLUP_LETTER",
  "IDENTITY_DOCUMENT",
  "SELFIE",
  "OTHER",
] as const;
export const AUDIT_ACTIONS = [
  "VIEWED_VERIFICATION_DOCUMENT",
  "STARTED_VERIFICATION_REVIEW",
  "APPROVED_PCM_VERIFICATION",
  "REJECTED_PCM_VERIFICATION",
  "REQUESTED_PCM_RESUBMISSION",
  "REVOKED_PCM_VERIFICATION",
  "TRAVEL_PLAN_CREATED",
  "TRAVEL_PLAN_UPDATED",
  "TRAVEL_PLAN_CANCELLED",
  "JOURNEY_GUIDE_CREATED",
  "JOURNEY_GUIDE_EDITED",
  "JOURNEY_GUIDE_SUBMITTED_FOR_REVIEW",
  "JOURNEY_GUIDE_PUBLISHED",
  "JOURNEY_GUIDE_RETIRED",
  "VIEWED_PRIVATE_MESSAGE_FOR_SAFETY",
  "VIEWED_TRUSTED_CONTACT_DATA",
  "VIEWED_PRECISE_JOURNEY_LOCATION",
  "SAFETY_REPORT_TRIAGED",
  "MODERATION_CASE_OPENED",
  "MODERATION_CASE_ASSIGNED",
  "MODERATION_NOTE_ADDED",
  "RESTRICTION_APPLIED",
  "RESTRICTION_REVOKED",
  "USER_SUSPENDED",
  "USER_UNSUSPENDED",
  "VERIFICATION_REVIEW_REQUESTED",
  "CASE_RESOLVED",
  "CASE_DISMISSED",
] as const;
export const TRAVEL_PLAN_STATUSES = [
  "DRAFT",
  "SEARCHING",
  "MATCHED",
  "IN_CIRCLE",
  "LOCKED",
  "IN_JOURNEY",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
] as const;
export const DEPARTURE_WINDOWS = [
  "EARLY_MORNING",
  "MORNING",
  "LATE_MORNING",
  "AFTERNOON",
  "FLEXIBLE",
] as const;
export const TRANSPORT_MODES = [
  "COMMERCIAL_BUS",
  "TRAIN",
  "FLIGHT",
  "PRIVATE_VEHICLE",
  "UNDECIDED",
] as const;
export const GROUP_PREFERENCES = ["ANY_VERIFIED_PCM"] as const;
export const CANCELLATION_REASONS = [
  "TRAVEL_NO_LONGER_NEEDED",
  "TRAVEL_DATE_CHANGED",
  "TRANSPORT_CHANGED",
  "CREATED_BY_MISTAKE",
  "OTHER",
] as const;
export const MATCHING_RESTRICTIONS = [
  "MATCHING_DISABLED",
  "TRAVEL_PLAN_DISABLED",
] as const;
export const JOURNEY_COHORT_STATUSES = ["OPEN", "CLOSED"] as const;
export const TRAVEL_CIRCLE_STATUSES = [
  "FORMING",
  "READY",
  "FULL",
  "LOCKED",
  "IN_JOURNEY",
  "ARRIVED",
  "CLOSED",
  "DISSOLVED",
] as const;
export const CIRCLE_MEMBERSHIP_STATUSES = [
  "JOINED",
  "CONFIRMED",
  "LEFT",
  "REMOVED",
] as const;
export const MATCH_OFFER_TYPES = [
  "ALTERNATIVE_DATE",
  "ALTERNATIVE_TIME",
  "ALTERNATIVE_TRANSPORT",
  "COMMON_HUB",
  "NEARBY_ORIGIN",
] as const;
export const MATCH_OFFER_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
  "WITHDRAWN",
] as const;
export const MATCH_RESULT_TYPES = [
  "NO_MATCH",
  "JOINED_EXISTING_CIRCLE",
  "CREATED_FORMING_CIRCLE",
  "ALTERNATIVE_OFFER_CREATED",
  "ALREADY_MATCHED",
  "INELIGIBLE",
] as const;
export const MATCHING_ALGORITHM_VERSION = "v1" as const;
export const CIRCLE_MESSAGE_TYPES = [
  "TEXT",
  "SYSTEM",
  "SAFETY_NOTICE",
] as const;
export const MEETUP_STATUSES = ["PROPOSED", "AGREED", "CANCELLED"] as const;
export const SAFETY_REPORT_CATEGORIES = [
  "UNSAFE_MEETUP",
  "HARASSMENT",
  "IMPERSONATION",
  "SPAM",
  "OTHER",
] as const;
export const SAFETY_REPORT_STATUSES = ["OPEN", "REVIEWED", "RESOLVED"] as const;
export const CIRCLE_NOTIFICATION_TYPES = [
  "TRAVEL_CONFIRMATION_REQUIRED",
  "CIRCLE_LOCKED",
] as const;
export const JOURNEY_MODES = ["CIRCLE", "SOLO"] as const;
export const JOURNEY_STATUSES = [
  "PREPARING",
  "READY_TO_START",
  "IN_PROGRESS",
  "NEEDS_ATTENTION",
  "ARRIVED",
  "COMPLETED",
  "CANCELLED",
] as const;
export const JOURNEY_CHECKIN_TYPES = [
  "STARTED",
  "SAFE",
  "CONNECTION_REACHED",
  "NEAR_DESTINATION",
  "ARRIVED",
  "NEED_HELP",
] as const;
export const JOURNEY_SHARE_STATUSES = ["ACTIVE", "REVOKED", "EXPIRED"] as const;
export const LOCATION_SHARE_AUDIENCES = ["TRUSTED_CONTACT", "CIRCLE"] as const;
export const GUIDE_ORIGIN_SCOPES = [
  "TOWN",
  "LGA",
  "TRAVEL_HUB",
  "STATE_AREA",
] as const;
export const GUIDE_STATUSES = [
  "DRAFT",
  "UNDER_REVIEW",
  "PUBLISHED",
  "NEEDS_REVIEW",
  "RETIRED",
] as const;
export const GUIDE_CONFIDENCE_LEVELS = [
  "HIGH",
  "MEDIUM",
  "LOW",
  "UNVERIFIED",
] as const;
export const JOURNEY_LEG_TYPES = [
  "LOCAL_TO_ORIGIN_HUB",
  "INTERCITY",
  "REGIONAL_TRANSFER",
  "DESTINATION_ARRIVAL",
  "FINAL_CAMP_CONNECTION",
  "OTHER",
] as const;
export const GUIDE_SOURCE_TYPES = [
  "OFFICIAL_NYSC",
  "OPENSTREETMAP",
  "OSRM",
  "ADMIN_RESEARCH",
  "TRAVELLER_FEEDBACK",
  "MANUAL_REVIEW",
  "OTHER",
] as const;
export const GUIDE_TRANSPORT_MODES = [
  "COMMERCIAL_BUS",
  "TRAIN",
  "FLIGHT",
  "LOCAL_TRANSIT",
  "WALK",
  "OTHER",
] as const;
export const GUIDE_ACCURACY_RESPONSES = ["YES", "MOSTLY", "NO"] as const;
export const FINAL_CONNECTION_RESPONSES = ["YES", "NO", "NOT_SURE"] as const;
export const GUIDE_FEEDBACK_ISSUES = [
  "ROUTE_CHANGED",
  "HUB_INCORRECT",
  "FINAL_CONNECTION_INCORRECT",
  "DURATION_INACCURATE",
  "INSTRUCTION_UNCLEAR",
  "SAFETY_CONCERN",
  "OTHER",
] as const;
export const SAFETY_REPORT_CATEGORIES_V2 = [
  "HARASSMENT",
  "MONEY_REQUEST",
  "SCAM",
  "UNSAFE_MEETUP",
  "IDENTITY_CONCERN",
  "THREATENING_BEHAVIOUR",
  "SPAM",
  "STALKING_OR_PROBING",
  "IMPERSONATION",
  "OTHER",
] as const;
export const REPORT_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const REPORT_STATUSES = [
  "SUBMITTED",
  "TRIAGED",
  "UNDER_REVIEW",
  "ACTION_TAKEN",
  "RESOLVED",
  "DISMISSED",
  "DUPLICATE",
] as const;
export const CASE_PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
export const CASE_STATUSES = [
  "OPEN",
  "TRIAGED",
  "IN_REVIEW",
  "AWAITING_INFORMATION",
  "ACTION_REQUIRED",
  "RESOLVED",
  "DISMISSED",
] as const;
export const CASE_NOTE_TYPES = [
  "INTERNAL",
  "EVIDENCE",
  "DECISION",
  "FOLLOW_UP",
] as const;
export const ACCOUNT_RESTRICTION_TYPES = [
  "MATCHING_DISABLED",
  "MESSAGING_DISABLED",
  "TRAVEL_PLAN_DISABLED",
  "VERIFICATION_REVIEW_REQUIRED",
  "ACCOUNT_SUSPENDED",
] as const;
export const RESTRICTION_STATUSES = ["ACTIVE", "EXPIRED", "REVOKED"] as const;
export const ADMIN_CAPABILITIES = [
  "safety_reports.read",
  "safety_reports.triage",
  "moderation_cases.read",
  "moderation_cases.manage",
  "account_restrictions.read",
  "account_restrictions.apply",
  "account_restrictions.revoke",
  "verification.review",
  "messages.review_for_safety",
  "audit_logs.read",
  "users.suspend",
  "trusted_contacts.review_for_safety",
  "journey_locations.review_for_safety",
] as const;
export const JOURNEY_CHECKLIST_ITEMS = [
  ["PHONE_CHARGED", "Phone charged"],
  ["DOCUMENTS_SECURED", "Important travel documents secured"],
  ["TRUSTED_PERSON_INFORMED", "Trusted person informed"],
  ["DEPARTURE_POINT_UNDERSTOOD", "Departure point understood"],
  ["DESTINATION_CONFIRMED", "Destination/camp address confirmed"],
  ["EMERGENCY_FUNDS", "Enough emergency funds available"],
  ["PUBLIC_PICKUP_ONLY", "Avoid unknown/private pickup points"],
  ["VALUABLES_DISCREET", "Keep valuables discreet"],
  ["COMMUNICATE_IN_APP", "Keep early communication in-app"],
  ["NO_STRANGER_PAYMENTS", "Do not send money to strangers"],
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
const transitions: Readonly<
  Record<VerificationStatus, readonly VerificationStatus[]>
> = {
  UNVERIFIED: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["VERIFIED", "REJECTED", "RESUBMISSION_REQUIRED"],
  VERIFIED: ["REVOKED"],
  REJECTED: [],
  RESUBMISSION_REQUIRED: ["SUBMITTED"],
  REVOKED: [],
};
export function assertTransition(
  from: VerificationStatus,
  to: VerificationStatus,
) {
  if (!transitions[from].includes(to))
    throw new Error(`Invalid verification transition: ${from} -> ${to}`);
}
export function canAccessVerifiedArea(
  accountStatus: string,
  verificationStatus: string,
) {
  return accountStatus === "ACTIVE" && verificationStatus === "VERIFIED";
}
