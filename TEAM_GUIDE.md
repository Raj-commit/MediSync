# MediSync Team Guide

Read this once fully, then use it as a reference. Everything you need from day one is here: setup, daily routine, git, Antigravity prompts, pull requests, and what to do when things break.

## 0. How we work (the 5 rules)

1. `main` always works. Nobody pushes to it directly.
2. One branch per piece of work. One pull request (PR) per branch.
3. Commit small, commit daily, push the same day. Real work only, never fake or backdated commits.
4. AI helps you write code. You review it, run it, and commit it under your own name.
5. If you cannot explain a line you are about to push, do not push it. The professor will ask in the viva.

---

## Day 0: do this first (repo status on 15 Oct)

We reviewed the repo on GitHub. It has 4 commits, one branch (`main`) and no pull requests yet. The scaffold is good but not finished. Fix these before anyone starts a feature.

| Item | Status | Action |
|---|---|---|
| Folder structure | Matches the plan | None |
| The four `.md` files and PR template | Committed | Add `TEAM_GUIDE.md` (Day 0 docs PR) |
| Secrets | None tracked, `.gitignore` is correct | Keep it that way |
| Repo visibility | **Public** | Anyone can read it. Never commit secrets or real data. The Django `SECRET_KEY` already in the history is burned: replace it (Day 0 Django PR) and never reuse it anywhere |
| Branch protection | **Off** (a commit went straight to `main`) | Owner turns it on (Step A) |
| PR history | **None.** Only 2 of 4 members have commits | Everyone's first PR is a Day 0 PR (Step B) |
| Backend | `package.json` only. No `src/` (git does not track empty folders), so `npm run dev` fails | Day 0 backend skeleton PR |
| Django | Apps not in `INSTALLED_APPS`, no URL includes, hardcoded `SECRET_KEY`, `.env` ignored by settings, `requirements.txt` missing `python-dotenv` and `reportlab` | Day 0 Django wiring PR |
| Frontend | Default Angular 21 app, empty routes, Vitest for tests | `auth-ui` builds on it |
| README | Says `ng serve` (needs a global Angular CLI) | Change to `npm start` (Day 0 docs PR) |
| `AGENTS.md` | No version info, so an AI may write Express 4 or old Angular code | Add the versions line (Day 0 docs PR) |

### Step A: owner only (5 minutes)

1. Settings, Collaborators. Confirm all four people are listed (`Hitman0137`, `Raj-commit`, `alis1246`, `riyank-max`). Add anyone missing.
2. Settings, Rules (or Branches), add a rule for `main`: require a pull request before merging, require 1 approval. The repo is public, so this should be available on the free plan.
3. Settings, General: tick **Automatically delete head branches**.

After this, nobody (including the owner) can push straight to `main`. That is the point.

### Step B: four Day 0 PRs, one per person

Each person's first PR is real work that unblocks the team. Follow section 4 for the mechanics. Prompts are in 8.1a.

| Person | Branch | Task | Reviewer |
|---|---|---|---|
| P1 | `chore/backend-skeleton` | Create the `backend/src` folders (with `.gitkeep`), Express app, DB connection, health route, error handler, one test | P2 |
| P2 | `docs/repo-fixes` | Drop in the updated `AGENTS.md`, `GITHUB_WORKFLOW.md` and `TEAM_GUIDE.md`. In `README.md` change `ng serve` to `npm start` and add `TEAM_GUIDE.md` to the Docs line. Fill the Decisions table in `PROGRESS.md` from the agreements in section 1 | P3 |
| P3 | `chore/ai-service-wiring` | Load `.env` in Django settings, remove the hardcoded key, register DRF and both apps, add URL includes and a health view, add `python-dotenv` and `reportlab` | P4 |


Rules for Day 0:

- Merge P1 and P3 first. `auth-api` and `prescription-pdf` start only after those two are on `main`.
- P2 and P4 can merge at any time.
- Everyone runs `git pull` on `main` after each merge.
- Target: all four merged by the end of tomorrow.

---

## 1. Who does what

Names come from the README team table, in that order. Suggested only, swap freely at the team meeting.

