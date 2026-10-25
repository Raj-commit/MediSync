# PROGRESS.md: MediSync status and handoff

Living file. Update it at the end of every work session and in every PR. It is what lets a different AI (or teammate) pick up exactly where you stopped.

Last updated: 2026-10-26  by: Riyank

## Current work

- Branch: `feature/appointment-management-ui`
- Feature: appointment-management (UI done, frontend)
- Last thing finished: FR-09 & FR-10 frontend implementation: /patient/appointments and /doctor/appointments with Upcoming/Past segmented tabs, status filtering, pagination, patient cancel (with accessible confirmation dialog), patient reschedule (with inline slot picker and 409 SLOT_TAKEN auto-reload), doctor accept, reject (with confirmation dialog), and complete actions, full Vitest coverage (appointments.service.spec.ts, patient-appointments.spec.ts, doctor-appointments.spec.ts)
- Next step: Open PR for feature/appointment-management-ui; notifications (FR-18)
- Blockers or open questions: none

## Feature status

Statuses: `not started`, `in progress`, `in review`, `done`.

| # | Feature | API | UI | Owner | Notes |
|---|---|---|---|---|---|
| 1 | project-setup | done | n/a | Team | Backend skeleton, Django wiring and frontend shell are on main |
| 2 | auth | done | done | Alis (API), Uday Raj (UI) | API merged in PR #14, UI in PR #12. Seed the admin with node scripts/seed-admin.js |
| 3 | profiles | done | done | Hitanshu (API), Alis (UI) | GET & PUT /users/me, GET /doctors with search & pagination. UI at /patient/profile and /doctor/profile with dirty-field updates, full Vitest coverage |
| 4 | doctor-availability | done | done | Riyank (API), Uday Raj (UI) | API merged in PR #19. UI at /doctor/availability with range generator, booked slot protection, full Vitest coverage |
| 5 | appointment-booking | done | done | Alis | Merged in PR #20 (API) and PR #22 (UI). UI at /patient/doctors and /patient/doctors/:id with slot selection, conflict reload, in-page confirmation, full Vitest coverage |
| 6 | appointment-management | done | done | Uday Raj (API), Riyank(UI) | Merged in PR #23 (API). UI at /patient/appointments and /doctor/appointments with cancel, reschedule, accept, reject, complete, full Vitest coverage |
| 7 | notifications | not started | not started | | |
| 8 | chat | not started | not started | | |
| 9 | video-consultation | not started | not started | | |
| 10 | medical-records | not started | not started | | |
| 11 | prescriptions | not started | not started | | |
| 12 | prescription-pdf | done | n/a | Uday Raj | Merged in PR #17. Django endpoint POST /api/prescriptions/pdf with ReportLab, timing-safe X-Service-Key check, escaping, and tests |
| 13 | symptom-checker | not started | not started | | |
| 14 | admin-user-management | not started | not started | | |
| 15 | polish-testing | not started | n/a | | |

## Decisions made

Record every decision so another AI does not reopen it. Add a line per decision.

