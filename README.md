# MediSync: Telemedicine & Digital Health Record System

MediSync is a secure, role-based telemedicine and digital health records platform developed for the **Advanced Web Technology** course. It enables patients to discover doctors, book appointments, attend live WebRTC video consultations with interactive chat, review digital prescriptions with downloadable PDFs, use an AI symptom checker, and maintain unified medical records. Doctors and administrators are provided with dedicated, role-scoped workflows.

---

## Team

| Name | Roll Number | GitHub Username | Role / Contribution |
|---|---|---|---|
| **Parmar Hitanshu** | 24bt04215 | [Hitman0137](https://github.com/Hitman0137) | Backend Profiles, Notifications, Admin User Management |
| **Uday Raj** | 24bt04217 | [Raj-commit](https://github.com/Raj-commit) | Doctor Availability, Appointment Lifecycle, Prescription PDF |
| **Patel Alis** | 24bt04218 | [alis1246](https://github.com/alis1246) | Auth, Appointment Booking, WebRTC Video, Polish & Testing |
| **Riyank Malsatar** | 24bt04227 | [riyank-max](https://github.com/riyank-max) | Consultation Chat, Medical Records, Symptom Checker UI |

---

## Architecture & Technology Stack

| Layer | Technology | Port | Description |
|---|---|---|---|
| **Frontend** | Angular 21, TypeScript, Vitest | `4200` | Standalone components, reactive signals, role-based route guards, and accessible semantic UI |
| **Backend API** | Node.js, Express.js 5, Mongoose 9 | `5000` | Thin controllers, service-oriented business logic, JWT authentication, and Socket.IO signaling |
| **Database** | MongoDB 7+ | `27017` | Document storage with discriminator models (`users`), unique partial compound indexes, and atomic updates |
| **AI & PDF Microservice** | Django 6.1, Django REST Framework, ReportLab | `8000` | Internal-only microservice for rule-based symptom assessment and digital prescription PDF compilation |

```
[ Browser / Angular UI ]  <--- HTTPS / WSS --->  [ Express Backend API Gateway ]
        (:4200)                                              (:5000)
                                                                |
                                             +------------------+------------------+
                                             |                                     |
                                     [ MongoDB (Mongoose) ]             [ Django AI & PDF Service ]
                                           (:27017)                       (:8000, internal HTTP)
                                                                         (Requires X-Service-Key)
```

---

## Prerequisites

Before starting, ensure the following software is installed on your system:
- **Node.js**: v20.x or v22.x (`node --version`)
- **npm**: v10.x or newer (`npm --version`)
- **Python**: v3.12 or newer (`python --version`)
- **MongoDB Community Server**: v7.x or v8.x running locally on `mongodb://127.0.0.1:27017`
- **Git**

---

## Local Setup & Configuration

### 1. Clone the Repository
```bash
git clone https://github.com/alis1246/MediSync.git
cd MediSync
```

### 2. Configure Environment Variables
Copy the example environment configuration files in each service directory:

#### Backend (`backend/.env`):
```bash
cp backend/.env.example backend/.env
```
Ensure `backend/.env` contains valid development values:
```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:4200
MONGODB_URI=mongodb://127.0.0.1:27017/medisync
MONGODB_URI_TEST=mongodb://127.0.0.1:27017/medisync_test
JWT_SECRET=supersecret_development_jwt_key_32chars_min
JWT_EXPIRES_IN=1d
AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_KEY=dev_shared_internal_secret_key_medisync
ADMIN_NAME="System Administrator"
ADMIN_EMAIL="admin@medisync.local"
ADMIN_PASSWORD="AdminPassword123!"
ADMIN_PHONE="+919876543200"
```

#### AI Microservice (`ai-service/.env`):
```bash
cp ai-service/.env.example ai-service/.env
```
Ensure `ai-service/.env` matches the backend secret key:
```env
DJANGO_SECRET_KEY=django-insecure-dev-key-change-in-production
AI_SERVICE_KEY=dev_shared_internal_secret_key_medisync
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
```

---

## Dependency Installation & Seeding

### 1. Install Dependencies

```bash
# Frontend
cd frontend
npm install

# Backend
cd ../backend
npm install

# AI Microservice
cd ../ai-service
python -m venv .venv
# On Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# On macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

### 2. Seed Admin & Demo Accounts (Order of Operations)

1. **Seed Administrator Account**:
   ```powershell
   cd backend
   node scripts/seed-admin.js
   ```
2. **Seed Synthetic Demo Data** (idempotent, safe for local MongoDB):
   ```powershell
   # Windows PowerShell:
   $env:SEED_DEMO_DATA="true"; node scripts/seed-demo-data.js
   
   # Linux/macOS:
   # SEED_DEMO_DATA=true node scripts/seed-demo-data.js
   ```

### Demo Accounts Table

| Role | Email | Password | Details |
|---|---|---|---|
| **Admin** | `admin@medisync.local` | `AdminPassword123!` | System administrator, user account management |
| **Doctor 1** | `dr.asha.patel@example.com` | `DemoPassword123!` | General Medicine & Cardiology; has active appointment with Aarav |
| **Doctor 2** | `dr.vikram.rao@example.com` | `DemoPassword123!` | Dermatology; has active appointment with Diya |
| **Patient 1** | `aarav.sharma@example.com` | `DemoPassword123!` | Confirmed appointment, medical record & prescription |
| **Patient 2** | `diya.mehta@example.com` | `DemoPassword123!` | Confirmed appointment, medical record & prescription |

---

## Running the Application Locally

Run each service in a separate terminal:

### Terminal 1: Backend API Gateway (Port 5000)
```powershell
cd backend
npm run dev
# Server running at http://localhost:5000
```

### Terminal 2: AI & Prescription Microservice (Port 8000)
```powershell
cd ai-service
.\.venv\Scripts\Activate.ps1
python manage.py runserver 8000
# Django microservice running at http://localhost:8000
```

### Terminal 3: Angular Frontend (Port 4200)
```powershell
cd frontend
npm start
# Web app running at http://localhost:4200
```

Navigate to `http://localhost:4200` in your web browser.

---

## Running Automated Tests

All services have dedicated automated test runners covering unit, integration, and security checks:

```powershell
# 1. Backend Test Suite (17 suites, 375 tests)
cd backend
npx jest --runInBand

# 2. Frontend Test Suite (42 test files, 339 tests)
cd frontend
npm test

# 3. AI Service Test Suite (4 modules, 60 tests)
cd ai-service
.\.venv\Scripts\Activate.ps1
python manage.py test

# 4. Frontend Production Build Check
cd frontend
npm run build
```

---

## Troubleshooting Guide

- **MongoDB Connection Refused (`ECONNREFUSED 127.0.0.1:27017`)**:
  Ensure MongoDB service is running locally (`mongod` or through Windows Services: `net start MongoDB`).
- **AI Service Unauthorized (`403 / 502 Service Unavailable`)**:
  Verify that `AI_SERVICE_KEY` in `backend/.env` exactly matches `AI_SERVICE_KEY` in `ai-service/.env`.
- **CORS Error in Browser**:
  Ensure `CLIENT_URL` in `backend/.env` is set to `http://localhost:4200` without a trailing slash.
- **Port Conflict (`EADDRINUSE: 5000` or `4200`)**:
  Check if a previous instance is running. On Windows: `Get-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess | Stop-Process`.
- **WebRTC Camera/Microphone Blocked**:
  WebRTC requires a secure context (`https://`) or `http://localhost`. Ensure your browser has granted permission for camera and microphone on `http://localhost:4200`.

---

## Documentation Links

- [`AGENTS.md`](./AGENTS.md): Architecture rules, coding conventions, roles, and definitions of done.
- [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md): Complete requirements specification (FR-01 through FR-19, NFR-01 through NFR-12, and use cases).
- [`PROGRESS.md`](./PROGRESS.md): Living feature status, architectural decisions log, and known issues.
- [`docs/TEST_PLAN.md`](./docs/TEST_PLAN.md): End-to-end verification plan, manual test journeys, and security checklists.
- [`TEAM_GUIDE.md`](./TEAM_GUIDE.md): Project rules and teamwork agreements.
- [`GITHUB_WORKFLOW.md`](./GITHUB_WORKFLOW.md): Git branching, review discipline, and PR process.