| | Name | GitHub username | Day 0 branch | Phase 1 branch (start after Day 0) |
|---|---|---|---|---|
| P1 | Parmar Hitanshu | Hitman0137 | `chore/backend-skeleton` | `feature/auth-api` |
| P2 | Uday Raj | Raj-commit | `docs/repo-fixes` | `feature/auth-ui` |
| P3 | Patel Alis | alis1246 | `chore/ai-service-wiring` | `feature/prescription-pdf` |
| P4 | Riyank Malsatar | riyank-max | `docs/add-practical-reports` | `feature/symptom-checker-ai` |

Phase 2 starts once auth is merged. See section 11 for the full schedule. Auth is the bottleneck, so P1 merges `auth-api` in small PRs within 2 to 3 days so P2 can connect the UI.

### Team agreements (confirm these in the meeting)

These are decided up front so every AI and every person builds to the same answers. Final values live in `PROGRESS.md`, Decisions table.

| Decision | Agreed answer |
|---|---|
| Login response | `{ token, user: { id, name, email, role } }` |
| Token | `Authorization: Bearer <token>`, kept in localStorage, expires in 1 day |
| Registration | Patient and doctor only. Admin is created by a seed script. Doctors are active immediately |
| Password rule | Minimum 8 characters |
| Appointment slot | 30 minutes, future dates only |
| Cancel or reschedule | Allowed until 1 hour before the start |
| PDF library | ReportLab |
| Symptom checker | Rule-based stub first, real LLM call later, in its own module |
| MongoDB | Each person uses their own local database. Do not share one while developing |

---

## 2. One-time setup (every person, on your own laptop)

### 2.1 Install

- [ ] Git
- [ ] Node.js, a recent LTS (Angular 21 needs one. If `npm install` or `npm start` complains about the Node version, upgrade)
- [ ] Python 3.12 or newer (Django 6 needs a recent Python. If `pip install` fails with a Python version error, upgrade)
- [ ] MongoDB Community (local) and make sure the MongoDB service is running. Or use a free MongoDB Atlas cluster.
- [ ] Antigravity (and sign in)
- [ ] Optional: GitHub CLI (`gh`)

Check versions:

```bash
git --version
node --version
npm --version
python --version
```

On Windows use Git Bash or the terminal inside Antigravity for the commands below.

### 2.2 Set your Git identity

The email must be the one on your GitHub account, or your commits will not show on your profile.

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### 2.3 Accept the repo invite

The owner adds you under Settings, Collaborators. Accept the invitation from your email, or at `github.com/Raj-commit/MediSync/invitations`.

### 2.4 Clone the repo

```bash
cd ~/Documents            # or wherever you keep projects
git clone https://github.com/Raj-commit/MediSync.git
cd MediSync
```

The first push may ask you to log in to GitHub in a browser window. Do it once. (Or run `gh auth login` if you installed GitHub CLI.)

### 2.5 Install dependencies and create your env files

**Backend**

```bash
cd backend
npm install
cp .env.example .env          # Windows cmd: copy .env.example .env
cd ..
```

Open `backend/.env` and fill in:

| Variable | What to put |
|---|---|
| `PORT` | `5000` |
| `MONGODB_URI` | `mongodb://localhost:27017/medisync_<yourname>` |
| `JWT_SECRET` | any long random string |
| `JWT_EXPIRES_IN` | `1d` |
| `CLIENT_URL` | `http://localhost:4200` |
| `AI_SERVICE_URL` | `http://localhost:8000` |
| `AI_SERVICE_KEY` | any shared string, same value in `ai-service/.env` |

**Frontend**

```bash
cd frontend
npm install
cd ..
```

**AI service**

```bash
cd ai-service
python -m venv venv
# activate it:
#   Windows cmd:   venv\Scripts\activate
#   Git Bash:      source venv/Scripts/activate
#   Mac/Linux:     source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # Windows cmd: copy .env.example .env
cd ..
```

Open `ai-service/.env` and set `DJANGO_SECRET_KEY`, `AI_SERVICE_KEY` (same as backend), `DEBUG=True`, `ALLOWED_HOSTS=localhost,127.0.0.1`.

Never commit any `.env` file. Share secret values with teammates privately, not on GitHub.

### 2.6 Check each part runs

Use three terminals.

