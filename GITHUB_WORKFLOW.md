# MediSync: Team Setup and GitHub Workflow

For the humans on the team. `AGENTS.md` is the file for the AI. Put both in the repo root.

The plan: one repo, one `main` branch that always works, one short branch per feature, one pull request per branch. Everyone commits small and often so the contribution history shows real work from every member.

---

## 1. One-time setup (every member)

Install: Git, Node.js (LTS), Python 3.11+, MongoDB (local) or a free MongoDB Atlas cluster, and Antigravity (or VS Code).

Set your Git identity. **The email must be the one on your GitHub account**, or your commits will not show on your GitHub profile and the professor cannot link them to you.

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

Log in to GitHub from the terminal. The GitHub CLI is the easiest way:

```bash
gh auth login
```

(Or set up an SSH key under GitHub, Settings, SSH and GPG keys.)

---

## 2. Create the repository (one person only)

1. GitHub, top right `+`, New repository.
2. Name: `medisync`. Add a README. Add a `.gitignore` using the **Node** template. License is optional.
3. Visibility: ask the professor whether it should be public, or private with the professor added as a collaborator. Do what they say.
4. Create it, then clone:

```bash
git clone https://github.com/<owner>/medisync.git
cd medisync
```

## 3. Share it with the team

1. Repo, Settings, Collaborators, Add people. Add every teammate by GitHub username. Add the professor if the repo is private.
2. Each person accepts the invite from their email or at `github.com/<owner>/medisync/invitations`.
3. Everyone clones the repo (same command as above).

Send secret values (Mongo connection string, JWT secret) privately, never through GitHub. Each person creates their own `.env` locally from `.env.example`.

---

## 4. Create the project scaffold (owner, once)

This is the only time anyone commits straight to `main`.

```bash
mkdir docs frontend backend ai-service
```

**Frontend.** `ng new` creates its own git repo by default, which breaks things. Skip it:

```bash
npx @angular/cli@latest new frontend --skip-git
```

If a `.git` folder still appears inside `frontend/`, delete it.

**Backend:**

```bash
cd backend
npm init -y
npm install express mongoose cors dotenv jsonwebtoken bcryptjs helmet express-rate-limit socket.io
npm install -D nodemon jest supertest
mkdir -p src/config src/models src/routes src/controllers src/services src/middleware src/sockets src/utils tests
cd ..
```

**AI service:**

```bash
cd ai-service
python -m venv venv
# Windows: venv\Scripts\activate     Mac/Linux: source venv/bin/activate
pip install django djangorestframework
django-admin startproject config .
python manage.py startapp symptom_checker
python manage.py startapp prescriptions
pip freeze > requirements.txt
cd ..
```

Add these lines to the end of `.gitignore`:

```
.env
.env.*
!.env.example
dist/
.angular/
coverage/
venv/
.venv/
__pycache__/
*.pyc
db.sqlite3
.DS_Store
.idea/
```

Create a `.env.example` in `backend/` and `ai-service/` using the variable names in `AGENTS.md` section 7, with fake values. Copy `AGENTS.md`, `PROJECT_CONTEXT.md`, `PROGRESS.md` and this file into the root. Add a team table to `README.md`.

```bash
git add .
git commit -m "chore: scaffold frontend, backend and ai-service"
git push
```

Everyone else runs `git pull`.

## 5. Protect `main` (owner, once)

Repo, Settings, Rules (or Branches), add a rule for `main`:

- Require a pull request before merging
- Require 1 approval

Also tick **Automatically delete head branches** under Settings, General.

Menu names change over time, and branch protection on private repos may need a paid plan. If you cannot enable it, agree as a team to follow the same rule by hand: nobody pushes to `main`.

## 6. Practice pull request (everyone)

Before real features, each member does one tiny PR to prove the workflow works: add your name, roll number and GitHub username to the team table in `README.md`. Branch `docs/add-<yourname>`, push, open a PR, get it reviewed, merge. Use section 7 as the recipe.

---

## 7. The loop for every feature

Do this for every row in the feature table (section 11).

