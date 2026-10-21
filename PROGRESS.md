# PROGRESS.md: MediSync status and handoff

Living file. Update it at the end of every work session and in every PR. It is what lets a different AI (or teammate) pick up exactly where you stopped.

Last updated: 2026-10-21  by: Uday Raj

## Current work

- Branch: none open. `feature/auth-ui` was merged in PR #12
- Feature: auth
- Last thing finished: auth UI (app shell, register, login, session with Bearer interceptor, role guards, empty dashboards)
- Next step: `feature/auth-api` (FR-01 to FR-04), see TEAM_GUIDE section 8.2
- Blockers or open questions: register and login in the UI cannot work end to end until auth-api is merged

## Feature status

Statuses: `not started`, `in progress`, `in review`, `done`.

| # | Feature | API | UI | Owner | Notes |
|---|---|---|---|---|---|
| 1 | project-setup | done | n/a | Team | Backend skeleton, Django wiring and frontend shell are on main |
| 2 | auth | not started | done | Hitanshu (API), Uday Raj (UI) | UI merged in PR #12. API is next, the UI already follows the contract in Decisions |
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
| | Refresh tokens: undecided | |
| | TURN server: undecided | |
| | Deployment target: undecided | |

## Deviations from AGENTS.md or PROJECT_CONTEXT.md

List anything built differently from the plan (changed endpoint, renamed field), so the docs can be corrected.

-

## Known issues

- A logged-in user can still open `/login` and `/register` by typing the address. They are not redirected to their dashboard yet.

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