```bash
# Terminal 1 (frontend)
cd frontend && npm start                      # http://localhost:4200

# Terminal 2 (AI service)
cd ai-service && source venv/bin/activate     # use your activate command
python manage.py runserver 8000               # http://localhost:8000

# Terminal 3 (backend), once it has a server file
cd backend && npm run dev                     # http://localhost:5000
```

The backend only starts after the Day 0 backend skeleton PR (P1) is merged, so `npm run dev` fails until then. Until then, only the frontend and Django need to run. Django needs the Day 0 wiring PR (P3) before it reads your `.env`. If `npm install`, `npm start` and `runserver` all work, your setup is good.

### 2.7 Your first pull request

Your first PR is your Day 0 PR (see Day 0, Step B). It doubles as practice for the full workflow in section 4: branch, commit, push, PR, review, merge.

### 2.8 Open the project in Antigravity

1. Open the **root `MediSync` folder** as the workspace, not a subfolder.
2. Confirm it loaded the rules: agent panel, `...` menu, Customizations, Rules. You should see `AGENTS.md`.
3. Set terminal commands to need your approval, so the agent cannot run `git push` by itself. Setting names vary by version.
4. Use the assisted mode (agent proposes, you review) rather than fully autonomous.

---

## 3. Daily routine

**Start of day (5 minutes)**

```bash
git switch main
git pull
```

Read the group chat, check your assigned GitHub issues, and post what you plan to do today.

**During the day**

Work in small steps (section 4). Commit after each working step and push.

**End of day (5 minutes)**

- Push everything: `git push`.
- Post in the chat: what you did, what is next, what is blocking you.
- Update your row in `PROGRESS.md` if a feature changed status.

**If you are blocked**, pick a filler task (section 9). A day with no commit should be rare.

---

## 4. The full workflow for one piece of work

Do this for every branch. Replace the example names with yours.

### Step 1: Pick the work

Take the next issue assigned to you, for example "feature/auth-api (FR-01 to FR-04)". Move it to In progress if you use the project board.

### Step 2: Update main

```bash
git switch main
git pull
```

### Step 3: Create your branch

```bash
git switch -c feature/auth-api
```

Branch names: `feature/<name>-api`, `feature/<name>-ui`, `fix/<short>`, `docs/<short>`, `chore/<short>`.

### Step 4: Give Antigravity the prompt

Open the agent panel in Antigravity and paste your prompt from section 8. Do this on your branch, in the root folder workspace.

### Step 5: Read the plan

The prompt asks for a plan first. Read it. If it plans to touch folders outside your area, or invent features, reply: "Stay inside <folder>. Only build what AGENTS.md section 6 lists." Approve when it looks right.

### Step 6: One small step at a time

The prompt makes the agent stop after each step. For each step:

1. Read the changes. In your terminal, `git diff` shows them, or use the Source Control view.
2. Run it. Start the service and try it, or run the tests.
3. If something is wrong, tell the agent what failed and ask it to fix that step.
4. If you do not understand a part, ask: "Explain this file line by line." Do not push what you do not understand.

### Step 7: Commit

```bash
git status                                   # see what changed
git add backend/src/models/User.js           # add specific files
git commit -m "feat(auth): add User model with role discriminator"
```

Avoid `git add .` unless you have checked `git status` and seen only files you mean to commit.

### Step 8: Push

First push of a new branch:

```bash
git push -u origin feature/auth-api
```

After that, just:

```bash
git push
```

### Step 9: Repeat steps 5 to 8

Next step from the agent, review, run, commit, push. One feature half should give 5 to 7 commits.

### Step 10: Bring in the latest main before your PR

```bash
git fetch origin
git merge origin/main
```

If git reports conflicts, see section 7. Then run your app and tests once more.

### Step 11: Open the pull request

1. On GitHub, click **Compare & pull request** (appears after you push).
2. Title: `feat(auth): auth API (FR-01 to FR-04)`.
3. Fill in the template: what it does, FRs covered, how to test, checklist.
4. Write `Closes #<issue number>` so the issue closes when merged.
5. Choose a teammate as Reviewer.

### Step 12: Review (the reviewer's job)

1. Open the PR, Files changed tab. Read the code.
2. Pull the branch and run it:

```bash
git fetch origin
git switch feature/auth-api
```