| Date | Decision | Why |
|---|---|---|
| 2026-10-15 | Login response is `{ token, user: { id, name, email, role } }` | TEAM_GUIDE section 1 |
| 2026-10-15 | Token sent as `Authorization: Bearer <token>`, stored in localStorage, expires in 1 day | TEAM_GUIDE section 1 |
| 2026-10-15 | Registration is patient and doctor only. Admin is created by a seed script. Doctors are active immediately | TEAM_GUIDE section 1 |
| 2026-10-15 | Password minimum is 8 characters | TEAM_GUIDE section 1 |
| 2026-10-15 | Appointment slot is 30 minutes, future dates only | TEAM_GUIDE section 1 |
| 2026-10-15 | Cancel or reschedule allowed until 1 hour before the start | TEAM_GUIDE section 1 |
| 2026-10-15 | PDF library is ReportLab | TEAM_GUIDE section 1 |
| 2026-10-15 | Symptom checker: rule-based stub first, real LLM call later, in its own module (`symptom_checker/engine.py`) | TEAM_GUIDE section 1 |
| 2026-10-15 | MongoDB: each person uses their own local database while developing | TEAM_GUIDE section 1 |
| 2026-10-21 | Register request body: `role` (patient or doctor), `name`, `email`, `phone`, `password`; patient adds `dateOfBirth` (YYYY-MM-DD) and `address`; doctor adds `specialisations` (array of strings) and `qualification` | The UI sends exactly this, field names follow the data model in AGENTS.md section 5 |
| 2026-10-21 | Login request body is `{ email, password }`. Errors are `{ message, code }`, and the UI shows `message` to the user as written, so messages must be safe to display | Frontend and API agree on one error shape |
| 2026-10-21 | After login the UI opens `/patient`, `/doctor` or `/admin` by role. The UI guards only hide screens, so the API must check the role on every request | Defence stays on the server |
| 2026-10-22 | `GET /api/v1/auth/me` returns `{ user: { id, name, email, role } }` | The UI contract did not say. Kept minimal, full profile data belongs to the profiles feature |
| 2026-10-22 | Auth middleware loads the user from the database on every request. The role always comes from the database, never from the token. A disabled or deleted user is rejected at once | Role is checked on the server (AGENTS.md). Disabling an account takes effect immediately |
| 2026-10-22 | Error codes: `INVALID_CREDENTIALS` 401, `UNAUTHORIZED` 401 (no token), `INVALID_TOKEN` 401 (bad or expired token), `FORBIDDEN` 403, `ACCOUNT_DISABLED` 403, `EMAIL_TAKEN` 409, `VALIDATION_ERROR` 400, `INVALID_JSON` 400, `TOO_MANY_ATTEMPTS` 429. Register answers 201 with `{ user }`. Login allows 10 failed attempts per 15 minutes | Shared codes for the UI and later features |
| 2026-10-22 | Backend tests use a separate database from `MONGODB_URI_TEST`. Its name must end with `_test`. Jest runs with `--runInBand` | Tests delete data, so they must never touch the real database. No new dependency |
| 2026-10-22 | Admin is created with `node scripts/seed-admin.js` from ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD and optional ADMIN_PHONE. Safe to run twice, never changes an existing account | TEAM_GUIDE section 1 says admin is created by a seed script |
| 2026-10-22 | Refresh tokens: none. Access token only, a 1-day JWT. When it expires the UI logs the user out and they log in again | Fewer moving parts. The UI already ends the session on a 401. Revisit only if time is left in week 4 |
| 2026-10-22 | Video (WebRTC): public STUN (`stun:stun.l.google.com:19302`) while developing. For the deployed demo, add a free hosted TURN service as a fallback. ICE server details come from backend env variables and reach the UI through the API, never hardcoded in the frontend | STUN works on most home and college networks, TURN covers strict ones, and there is no server to run |
| 2026-10-22 | Deployment: frontend as a Render Static Site, Express and Django as Render free Web Services (Django is public but only answers requests with the right `X-Service-Key`), database on MongoDB Atlas M0. Everything over HTTPS. Free services sleep when idle, so open both /api health URLs a few minutes before a demo. Running locally is the fallback. Deploy a skeleton in week 2 | One platform, free, WebSockets work, and browsers only allow camera and microphone on HTTPS or localhost |
| 2026-10-22 | Prescription PDFs are stored in MongoDB, not on disk. `pdfUrl` holds the API path `/api/v1/prescriptions/:id/pdf`, and the file is sent only through that endpoint after the access checks | A free host wipes its disk on restart. MongoDB already holds the records, and access control stays in Express |
| 2026-10-22 | Symptom checker: the rule-based engine is the deliverable. A real LLM call is a stretch goal after the core features, with its key in env and a "not medical advice" notice | Keeps the demo reliable |
| 2026-10-23 | ServiceKeyMiddleware checks X-Service-Key via secrets.compare_digest, exempts GET /health, refuses all requests if AI_SERVICE_KEY is unset | Prevents timing attacks, prevents accidental open access when key is misconfigured |
| 2026-10-23 | Prescription PDF endpoint: input fields escaped with html.escape(quote=True) before ReportLab Paragraph rendering; PDF generated in-memory with BytesIO | Prevents XML/markup injection in ReportLab; avoids ephemeral disk writes |
| 2026-10-24 | Profile response shape: `GET /api/v1/users/me` and `PUT /api/v1/users/me` return `{ user: { id, name, email, phone, role, ...(role-specific fields) } }`. Patient adds `dateOfBirth` (YYYY-MM-DD) and `address`. Doctor adds `specialisations` (array) and `qualification`. Admins have no profile in requirements and receive 403 `FORBIDDEN`. Secrets (`passwordHash`, `__v`) are never returned | Consistent with `GET /auth/me` envelope (`{ user }`) and encapsulates role-specific profile details safely |
| 2026-10-24 | Profile update rules: `PUT /api/v1/users/me` performs partial updates on allowed editable fields (`name`, `phone` for both; `dateOfBirth`, `address` for patient; `specialisations`, `qualification` for doctor). Protected fields (`email`, `password`, `role`, `isActive`, `id`) and cross-role fields are rejected with 400 `VALIDATION_ERROR`. At least one field required | Allows seamless single-field edits from UI without requiring full replace, while protecting sensitive account properties |
| 2026-10-24 | Doctor search response shape & rules: `GET /api/v1/doctors` returns `{ doctors: [{ id, name, specialisations, qualification }], pagination: { page, limit, total, totalPages } }`. Patient role required (403 for doctors/admins). Only active doctors (`isActive: true`) are listed. Contact info (`email`, `phone`) and credentials are hidden. Search parameters `name` and `specialisation` are sanitized against regex injection; `limit` capped at 50 | UC-04 step 1 contract for patient doctor discovery; prevents doctor phone/email harvesting, NoSQL injection, and ReDoS |
| 2026-10-24 | Profile validation uses dedicated `validateProfile.js` rather than modifying `validateRegister.js` | Follows AGENTS.md rule 10.5 (do not edit merged code outside current feature) |
| 2026-10-24 | Slot storage: dedicated `Slot` collection (`backend/src/models/Slot.js`) with compound unique index `{ doctor: 1, startTime: 1 }` | Guarantees at database level no doctor has duplicate/overlapping start times; enables atomic double-booking prevention in FR-08 via `findOneAndUpdate({ _id, isBooked: false }, { isBooked: true })` |
| 2026-10-24 | Slot rules: strictly 30 minutes, ISO 8601 UTC ending in Z, future dates only, max 60 days ahead, max 50 slots per request, no internal overlaps | Enforces appointment slot duration agreement, prevents calendar spam and far-future stale slots |
| 2026-10-24 | Availability update: `PUT /api/v1/doctors/me/availability` performs full replacement of unbooked future slots; already booked slots can never be deleted or modified | Simple calendar sync for doctor UI while guaranteeing patient appointments are never orphaned or modified |
| 2026-10-24 | Availability response shapes: `GET /me/availability` and `PUT /me/availability` return `{ slots: [{ id, startTime, endTime, isBooked }] }`. `GET /:id/availability` returns `{ doctor: { id, name }, slots: [{ id, startTime, endTime, isBooked }] }` (only unbooked future slots, doctor contact info strictly hidden) | Minimal, consistent envelope protecting doctor privacy and matching patient discovery flow |
| 2026-10-24 | Appointment booking request body: `{ doctorId, slotId }`. `patientId` and `status` in body are strictly rejected (400 `VALIDATION_ERROR`) | Patient identity always comes from verified JWT (`req.user.id`). Prevents privilege escalation and tampering |
| 2026-10-24 | Appointment response shape: 201 with `{ appointment: { id, doctor: { id, name }, dateTime, endTime, status } }`. Secrets (`email`, `phone`, `passwordHash`) strictly hidden | Matches UI contract and AGENTS.md section 8 rule 3 privacy requirements |
| 2026-10-24 | Status on creation: `requested`. Slot is marked `isBooked: true` in the same operation | Slot disappears from availability at once; doctor accepts or rejects later in FR-09 |
| 2026-10-24 | Error code: `SLOT_TAKEN` 409 | Agreed standard code when a requested slot is already booked or claimed concurrently |
| 2026-10-24 | Double-booking prevention: atomic claim via `Slot.findOneAndUpdate({ _id, doctor, isBooked: false }, { isBooked: true })` + partial unique indexes on Appointment (`{ doctor: 1, dateTime: 1 }` for `status: 'requested'` and `status: 'confirmed'`) + rollback slot release if appointment creation fails; no MongoDB transactions | Atomic document update prevents race conditions without replica sets/transactions; partial unique index provides database-level defense-in-depth |
| 2026-10-24 | Doctor availability UI route: `/doctor/availability` guarded by `roleGuard('doctor')`, linked from Doctor Dashboard | Doctor-only screen, consistent title format (`Doctor availability \| MediSync`), redirects unauthorized users |
| 2026-10-24 | Slot generator (Option c): Range Generator allows selecting date, start time, and end time; automatically segments into 30-min slots; supports single slot via 30-min window | Fastest clinic scheduling workflow for doctors; automatically skips duplicates and existing overlaps |
| 2026-10-24 | Timezone handling in UI: slots are grouped by day and formatted in browser local time for the doctor; converted to and transmitted as UTC ISO 8601 strings ending in `Z` | Eliminates timezone confusion for doctors while keeping backend canonical time in UTC |
| 2026-10-24 | Booked slot protection in UI: booked slots display a locked indicator and never render a remove button; `PUT` request payload strictly excludes booked slots | Complies with backend immutability rule, preventing accidental appointment deletion or 400 rejection |
| 2026-10-24 | Doctor search & booking routes: `/patient/doctors` (search) and `/patient/doctors/:id` (booking) guarded by `roleGuard('patient')`, linked from Patient Dashboard | Enforces patient-only access and clean separate views for doctor discovery and slot booking |
| 2026-10-24 | Doctor details handling (Option 1): Passed through router navigation state (`state: { doctor }`) from search list; on direct navigation or refresh, falls back to `GET /doctors/:id/availability` doctor metadata | Fast immediate transition with qualification & specialisations when coming from search, reliable fallback on direct URL/refresh |
| 2026-10-24 | Booking confirmation view (Option 1): On 201 response, booking screen is replaced with an in-page confirmation card displaying doctor name, local appointment time, `requested` status badge with explanation, and navigation buttons (`[Book another appointment]` -> `/patient/doctors`, `[Back to Dashboard]` -> `/patient`) | Clean user reassurance without full page reload; makes next steps clear |
| 2026-10-24 | Slot conflict handling: On 409 `SLOT_TAKEN`, displays the server's error message, clears current slot selection, and immediately refreshes the doctor's open availability slots | Seamless recovery for patient if another user books the slot concurrently |
| 2026-10-25 | Separate profile routes & components (Option 1): `/patient/profile` (`roleGuard('patient')`) and `/doctor/profile` (`roleGuard('doctor')`), linked from dashboards | Separates patient and doctor forms and validations cleanly without dynamic control toggling, matches existing feature layout |
| 2026-10-25 | Welcome name sync (Option 1): `AuthService.updateUser({ name })` updates the stored user signal and `localStorage` on successful profile save | Dashboards immediately reflect the updated name without requiring re-login |
| 2026-10-25 | Profile update payload: UI sends strictly modified (dirty) fields in `PUT /users/me`, email is rendered read-only and never transmitted | Complies with backend validation rejecting email, role, id, and cross-role fields |
| 2026-10-26 | Appointment lifecycle PATCH body: explicit action-based requests `{ action: "cancel" }`, `{ action: "reschedule", slotId }`, `{ action: "accept" }`, `{ action: "reject" }`, and `{ action: "complete" }`. Unknown fields and unauthorized actions strictly rejected with 400 `VALIDATION_ERROR` or 403 `FORBIDDEN` | Explicit intention per request, eliminates ambiguous partial updates and ensures strict role-based state transitions |
| 2026-10-26 | Rescheduling resets status to `requested` (even if previously confirmed); claims target slot atomically, updates appointment, releases old slot, and rolls back target slot if appointment update fails; target slot must belong to the same doctor and be in the future | Guarantees doctor re-acceptance for changed timing, prevents slot double-booking or orphaning |
| 2026-10-26 | Doctor completion: doctor-only action `{ action: "complete" }` allowed only when appointment status is `confirmed` and `dateTime <= now`. Premature completion rejected with 400 `VALIDATION_ERROR`. Completed appointments keep their slot marked as booked | Prevents premature or unauthorized consult completions; preserves slot history for records and prescriptions |
| 2026-10-26 | Appointment history filters & sorting: `GET /api/v1/appointments` supports `when=upcoming` (`dateTime >= now`, sorted ascending), `when=past` (`dateTime < now`, sorted descending), default (all, sorted descending), `status` filter, and pagination (`page`, `limit` 1..50) | Matches patient and doctor dashboard requirements, chronological order for upcoming appointments, reverse chronological for history |
| 2026-10-26 | Privacy & ownership on appointments: appointments are accessible only by the owning patient or doctor; responses populate only the other party's `{ id, name }`; accessing unowned or non-existent appointment returns 404 `NOT_FOUND` to prevent ID enumeration; admins receive 403 `FORBIDDEN` | Complies with AGENTS.md section 8 rule 3 and prevents data harvesting |
| 2026-10-26 | Separate appointment pages (Choice a): `/patient/appointments` (`roleGuard('patient')`) and `/doctor/appointments` (`roleGuard('doctor')`), linked from dashboards | Separates patient-specific (cancel, reschedule slot picker) and doctor-specific (accept, reject, complete) action workflows cleanly without bloated branching in templates |
| 2026-10-26 | Inline rescheduling drawer (Choice b): clicking Reschedule expands an inline slot selector loaded via `GET /doctors/:id/availability`; on 409 `SLOT_TAKEN`, automatically refreshes open slots and clears selection | Smooth user experience keeping card context without page reloads or full modal navigation; immediate conflict recovery |
| 2026-10-26 | Upcoming vs Past timeline tabs (Choice c): segmented tabs for Upcoming and Past with separate Status dropdown (`All`, `Requested`, `Confirmed`, `Completed`, `Cancelled`) | Matches natural clinical workflow and mental model; keyboard accessible with `role="tablist"` and `aria-selected` |
| 2026-10-26 | Confirmation dialogs for destructive actions: accessible modal dialogs for patient cancel and doctor reject (`role="dialog"`, `aria-modal="true"`, ESC key listener) | Prevents accidental appointment cancellations and doctor slot rejections |

