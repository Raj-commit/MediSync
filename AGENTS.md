# AGENTS.md: MediSync

Read this whole file before any task. It is the source of truth for the rules. If a task conflicts with it, stop and ask.

Also read: `PROJECT_CONTEXT.md` (full requirements, use cases, flows) and `PROGRESS.md` (what is built, decisions, next step). The FR, NFR and UC IDs used below are defined in `PROJECT_CONTEXT.md`. When you finish work, update `PROGRESS.md`.

## 1. Summary

MediSync is a web-based telemedicine platform. Patients book doctor appointments, attend online video consultations, chat with doctors, and keep medical records and digital prescriptions in one place. Doctors and administrators get their own interfaces. Access is role-based and secured with JWT. An AI symptom checker and PDF prescription generation run in a separate Django service.

College group project (Advanced Web Technology). Work is split one feature per branch and pushed to GitHub in small, regular commits. Build only what section 6 lists. Do not invent features.

## 2. Stack

| Layer | Technology |
|---|---|
| Frontend | Angular, TypeScript |
| Backend API | Node.js, Express.js |
| Database | MongoDB via Mongoose |
| AI and PDF service | Django (Django REST Framework suggested) |
| Auth | JWT, passwords hashed with bcrypt |
| Video | WebRTC, signaling over Socket.IO (suggested) |
| Chat, notifications | Socket.IO for live delivery, MongoDB for storage (suggested) |

"Suggested" means proposed, not confirmed. Ask before adding other major libraries.

## 3. Architecture rules

1. Angular talks only to Express. It never calls Django.
2. Express calls Django over internal HTTP with a shared secret in the `X-Service-Key` header. Django rejects requests without it.
3. Backend layering: routes, controllers, services, models. Controllers stay thin. Business logic lives in services.
4. Every protected route checks, in order: valid JWT, role, ownership of the resource.
5. Validate all input on the server. Never trust the UI.

| Service | Folder | Port |
|---|---|---|
| Angular | `frontend/` | 4200 |
| Express | `backend/` | 5000 |
| Django | `ai-service/` | 8000 |

## 4. Repo layout

```
medisync/
  AGENTS.md  README.md  .gitignore
  docs/                     practical reports, diagrams
  frontend/src/app/
    core/                   auth service, guards, interceptors
    shared/                 reusable components, pipes
    features/               auth, profile, appointments, consultation,
                            chat, notifications, records, prescriptions,
                            symptom-checker, admin
  backend/
    src/  config/ models/ routes/ controllers/ services/
          middleware/ sockets/ utils/  app.js  server.js
    tests/  .env.example
  ai-service/
    config/  symptom_checker/  prescriptions/
    manage.py  requirements.txt  .env.example
```

## 5. Roles and data

| Role | Can do |
|---|---|
| patient | Register, manage own profile, book and manage own appointments, video and chat inside own appointments, view own records and prescriptions, use symptom checker, get notifications |
| doctor | Register, manage own profile and availability, accept or reject appointments, video and chat, update records of patients they treat, create prescriptions, get notifications |
| admin | Log in, view, manage and deactivate patient and doctor accounts. Never self-registers; seed with a script |

Collections (from the class and E-R diagrams):

- **User**: userId, name, contact (email, phone), passwordHash, role, isActive. One `users` collection with a `role` discriminator. Patient adds dateOfBirth, address (age is derived, never stored). Doctor adds specialisations[], qualification, availability slots[].
- **Appointment**: patient, doctor, dateTime, status (`requested`, `confirmed`, `completed`, `cancelled`).
- **VideoSession**: appointment (0..1 per appointment), startTime, endTime.
- **ChatMessage**: appointment, seq (unique within one appointment), sender, content, timestamp.
- **MedicalRecord**: exactly one per patient. Entries have diagnosis, notes, updatedAt, updatedBy.
- **Prescription**: appointment (0..1 per appointment), issuedDate, items[] (medicine, dosage, instructions), pdfUrl.
- **Medicine**: catalogue entry (name, dosageForm). Exists independently of any prescription.
- **Notification**: recipient, type, message, status (`unread`, `read`), createdAt.
- **SymptomCheckResult**: patient, symptomsInput, aiAssessment, checkedAt.

## 6. Features (one branch each)

Branch names: `feature/<name>-api` first, then `feature/<name>-ui`. Also `fix/`, `docs/`, `chore/`. FR IDs come from the requirements practical.