3. Check: it runs, tests pass, no secrets, matches the FRs, stays in the right folder.
4. Leave comments on specific lines. Choose **Approve** or **Request changes**.

If you get comments, fix them on the same branch, commit, push. The PR updates by itself.

### Step 13: Merge

After approval, click **Merge pull request**. Choose **Create a merge commit** so every small commit stays visible in history. Do not choose Squash. Delete the branch if GitHub offers.

### Step 14: Clean up and update

```bash
git switch main
git pull
git branch -d feature/auth-api
```

Update your row in `PROGRESS.md` (status, next step). Edit only your own rows, which avoids conflicts. Then tell the team in the chat.

### Step 15: Start the next branch

Back to Step 1. For a `-ui` branch of the same feature, the API must already be merged.

---

## 5. Commit rules

Format: `type(scope): message`

| Type | Use for |
|---|---|
| `feat` | New behaviour |
| `fix` | Bug fix |
| `test` | Tests |
| `docs` | README, docs, comments |
| `refactor` | Restructure without changing behaviour |
| `chore` | Setup, config, dependencies |

Examples:

- `feat(auth): add POST /auth/login that issues a JWT`
- `fix(booking): return 409 when slot is already taken`
- `test(auth): cover register and login`
- `docs(readme): add setup steps`

Rules:

- One logical change per commit. If the message needs "and", split it.
- Commit at least once per working session. Push the same day.
- Never commit `.env`, `node_modules`, `venv`, or build folders.
- Commit as you work. Do not hold finished work and release it in pieces later.

---

## 6. Pulling updates from teammates

Do this every morning, and again before opening a PR.

On `main`:

```bash
git switch main
git pull
```

Inside your own branch:

```bash
git fetch origin
git merge origin/main
```

## 7. Merge conflicts

A conflict means you and a teammate changed the same lines. It is normal.

Likely spots: `backend/src/app.js`, `frontend/src/app/app.routes.ts`, `frontend/src/app/app.config.ts`, `ai-service/config/urls.py`, `ai-service/config/settings.py`. Each feature should add its own file plus one line in these shared files, which keeps conflicts to a line or two.

To fix one:

1. Run `git status` to see the conflicted files.
2. Open each file. You will see:

```
<<<<<<< HEAD
your version
=======
their version
>>>>>>> origin/main
```

3. Keep what is right, usually both sides, and delete the three marker lines. The editor shows Accept Current, Incoming or Both buttons that do the same.
4. Then:

```bash
git add <file>
git commit
git push
```

5. Run the app and tests once more.

If unsure which side is right, ask the person who wrote the other side.

---

## 8. Antigravity prompts

Paste into the agent panel. Each one assumes you are already on your branch.

### 8.1 Everyone: first prompt (changes nothing)

```
Read AGENTS.md, PROJECT_CONTEXT.md and PROGRESS.md fully. Do not edit anything.
Reply with: (1) what MediSync is in 4 lines, (2) the folder structure you see
and any difference from AGENTS.md section 4, (3) anything in the scaffold that
looks broken or missing.
```

### 8.1a Day 0 prompts

**P1: `chore/backend-skeleton`**

```
Read AGENTS.md and PROJECT_CONTEXT.md. I am on branch chore/backend-skeleton.
Work in backend/ only. Installed versions are Express 5 and Mongoose 9. Check
package.json and write code for those versions, not older ones.

Steps, each small enough to be one commit:
1. Create the folders from AGENTS.md section 4 under backend/src and backend/tests
   (config, models, routes, controllers, services, middleware, sockets, utils),
   each with a .gitkeep so git tracks them.
2. src/app.js: Express app with helmet, CORS limited to CLIENT_URL, JSON body
   parsing, and GET /api/v1/health returning { status: "ok" }. Export the app.
3. src/config/db.js (Mongoose connection from MONGODB_URI) and src/server.js
   that connects to the DB and starts the app on PORT.
4. A central error handler returning { message, code }, and a 404 handler.
5. One Supertest test for the health route.

Do not build any feature. Plan first, then one step at a time, stop after each.
Do not run git commit or git push.
```

**P2: `docs/repo-fixes`** (no prompt needed, do it by hand)

