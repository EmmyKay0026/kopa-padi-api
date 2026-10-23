# Permanent Circle locking by group approval

Implemented in the production-integration worktrees on 23 October 2026. This is uncommitted local work, not a production deployment.

## Policy and user flow

Automatic locking remains enabled at the existing scheduled cutoff (default two hours before the departure-window start, Africa/Lagos). Any active, verified PCM member may approve an earlier permanent lock. Required votes are `max(2, ceil(activeMembers / 2))`: 2/2, 2/3, 2/4, 3/5, 3/6. Each current member counts once. No admin or member unlock endpoint or action is added.

The Circle page shows the approval count, requirement and permanent-lock warning to every member. Approving or withdrawing requires confirmation. Approval may be withdrawn only before the Circle locks. Once the threshold is reached, the Circle and its active members' Travel Plans become LOCKED in the same transaction. Each user still prepares/starts their own Journey. Locking does not change the agreed departure date/window/transport and does not automatically start a Journey. Early locking enables the existing Journey start checks; prepared Journey schedules remain unchanged.

A locked Circle may still lose members or dissolve under existing leave/block/safety rules. Those exits are not an unlock and never reopen the Circle for matching. This change does not trap users in a Circle or remove safety withdrawal controls.

## Shared chat evidence

System chat messages record the initial permanent-lock request and consequences, approval totals, withdrawals, approval invalidation when membership changes, and final permanent locking. Automatic locks use the same final warning. Messages are stored server-side, so existing eligible members can read them after coming back online. Merely opening/cancelling a local confirmation dialog creates no chat message. Private prompts and shared system notices are distinct: only committed actions are announced.

Membership changes reset approvals; stale requests are rejected using a server-generated snapshot of Circle identity, schedule/transport and membership history. Confirmation of travel alone does not reset votes. Schedule changes are not implemented here; if another supported operation changes the schedule, its snapshot invalidates pending approvals, and the next vote records the reset in chat.

## Concurrency and security

Routes `GET /api/travel-circles/current/lock` and `POST /api/travel-circles/current/lock/approval` inherit authentication, active-account and verified-PCM requirements. The POST accepts only an opaque snapshot and boolean approve field; identity and Circle are resolved from the session. Former members and forged/stale submissions cannot vote.

Manual decisions serialize using the existing Circle advisory lock plus a row lock. Automatic and manual locking share one transactional helper, the same notification deduplication key and domain event. The matching batch update now also requires an open Circle status, preventing a stale worker from reopening a Circle whose member count did not change when it locked. Normal matching selection rules remain unchanged. Join and leave paths clear pending votes and write a shared reset notice.

## Migration and rollout

`drizzle/0012_circle_lock_approvals.sql` adds the Circle approval table. It must be reviewed and applied through the normal migration process before deploying the paired backend/frontend. It was applied only to guarded localhost `kopa_padi_p2_e2e` for tests. No hosted database was accessed, no production worker was run and no outbound emails were sent.

Deploy migration/backend before frontend. Back up first. Rolling application code back must retain the approval table/data and all LOCKED statuses; do not unlock Circles, delete votes, reset Travel Plans or replay domain/notification queues. There is no feature flag or production activation in this task.

## Validation commands

Use the approved Node 22.22.1 executable. Fixture-mutating suites run sequentially:

- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/typescript/bin/tsc -p tsconfig.build.json`
- `node test/p24/local.mjs test/circle-lock.integration.mjs`
- `node test/p24/local.mjs node_modules/vitest/vitest.mjs run src`

The integration script checks both configured URL and actual PostgreSQL identity before writes. It creates exact synthetic fixture IDs, never resets the database and deletes its own fixture records in finally. Before invoking the automatic worker it refuses if any non-fixture Circle could be affected. Never run the local harness on a hosted database.

Frontend checks: typecheck, 18 Node tests, Next build and Vinext build. Browser automation was unavailable during the recent local tasks; visual/mobile confirmation-dialog checks remain manual.

## Changed files for this feature

Backend: `src/circles/circle-lock.ts`, `src/circles/circle-lock.test.ts`, `src/circles/circle.controller.ts`, `src/circles/circle-lifecycle.service.ts`, `src/matching/matching.service.ts`, `src/common/public-errors.ts`, `src/app.module.ts`, `src/db/schema.ts`, migration 0012 and its generated snapshot/journal, `test/circle-lock.integration.mjs`, this document and its .gitignore exception.
Frontend: `components/circle-dashboard.tsx`. Existing Journey form, email diagnostics, branding assets, generated files and other unrelated local/staged changes were preserved.

## Executed results

- Backend typecheck and production build: passed with final runtime changes.
- Backend source unit tests: 26 files / 194 tests passed, including 9 new lock-rule tests and existing email/logging/security regressions.
- Final guarded integration: 12 groups passed. Covered threshold enforcement, duplicate/concurrent votes, stale matching, leaving after an early Journey start, vote preservation after lock, membership invalidation, shared chat messages, former-member rejection, real HTTP authentication/PCM/account/input checks and no-store headers, automatic cutoff behavior, and automatic/manual locking races.
- Final frontend: 18 tests passed; Next and Vinext production builds passed; route types regenerated after Vinext and final TypeScript check passed. A failed/stale approval closes the confirmation dialog and refreshes the Circle so the server error is visible and the user can review the new state.
- Local target guard regression: 1 passed. Git whitespace checks passed; existing CRLF normalization warnings remain.
- The first integration draft called a nonexistent fixture helper; corrected to the existing detachPlan method, cleanup ran, and all groups were rerun successfully. No fixtures were restored over existing data.
- No commits, pushes, deployments, live notification sends or changes to the user's existing Circle.

Final cleanup verification: exactly one pre-existing FORMING Circle remains and no synthetic lock fixture camps remain. Final backend/frontend whitespace checks passed. Vinext emitted existing non-fatal plugin timing, dynamic-import and static route-classification warnings.