## Deviations from AGENTS.md or PROJECT_CONTEXT.md

- Added the optional env variable `ADMIN_PHONE` (default placeholder +910000000000), because the User model requires a phone for every user, including the admin.
- Added the env variable `MONGODB_URI_TEST` for the separate test database.
- Booking does not trigger asynchronous notifications yet. The notifications feature (FR-18) will hook in once built.
- Stored `endTime` (Date) and `slot` (ObjectId reference to `Slot`) on the `Appointment` model to maintain slot lifecycle integrity and easy duration queries.

## Known issues

- A logged-in user can still open `/login` and `/register` by typing the address. They are not redirected to their dashboard yet.
- Backend tests pass `runtimeAdapters: { os: require('os') }` in tests/helpers/db.js because of the MongoDB driver bug NODE-7832 (driver 7.6 and later, under Jest). Remove it once a fixed driver is released.

## How to hand over to another AI

Start a new chat or tool and paste the contents of these three files in this order: `AGENTS.md`, `PROJECT_CONTEXT.md`, `PROGRESS.md`. If the tool can read the repo, point it at the repo root instead. Then send:

```
You are continuing development of MediSync, a group college project. The three files
above are the full context. Read them completely first.

Current status is in PROGRESS.md under "Current work". Continue from "Next step".
Follow every rule in AGENTS.md, especially: only build listed features, work on the
current feature branch, do not commit or push unless I ask, and ask me when anything
is unclear.

Before writing code, tell me in 3 to 5 lines what you understood the project to be
and what you plan to do next. Wait for my go-ahead.

If you need to see existing code, ask me for the specific files. Do not assume what
they contain.
```

When you switch back, update this file first with what the other AI did and any decisions it made.