1. Replace `AGENTS.md` and `GITHUB_WORKFLOW.md` in the repo with the updated copies, and add `TEAM_GUIDE.md` to the root.
2. `README.md`: change `ng serve` to `npm start`, and add `TEAM_GUIDE.md` to the Docs line.
3. `PROGRESS.md`: fill the Decisions table from the agreements in section 1, and set the Last updated line.

**P3: `chore/ai-service-wiring`**

```
Read AGENTS.md and PROJECT_CONTEXT.md. I am on branch chore/ai-service-wiring.
Work in ai-service/ only. Installed versions are Django 6.1 and Django REST
Framework. Write code for those versions.

Steps, each small enough to be one commit:
1. Add python-dotenv and reportlab to requirements.txt. Pin versions that
   install cleanly with pip.
2. In config/settings.py load ai-service/.env with python-dotenv. Read
   DJANGO_SECRET_KEY, DEBUG, ALLOWED_HOSTS and AI_SERVICE_KEY from the
   environment. Remove the hardcoded SECRET_KEY. Fail with a clear error if
   DJANGO_SECRET_KEY is missing.
3. Add rest_framework, symptom_checker and prescriptions to INSTALLED_APPS.
4. Create urls.py in both apps and include() them in config/urls.py with empty
   urlpatterns. Add a GET /health view returning { "status": "ok" }.
5. A Django test for /health.

Do not build any feature. Plan first, then one step at a time, stop after each.
Do not run git commit or git push.
```

**P4: `docs/add-practical-reports`** (no prompt needed)

1. Put the practical reports and diagrams in `docs/practicals/`.
2. On GitHub, create one Issue per phase 1 branch (`feature/auth-api (FR-01 to FR-04)`, `feature/auth-ui`, `feature/prescription-pdf (FR-15)`, `feature/symptom-checker-ai (FR-17)`), assign owners, and add a Project board (Backlog, In progress, In review, Done).

### 8.2 P1: `feature/auth-api`

```
Read PROJECT_CONTEXT.md and PROGRESS.md first. I am on branch feature/auth-api.
Implement FR-01 to FR-04 in backend/ only, following AGENTS.md.

Steps, each small enough to be one commit:
0. The Express skeleton should already be on main from the Day 0 PR (src/app.js,
   src/server.js, DB connection, health route, error handler). Check it exists.
   If it does not, tell me and stop.
1. User model (Mongoose) with role discriminator: patient, doctor, admin.
   Fields per AGENTS.md section 5.
2. POST /api/v1/auth/register for patient and doctor only. Validate input,
   hash passwords with bcryptjs, minimum password length 8.
3. POST /api/v1/auth/login returning { token, user: { id, name, email, role } }.
   Use one generic error for wrong email or wrong password.
4. GET /api/v1/auth/me
5. auth middleware (verify Bearer JWT) and requireRole(...roles) middleware.
6. backend/scripts/seed-admin.js that creates one admin from env vars.
7. Jest and Supertest tests for register, login, me, and role rejection.

Installed versions are Express 5 and Mongoose 9. Write code for those versions.
Use routes, controllers, services, models. Never return passwordHash.
Update .env.example for new vars.

Give me a plan first. Then do one step at a time and stop after each so I can
review and commit. Do not run git commit or git push.
```

### 8.3 P2: `feature/auth-ui`

```
Read PROJECT_CONTEXT.md and PROGRESS.md first. I am on branch feature/auth-ui.
Implement the UI for FR-01 to FR-04 in frontend/ only, following AGENTS.md.

Steps, each small enough to be one commit:
1. App shell: layout, navbar with logout, routing, environment file with
   apiUrl http://localhost:5000/api/v1
2. Register page (choose patient or doctor, show the fields for that role)
3. Login page
4. AuthService storing the token, plus an HTTP interceptor adding the Bearer header
5. Role-based route guards and empty placeholder dashboards for patient,
   doctor and admin

Responsive layout. Do not edit backend/. The backend may not be merged yet, so
code against the login response and endpoints in PROGRESS.md and AGENTS.md
section 6.

Give me a plan first. Then do one step at a time and stop after each so I can
review and commit. Do not run git commit or git push.
```

### 8.4 P3: `feature/prescription-pdf`

