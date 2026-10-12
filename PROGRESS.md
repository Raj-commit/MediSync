# PROGRESS.md: MediSync status and handoff

Living file. Update it at the end of every work session and in every PR. It is what lets a different AI (or teammate) pick up exactly where you stopped.

Last updated: (date)  by: (name)

## Current work

- Branch:
- Feature:
- Last thing finished:
- Next step:
- Blockers or open questions:

## Feature status

Statuses: `not started`, `in progress`, `in review`, `done`.

| # | Feature | API | UI | Owner | Notes |
|---|---|---|---|---|---|
| 1 | project-setup | not started | n/a | | |
| 2 | auth | not started | not started | | |
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
| | Symptom checker model or service: undecided | |
| | PDF library and storage: undecided | |
| | Refresh tokens: undecided | |
| | TURN server: undecided | |
| | Deployment target: undecided | |

## Deviations from AGENTS.md or PROJECT_CONTEXT.md

List anything built differently from the plan (changed endpoint, renamed field), so the docs can be corrected.

-

## Known issues

-

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
