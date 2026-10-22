# PROGRESS.md: MediSync status and handoff

Living file. Update it at the end of every work session and in every PR. It is what lets a different AI (or teammate) pick up exactly where you stopped.

Last updated: 2026-10-21  by: Uday Raj

## Current work

- Branch: `feature/auth-api` (pushed, PR open, not merged yet)
- Feature: auth
- Last thing finished: auth API (register, login, me, auth and requireRole middleware, seed-admin script, tests)
- Next step: review and merge the `feature/auth-api` PR, then start the next feature (profiles)
- Blockers or open questions: after merge, each teammate must add ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PHONE and MONGODB_URI_TEST to their own backend/.env and run `node scripts/seed-admin.js` once

## Feature status

Statuses: `not started`, `in progress`, `in review`, `done`.

| # | Feature | API | UI | Owner | Notes |
|---|---|---|---|---|---|
| 1 | project-setup | done | n/a | Team | Backend skeleton, Django wiring and frontend shell are on main |
| 2 | auth | in review | done | Alis (API), Uday Raj (UI) | API on feature/auth-api (PR open). UI merged in PR #12. Seed the admin with node scripts/seed-admin.js |
| 3 | profiles | not started | not started | | |
| 4 | doctor-availability | not started | not started | | |
| 5 | appointment-booking | not started | not started | | |
| 6 | appointment-management | not started | not started | | |
| 7 | notifications | not started | not started | | |
| 8 | chat | not started | not started | | |
| 9 | video-consultation | not started | not started | | |
| 10 | medical-records | not started | not started | | |
| 11 | prescriptions | not started | not started | | |
| 12 | prescription-pdf | not started | not started | | |
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
| 2026-10-15 | PDF library is ReportLab (storage still undecided) | TEAM_GUIDE section 1 |
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
| | Refresh tokens: undecided | |
| | TURN server: undecided | |
| | Deployment target: undecided | |

## Deviations from AGENTS.md or PROJECT_CONTEXT.md

- Added the optional env variable `ADMIN_PHONE` (default placeholder +910000000000), because the User model requires a phone for every user, including the admin.
- Added the env variable `MONGODB_URI_TEST` for the separate test database.

-

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