```
Read PROJECT_CONTEXT.md and PROGRESS.md first. I am on branch feature/prescription-pdf.
Implement FR-15 in ai-service/ only, following AGENTS.md.

Steps, each small enough to be one commit:
0. The Django wiring should already be on main from the Day 0 PR (apps in
   INSTALLED_APPS, config read from .env, URL includes). Check it. If it is
   missing, tell me and stop.
1. Middleware that rejects requests without a valid X-Service-Key header
   (value from env AI_SERVICE_KEY). Check whether it already exists first.
2. POST /prescriptions/pdf. Input JSON: prescriptionId, patientName, doctorName,
   issuedDate, items[{ medicine, dosage, instructions }].
3. Generate the PDF with ReportLab and return it as application/pdf.
4. Django tests: missing key returns 403, valid request returns a PDF,
   bad input returns 400.
5. Update requirements.txt and .env.example.

Use fake data only. Give me a plan first. Then do one step at a time and stop
after each so I can review and commit. Do not run git commit or git push.
```

P3: merge step 1 (the service-key check) as its own tiny PR first, so P4 can build on it.

### 8.5 P4: `feature/symptom-checker-ai`

```
Read PROJECT_CONTEXT.md and PROGRESS.md first. I am on branch feature/symptom-checker-ai.
Implement FR-17 in ai-service/ only, following AGENTS.md.

Steps, each small enough to be one commit:
1. Reuse the X-Service-Key check if it is on main. If not, tell me and wait.
2. POST /symptom-check. Input: { "symptoms": ["fever", "cough"] }.
   Output: { "assessment": "...", "possible_conditions": [...], "disclaimer": "..." }.
3. Put the assessment logic in its own module (symptom_checker/engine.py) with a
   simple rule-based placeholder, so a real LLM call can replace it later without
   changing the endpoint.
4. Always include a disclaimer that this is not a diagnosis and the user should
   see a doctor.
5. Django tests for valid input, empty symptoms, and a missing service key.

Use fake data only. Give me a plan first. Then do one step at a time and stop
after each so I can review and commit. Do not run git commit or git push.
```

### 8.6 Template for every later feature

```
Read PROJECT_CONTEXT.md and PROGRESS.md first. I am on branch feature/<name>-<api|ui>.
Implement <FR ids> in <folder> only, following AGENTS.md. Give me a plan first.
Then do one small step at a time and stop after each so I can review and commit.
Do not run git commit or git push.
```

For an `-ui` branch, add: "The API is merged on main. Read the routes and controllers in backend/ to match the real response shapes."

### 8.7 Handy follow-up prompts

| Situation | Prompt |
|---|---|
| You do not understand the code | `Explain what you just wrote file by file, in simple terms.` |
| It edited outside your folder | `You edited files outside <folder>. Revert those changes and stay inside <folder>.` |
| Something fails | `Running <command> fails with: <paste the error>. Find the cause and fix only that.` |
| Need tests | `Write tests for what you just added. Cover success, validation errors and permission errors.` |
| PR got review comments | `Reviewer said: "<comment>". Make that change only.` |
| Before the PR | `Review the changes on this branch against AGENTS.md and PROJECT_CONTEXT.md. List anything that violates a rule or misses an FR.` |

### 8.8 If you hit your AI limit

1. Update `PROGRESS.md`: current branch, last thing finished, next step.
2. In the other AI, paste `AGENTS.md`, `PROJECT_CONTEXT.md`, `PROGRESS.md` in that order.
3. Send the handoff prompt at the bottom of `PROGRESS.md`.
4. Paste any files it needs to see. It cannot see your code on its own.

---

## 9. If you are blocked: filler tasks that still count

- Add tests for a merged feature
- Add input validation or clearer error messages
- Loading, empty and error states in the UI
- README or API documentation
- Seed data script (fake data only)
- Responsive layout fixes
- Review a teammate's PR (reviews show in the contribution graph)
- Fix a bug someone filed as an issue

Pick one, branch (`chore/...` or `docs/...` or `test/...`), commit, push, PR.

## 10. Do and do not

**Do**

- Pull `main` every morning.
- Keep branches short: 1 to 3 days, then merge.
- Edit only your own area. Ask before touching someone else's files.
- Update `PROGRESS.md` when a feature changes status.
- Use fake data only. No real patient data anywhere.

**Do not**