| Order | Feature | FR |
|---|---|---|
| 1 | project-setup (scaffold all three services) | none |
| 2 | auth (register, login, logout, JWT, role guards) | 01-04 |
| 3 | profiles | 05, 06 |
| 4 | doctor-availability | 07 |
| 5 | appointment-booking | 08 |
| 6 | appointment-management (reschedule, cancel, accept, reject, history) | 09, 10 |
| 7 | notifications | 18 |
| 8 | chat | 12 |
| 9 | video-consultation | 11 |
| 10 | medical-records | 13 |
| 11 | prescriptions (create, view) | 14, 16 |
| 12 | prescription-pdf (Django) | 15 |
| 13 | symptom-checker (Django) | 17 |
| 14 | admin-user-management | 19 |
| 15 | polish-testing | NFRs |

Proposed endpoints (prefix `/api/v1`, change by editing this file in a PR):

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- `GET|PUT /users/me`, `GET /doctors`, `GET /doctors/:id/availability`, `PUT /doctors/me/availability`
- `POST|GET /appointments`, `PATCH /appointments/:id`
- `GET /appointments/:id/messages` (live messages over Socket.IO)
- `GET /notifications`, `PATCH /notifications/:id/read`
- `GET /records/me`, `GET /records/patient/:patientId`, `POST /records/patient/:patientId/entries`
- `POST|GET /prescriptions`, `GET /prescriptions/:id/pdf`
- `POST|GET /symptom-checks`
- `GET /admin/users`, `PATCH /admin/users/:id`
- Django (internal only): `POST /symptom-check`, `POST /prescriptions/pdf`

Booking rule: a slot can never be double booked. Enforce it on the server (atomic update or unique index) and return `409 Conflict` when the slot is taken.

## 7. Conventions

- REST, plural nouns, JSON. Errors: `{ "message": "...", "code": "..." }` with correct HTTP status.
- JS and TS: camelCase. Python: snake_case. Angular files follow CLI naming.
- Format with Prettier and ESLint (JS and TS), ruff or black (Python).
- Tests: Jest and Supertest for the API, Angular's default runner for the UI, Django's test runner for the AI service. Every new endpoint gets tests.
- Config comes from env vars, listed in `.env.example` with fake values only:
  - backend: `PORT`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CLIENT_URL`, `AI_SERVICE_URL`, `AI_SERVICE_KEY`
  - ai-service: `DJANGO_SECRET_KEY`, `AI_SERVICE_KEY`, `DEBUG`, `ALLOWED_HOSTS`
- Logout clears the token on the client. JWT is stateless.

## 8. Security and privacy (must follow)

1. Never commit secrets, `.env`, tokens, or connection strings.
2. Hash passwords with bcrypt. Never log or return `passwordHash`.
3. Medical records and prescriptions: patients read only their own. Doctors read only patients they have an appointment with. Admins manage accounts, not records.
4. Use helmet, CORS limited to `CLIENT_URL`, and rate limiting on login.
5. Query only by IDs from the verified JWT or checked parameters. Prevent NoSQL injection by validating types.
6. Use synthetic data only. Never put real patient data anywhere in this repo.

## 9. Medical safety

The symptom checker gives a preliminary, informational assessment. It is not a diagnosis. Always show a disclaimer next to its output and tell the user to consult a doctor. Never present AI output as medical advice.

## 10. Git rules for AI agents

1. Work only on the current feature branch. Never touch `main`.
2. Stage and commit only when asked. Never push, merge, rebase `main`, or force push. A human reviews the diff first.
3. Commit format: `type(scope): message`, for example `feat(auth): add login endpoint`. Types: feat, fix, docs, test, refactor, chore.
4. Keep commits small. One logical change each.
5. Do not refactor or edit code outside the current feature.
6. Never commit `node_modules`, `venv`, build output, or `.env`.

## 11. Working in Antigravity

- Antigravity reads this file as workspace rules. Keep it under 12,000 characters. Put extra rules in `.agents/rules/`.
- Plan before editing across several files. After editing, run the app or tests and report the result.
- Ask when something is unclear. Do not guess requirements.
- Parallel agents in the Manager view: one agent per feature branch, never two agents on the same files.
- Follow section 3 even if a shortcut is faster.

## 12. Definition of done

- Runs locally with no console errors.
- Lint and tests pass. New endpoints have tests.
- `.env.example` updated if config changed.
- PR names the FR IDs it covers and how to test it.
- The author can explain every line. Code you cannot explain does not get merged.

## 13. Open decisions (ask the team, do not assume)

- Model or service behind the symptom checker.
- PDF library (for example ReportLab or WeasyPrint) and where PDFs are stored.
- Refresh tokens or access token only.
- TURN server for video outside a local network (public STUN is enough for development).
- Deployment target.
