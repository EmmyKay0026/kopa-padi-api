# Tester bug reports

Set `TEST_MODE=true` in the **backend** environment to enable the floating Lucide bug-report button across the paired frontend. `TEST_MODE=false` (or unset) disables it. Only exact lowercase `true` enables reporting. Restart/reload the API process after editing its environment; this feature does not require rebuilding the frontend. Do not restart a live process without the normal release approval.

The frontend reads the public `/api/test-mode` boolean with no caching, on load, window focus and every 60 seconds. Network failures hide the button. Submission also checks the backend flag, so a stale tab cannot submit after the switch is off. No authentication, matching, safety, notifications or other business rules are relaxed by test mode.

Testers sign in, click **Report a bug**, enter a summary (5-160 characters) and description (10-4000), then submit. A database-generated reference confirms persistence. Active users do not need PCM verification to report bugs. Anonymous visitors are prompted to sign in. Existing account restrictions remain in force.

Admins open **Operations > Bug reports**, the mobile admin menu, or `/admin/bug-reports`. The latest 100 reports appear newest first; admins can resolve or reopen them. Inbox API routes require an active ADMIN session even if the UI is bypassed. The inbox remains available with test mode off. This is separate from safety moderation and grants no safety capabilities.

Only tester-supplied text, session-derived reporter ID, status and timestamps are stored. No automatic URL, token, console log, precise location, screenshot or document collection occurs. Descriptions are rendered as escaped plain text. The form asks testers to exclude private information. Reports inherit the existing API rate limit and origin checks. Reports are retained until operator-managed removal; deleting the reporting account cascades to its reports. A time-based retention policy is not introduced. No emails or external issues are sent.

## Database/release prerequisite

New migration `drizzle/0011_bug_reports.sql` creates the dedicated table, constraints, user foreign key and inbox index. Deploying this feature needs a reviewed migration, recoverable backup and the normal release process. The previous frozen releases/reports predate this feature. Nothing in this task authorizes production migration or deployment. Deploy the schema/backend before the frontend. For rollback, disable TEST_MODE first; keep the additive table/data when rolling application code back.

## Local validation

From this backend directory, using Node 22.22.1:

- `node test/p24/local.mjs node_modules/vitest/vitest.mjs run src`
- `node --test test/p2/guard.test.mjs`
- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/typescript/bin/tsc -p tsconfig.build.json`
- `node test/p24/local.mjs test/bug-reports.integration.mjs`
- `node test/p24/local.mjs test/bug-reports.http.mjs`

The integration test checks both configured URL and actual PostgreSQL identity before writes, runs migrations only in `kopa_padi_p2_e2e` on localhost:5432, and cleans up its synthetic account/reports. It never resets fixtures or sends notifications. Never run it on hosted databases. The existing safety guards remain unchanged.

## Executed validation (23 October 2026)

- Backend typecheck and production build: passed (Node 22.22.1).
- Backend Vitest `run src`: 24 files, 179 tests passed, including 15 new bug-report tests.
- Node database-guard regression: 1 passed.
- Guarded real PostgreSQL migration/service integration: passed; fixtures deleted.
- Guarded real HTTP integration: passed for true/false flags, no-store, anonymous rejection, forged fields, hostile origins, authenticated submission, admin read/update authorization, disabled submission, retained inbox and request ID. Local child API processes stopped and fixtures deleted.
- Frontend: 18 tests passed; typecheck, Next build and Vinext build passed. Native browser automation was unavailable (browser inventory timed out); visual/mobile/modal interaction QA remains manual.
- Git whitespace checks: passed; existing CRLF normalization warnings remain. Vinext emitted non-blocking plugin timing, ineffective dynamic-import and route-classification warnings.
- Initial broad Vitest invocation incorrectly collected the existing `node:test` guard file and reported no Vitest suite; corrected by running source Vitest tests and the Node guard test separately. The first draft HTTP test had a quoting syntax error before any fixture writes; fixed and rerun successfully.
- No production access, deployment, real email, commit or push. Existing unrelated frontend/logo/icon and backend SMTP/database configuration changes preserved.

Changed files for this feature: backend `src/bug-reports/*`, `src/app.module.ts`, `src/db/schema.ts`, `drizzle/0011_bug_reports.sql`, `drizzle/meta/0011_snapshot.json`, `drizzle/meta/_journal.json`, `test/bug-reports.integration.mjs`, `test/bug-reports.http.mjs`, `.gitignore`, this document; frontend `components/bug-report-widget.tsx`, `components/bug-report-inbox.tsx`, `app/admin/bug-reports/page.tsx`, `app/layout.tsx`, `components/user-navigation.tsx`, `components/operations-dashboard.tsx`.