- Push to `main`.
- Commit `.env`, `node_modules`, or `venv`.
- Use `git push --force`.
- Let the agent commit or push for you.
- Merge your own PR without a second person reading it.
- Open a PR bigger than a reviewer can read in about 15 minutes. Split it.
- Commit anything private. The repo is public, so secrets, real patient data and personal details stay out.

---

## 11. Schedule (assumes 4 weeks, rescale to the real deadline)

| | P1 | P2 | P3 | P4 |
|---|---|---|---|---|
| Week 1 | auth-api, seed-admin script | app shell, auth-ui | service-key check, prescription-pdf | symptom-checker (stub) |
| Week 2 | profiles (api + ui) | doctor-availability, appointment-booking (api + ui) | medical-records api, then ui | wire symptom-checker into Express and UI, Socket.IO setup |
| Week 3 | notifications, admin-user-management | appointment-management | prescriptions (api + ui), wire in PDF | chat |
| Week 4 | admin polish, testing | testing booking, responsive pass | PDF download UI, records privacy tests | video-consultation |
| All, week 4 | polish-testing on own features, real AI model in place of the stub, README, demo data, bug fixes | | | |

Day 0 comes first: the four PRs in Day 0, Step B. Week 1 starts when the backend skeleton (P1) and Django wiring (P3) PRs are merged.

Notes:

- Medical-records needs booking to exist, because doctors can only edit records of patients they have an appointment with. If P3 is blocked, do a filler task.
- Video is the riskiest feature. P4 starts the Socket.IO setup in week 2.
- If P2 falls behind, P1 takes `appointment-management`.
- After phase 1, each person owns features from start to finish (API, UI, and Django where relevant).

---

## 12. Troubleshooting

| Problem | Fix |
|---|---|
| `git push` rejected | Run `git pull` or `git fetch origin && git merge origin/main`, fix conflicts, push again |
| "not a git repository" | You are in the wrong folder. `cd` into `MediSync` |
| You committed on `main` by mistake and have not pushed | `git switch -c feature/<name>` (keeps your commits), then `git switch main`, then `git reset --hard origin/main` |
| You edited files you do not want | Discard one file: `git restore <file>`. Discard everything uncommitted: `git restore .` (cannot be undone) |
| You staged the wrong file | `git restore --staged <file>` |
| You committed `.env` or a secret | Tell the team now. Change the secret everywhere. Then remove the file and commit. Deleting the commit alone is not enough |
| Nested `.git` inside `frontend/` | Delete `frontend/.git` |
| MongoDB connection refused | Start the MongoDB service, or check `MONGODB_URI` |
| CORS error in browser | Check `CLIENT_URL` in `backend/.env` is `http://localhost:4200`, restart the backend |
| Port already in use | Stop the other process, or change `PORT` in your own `.env` |
| Port 5000 busy on Mac | Turn off AirPlay Receiver in System Settings |
| Django 403 from backend calls | `AI_SERVICE_KEY` differs between `backend/.env` and `ai-service/.env` |
| `venv` command not found | Use `python3` instead of `python`, or reinstall Python and tick "Add to PATH" |
| Agent edited the wrong folder | Use the follow-up prompt in 8.7, then `git restore` the unwanted files |
| Agent seems to forget the rules | Start a new chat, paste the first prompt from 8.1 again |
| `Cannot find module src/server.js` | The Day 0 backend skeleton PR is not merged, or you have not run `git pull` on `main` |
| Django `ModuleNotFoundError: dotenv` | The Day 0 wiring PR is merged but you have not run `pip install -r requirements.txt` again |
| `npm install` or `ng` shows an engine or Node version error | Upgrade Node to a current LTS |
| Angular unit tests: "ng test" does not look like Karma | This project uses Vitest. Use `npm test` |

## 13. Command cheat sheet

```bash
git status                                  # what changed
git switch main                             # go to main
git pull                                    # get latest
git switch -c feature/<name>                # new branch
git add <file>                              # stage a file
git commit -m "type(scope): message"        # save a step
git push -u origin <branch>                 # first push of a branch
git push                                    # later pushes
git fetch origin && git merge origin/main   # bring main into your branch
git diff                                    # see unstaged changes
git log --oneline --graph                   # history
git branch -d <branch>                      # delete local branch after merge
git restore <file>                          # discard changes to a file
```