```bash
# 1. start from the latest main
git switch main
git pull

# 2. make your branch
git switch -c feature/auth-api

# 3. work in small steps. After each working step:
git add backend/src/models/User.js
git commit -m "feat(auth): add User model with role discriminator"

# 4. push (first time uses -u, later just: git push)
git push -u origin feature/auth-api
```

5. On GitHub, click **Compare & pull request**. Fill in the template (section 9). Pick a teammate as reviewer. Write `Closes #<issue number>` to auto-close the feature's issue on merge.
6. Reviewer reads the diff, runs it locally, comments or approves.
7. Merge the PR on GitHub.
8. Clean up:

```bash
git switch main
git pull
git branch -d feature/auth-api
```

**Stay current.** If `main` moved while you worked:

```bash
git fetch origin
git merge origin/main
```

**Merge conflicts.** Git marks them in the file with `<<<<<<<`, `=======`, `>>>>>>>`. Edit the file to the version you want, delete the markers, then:

```bash
git add <file>
git commit
```

The editor has Accept Current, Incoming, or Both buttons that do the same thing.

## 8. How to cut a feature into small commits

Each feature is split in two PRs, API first and UI second, so branches live 1 to 3 days and merge often. Example for `auth`:

`feature/auth-api`

1. `chore(backend): add Express app, health route, env config`
2. `feat(auth): add User model with role discriminator`
3. `feat(auth): add POST /auth/register with validation and bcrypt`
4. `feat(auth): add POST /auth/login that issues a JWT`
5. `feat(auth): add auth and requireRole middleware`
6. `test(auth): cover register and login`

`feature/auth-ui`

1. `feat(auth): add register page`
2. `feat(auth): add login page and token interceptor`
3. `feat(auth): add role-based route guards`

Rules of thumb:

- One logical change per commit. If the message needs "and", split it.
- Commit at least once per working session. Push the same day.
- A PR should be reviewable in about 15 minutes. If it is bigger, split it.
- Never edit someone else's open branch without asking.

**Pairing so everyone has commits on both sides.** For each feature, one person takes `-api` and another takes `-ui`. Swap roles on the next feature.

**Commit message format:** `type(scope): message`. Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.

**Why merge often matters.** Commits show on your GitHub profile graph once they reach `main`, and the repo's Insights, Contributors page counts commits on `main`. A branch you never merge shows no contribution. For the **merge strategy** on the PR page, "Create a merge commit" keeps every small commit visible. "Squash and merge" collapses the branch into one commit, which looks cleaner but hides your regular work. Agree on one as a team.

---

## 9. Issues and the PR template

Create one GitHub Issue per row of the feature table (title, FR IDs, which `-api` or `-ui` half). Assign an owner and add labels like `backend`, `frontend`, `ai-service`. A GitHub Project board (Backlog, In progress, In review, Done) is optional but easy.

Create `.github/pull_request_template.md`:

```md
## What this does
<!-- one or two sentences -->

## FR / UC covered
<!-- e.g. FR-08, UC-04 -->

## How to test
<!-- steps -->

## Checklist
- [ ] Runs locally with no console errors
- [ ] Tests added and passing
- [ ] No secrets or .env committed
- [ ] .env.example updated if config changed

Closes #
```

---

## 10. Using Antigravity with this workflow

1. Each member installs Antigravity and signs in.
2. **Open the repo root folder** as the workspace, not a subfolder. Antigravity reads `AGENTS.md` from the root, so every member's agent gets the same rules because the file lives in the repo.
3. Check it loaded: agent panel, `...` menu, Customizations, Rules.
4. Pick the assisted mode (agent helps, you review). It suits feature work better than fully autonomous mode. Set terminal commands to need your approval so nothing runs `git push` behind your back. Setting names differ between versions.
5. Prompt with scope. Example:

```
Implement feature/auth-api from AGENTS.md section 6 (FR-01 to FR-04).
Only edit files inside backend/. Plan first, then implement, then run the tests
and tell me the result. Do not commit.
```

6. Review every diff. Run it yourself. Then you `git add`, `git commit`, and `git push` under your own name.
7. Manager view can run several agents in parallel. Give each its own feature branch and its own folder so they never edit the same files.
8. You must be able to explain every commit you push. Expect the professor to ask in the viva.

Antigravity file locations, for when you want to add more rules:

