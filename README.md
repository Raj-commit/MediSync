# MediSync
Telemedicine and Digital Health Record System

A web-based telemedicine platform: patients book appointments, attend video consultations, and keep medical records and prescriptions in one place. Doctors and administrators have their own interfaces.

**Stack:** Angular, Node.js/Express, MongoDB, Django (AI symptom checker and PDF prescriptions), JWT, WebRTC.

## Team
| Name | Roll number | GitHub username |
|---|---|---|
| Parmar Hitanshu | 24bt04215 | Hitman0137 |
| Uday Raj | 24bt04217 | Raj-commit |
| Patel Alis | 24bt04218 | alis1246 |
| Riyank Malsatar | 24bt04227 | riyank-max |

## Run locally
Copy each `.env.example` to `.env` and fill in real values (never commit `.env`).

```bash
cd frontend && npm install && ng start                 # http://localhost:4200
cd backend && npm install && npm run dev                # http://localhost:5000
cd ai-service && python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt && python manage.py runserver 8000
```

## Docs
See `AGENTS.md`, `PROJECT_CONTEXT.md`, `PROGRESS.md`, `TEAM_GUIDE.md` and `GITHUB_WORKFLOW.md`.