| What | Where |
|---|---|
| Project rules | `AGENTS.md` in root (read by Antigravity, and also by Cursor, Claude Code, Codex) |
| Antigravity-only override | `GEMINI.md` in root (takes precedence over `AGENTS.md`) |
| Extra workspace rules | `.agents/rules/*.md` (older versions used `.agent/rules/`) |
| Reusable prompts | Workflows, create them from the Customizations panel |
| Skills | `.agents/skills/<name>/SKILL.md` |
| Limit | 12,000 characters per rules file |

Antigravity changes fast. If something above does not match your version, check its docs at `antigravity.google/docs`.

---

## 11. Feature build order

Each row is two branches (`-api`, `-ui`) except where noted. Fill in the owner column.

| # | Feature | FR | Needs | API owner | UI owner |
|---|---|---|---|---|---|
| 1 | `project-setup` (one branch, section 4) | none | none | | |
| 2 | `auth` | 01-04 | 1 | | |
| 3 | `profiles` | 05, 06 | 2 | | |
| 4 | `doctor-availability` | 07 | 3 | | |
| 5 | `appointment-booking` | 08 | 4 | | |
| 6 | `appointment-management` | 09, 10 | 5 | | |
| 7 | `notifications` | 18 | 6 | | |
| 8 | `chat` | 12 | 6 | | |
| 9 | `video-consultation` | 11 | 6 | | |
| 10 | `medical-records` | 13 | 6 | | |
| 11 | `prescriptions` | 14, 16 | 10 | | |
| 12 | `prescription-pdf` (Django, then wire into Express) | 15 | 11 | | |
| 13 | `symptom-checker` (Django, then wire into Express) | 17 | 2 | | |
| 14 | `admin-user-management` | 19 | 2 | | |
| 15 | `polish-testing` | NFRs | all | | |

Features 7 to 10 only depend on appointments, so different pairs can work on them at the same time. Features 13 and 14 only need auth, so they can start early if someone is free.

---

## 12. Project structure

```
medisync/
  AGENTS.md                 AI rules (Antigravity reads this)
  PROJECT_CONTEXT.md        full requirements, use cases, flows
  PROGRESS.md               status and handoff, update every session
  GITHUB_WORKFLOW.md        this file
  README.md                 setup instructions and team table
  .gitignore
  .github/pull_request_template.md
  docs/                     practical reports and diagrams
  frontend/                 Angular app
    src/app/
      core/                 auth service, guards, interceptors
      shared/               reusable components and pipes
      features/             one folder per feature
  backend/                  Express API
    src/
      config/               db connection, env loading
      models/               Mongoose schemas
      routes/               URL to controller mapping
      controllers/          read request, call service, send response
      services/             business logic
      middleware/           auth, role check, validation, errors
      sockets/              Socket.IO: chat, notifications, WebRTC signaling
      utils/
      app.js                Express setup
      server.js             starts the server
    tests/
    .env.example
  ai-service/               Django: symptom checker and PDF generation
    config/
    symptom_checker/
    prescriptions/
    manage.py
    requirements.txt
    .env.example
```

Run all three locally in three terminals:

```bash
cd frontend && ng serve                 # http://localhost:4200
cd backend && npx nodemon src/server.js # http://localhost:5000
cd ai-service && python manage.py runserver 8000
```

(Add `"dev": "nodemon src/server.js"` to `backend/package.json` scripts so it becomes `npm run dev`.)

---

## 13. Mistakes to avoid

- Committing `.env` or `node_modules`. If a secret is ever pushed, change it immediately. Deleting the commit is not enough.
- Working directly on `main`.
- One person committing everyone's code. The history should match who did the work.
- A nested `.git` folder inside `frontend/`.
- Big PRs that sit open for a week.
- Pushing code you cannot explain.

## 14. Command cheat sheet

```bash
git status                       # what changed
git switch main                  # go to main
git pull                         # get latest
git switch -c feature/<name>     # new branch
git add <file>                   # stage
git commit -m "type(scope): msg" # save a step
git push -u origin <branch>      # first push of a branch
git push                         # later pushes
git fetch origin && git merge origin/main   # bring main into your branch
git log --oneline --graph        # history
git branch -d <branch>           # delete local branch after merge
```
