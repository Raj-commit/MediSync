# MediSync End-to-End Test Plan

This document outlines the end-to-end verification strategy, automated test suites, and manual test journeys for the MediSync Telemedicine & Digital Health Record platform across all 14 implemented features (FR-01 to FR-19), non-functional requirements (NFR-01 to NFR-12), and security guidelines defined in `AGENTS.md`.

---

## 1. Test Environment Setup & Prerequisites

Before running end-to-end tests, ensure services are installed and local databases are seeded.

### 1.1 Prerequisites
- **Node.js**: v20.x or v22.x
- **Python**: v3.12 or newer with virtual environment
- **MongoDB**: Community Server v7.x or v8.x running locally on `mongodb://127.0.0.1:27017`
- **Modern Web Browser**: Google Chrome, Mozilla Firefox, or Microsoft Edge (supports WebRTC, getUserMedia)

### 1.2 Ports
| Service | Directory | Local URL |
|---|---|---|
| Frontend (Angular) | `frontend/` | `http://localhost:4200` |
| Backend API (Express) | `backend/` | `http://localhost:5000` |
| AI Microservice (Django) | `ai-service/` | `http://localhost:8000` (Internal only) |

### 1.3 Seeding Demo Data
To test all journeys with pre-existing doctors, patients, appointments, medical records, and prescriptions:

1. **Seed Administrator Account**:
   ```powershell
   cd backend
   node scripts/seed-admin.js
   ```
2. **Seed Synthetic Demo Data** (safe, idempotent, local-only):
   ```powershell
   cd backend
   $env:SEED_DEMO_DATA="true"; node scripts/seed-demo-data.js
   ```

### 1.4 Test Credentials
| Role | Email | Password | Details |
|---|---|---|---|
| **Admin** | Configured in `backend/.env` (default `admin@medisync.local`) | Configured in `backend/.env` | Full account management privileges |
| **Doctor 1** | `dr.asha.patel@example.com` | `DemoPassword123!` | General Medicine & Cardiology |
| **Doctor 2** | `dr.vikram.rao@example.com` | `DemoPassword123!` | Dermatology |
| **Patient 1** | `aarav.sharma@example.com` | `DemoPassword123!` | DOB: 1990-05-15, Appointment with Dr. Patel |
| **Patient 2** | `diya.mehta@example.com` | `DemoPassword123!` | DOB: 1998-11-20, Appointment with Dr. Rao |

---

## 2. Automated Test Suites

All three application layers contain comprehensive automated test suites that must pass before release.

### 2.1 Backend Test Suite (Jest + Supertest)
```powershell
cd backend
npx jest --runInBand
```
- **Scope**: 17 test suites, 375 tests.
- **Coverage**: Authentication, JWT lifecycle, RBAC middleware, User profiles, Doctor availability slots, Appointment booking (atomic conflict handling), Appointment lifecycle transitions, Consultation Chat, WebRTC signaling, Medical records (atomic updates, privacy scoping), Prescriptions (PDF integration), Symptom checker proxy, Admin user management, Rate limiting, and Health endpoints.

### 2.2 Frontend Test Suite (Vitest via Angular CLI)
```powershell
cd frontend
npm test
```
- **Scope**: 42 test files, 339 tests.
- **Coverage**: Routing guards (`roleGuard`, `noAuthGuard`), HTTP interceptor, Auth service, Responsive dashboards, Doctor discovery & booking, Doctor availability range generator, Appointment management, Real-time chat UI, Video consultation component & media-devices service, Medical records UI, Prescription management & PDF download, Symptom checker form & emergency alerts, Admin user management dialogs, and Shared components.

### 2.3 AI & PDF Microservice Test Suite (Django)
```powershell
cd ai-service
.\.venv\Scripts\python manage.py test
```
- **Scope**: 4 test modules, 60 tests.
- **Coverage**: Internal `X-Service-Key` header authentication (timing-safe comparison), PDF prescription generation with ReportLab (in-memory buffer, HTML escaping), Rule-based symptom checker assessment engine, and Urgency level mapping.

---

## 3. End-to-End User Journeys

### Journey 1: Authentication & Authorization (FR-01 to FR-04, UC-01 to UC-03)
1. **Patient Registration**:
   - Navigate to `/register`.
   - Select role "Patient". Enter full name, valid email, phone, password (>= 8 chars), Date of Birth, and Address.
   - Click **Create Account**.
   - **Expected**: Account created (HTTP 201). User is automatically logged in and redirected to `/patient/dashboard`.
2. **Doctor Registration**:
   - Navigate to `/register`.
   - Select role "Doctor". Enter full name, valid email, phone, password, qualification (e.g., "MBBS, MD"), and at least one specialisation.
   - Click **Create Account**.
   - **Expected**: Doctor created with `isActive: true`. Redirected to `/doctor/dashboard`.
3. **Login & Role-Based Dashboard Routing**:
   - Log in with Patient, Doctor, and Admin credentials.
   - **Expected**:
     - Patient redirected to `/patient/dashboard`.
     - Doctor redirected to `/doctor/dashboard`.
     - Admin redirected to `/admin/dashboard`.
4. **Logged-in User Protection (`noAuthGuard`)**:
   - While logged in as any role, attempt to visit `/login` or `/register` in the address bar.
   - **Expected**: Immediately redirected back to own role dashboard; login/register forms are never presented to logged-in users.
5. **Logout**:
   - Click **Logout** from navigation bar.
   - **Expected**: JWT token and user details cleared from storage; redirected to `/login`. Visiting protected URLs afterwards returns to `/login`.

---

### Journey 2: Profiles Management (FR-05, FR-06, UC-04)
1. **Patient Profile Update**:
   - Log in as `aarav.sharma@example.com`. Navigate to `/patient/profile`.
   - Change address to "100 Marine Lines, Mumbai" and click **Save Changes**.
   - **Expected**: Server responds with updated profile. Dashboard welcome message reflects any name changes. Email field remains disabled and immutable.
2. **Doctor Profile Update**:
   - Log in as `dr.asha.patel@example.com`. Navigate to `/doctor/profile`.
   - Add "Internal Medicine" to specialisations and update qualifications.
   - Click **Save Changes**.
   - **Expected**: Updated specialisations persist and appear on doctor discovery pages.

---

### Journey 3: Doctor Availability Scheduling (FR-07, UC-05)
1. **Schedule Generation**:
   - Log in as `dr.asha.patel@example.com`. Navigate to `/doctor/availability`.
   - Select tomorrow's date, start time `09:00`, end time `11:00`.
   - Click **Generate Slots**.
   - **Expected**: Four 30-minute slots (`09:00`, `09:30`, `10:00`, `10:30`) appear as local draft chips. "Unsaved Changes" indicator appears.
2. **Slot Deletion (Open Slots)**:
   - Click **Remove** on the `10:30` slot.
   - **Expected**: Slot chip is removed from draft list.
3. **Save Changes**:
   - Click **Save Changes**.
   - **Expected**: Changes saved to backend (HTTP 200). Success banner displayed.
4. **Booked Slot Immutability**:
   - View an already-booked slot (marked with lock icon and "Booked" badge).
   - **Expected**: Booked slots do NOT render a "Remove" button; they display a "Locked" notice and cannot be removed or overwritten.

---

### Journey 4: Appointment Discovery & Booking (FR-08, UC-04, UC-06)
1. **Search Doctors**:
   - Log in as `diya.mehta@example.com`. Navigate to `/patient/doctors`.
   - Enter specialisation "Cardiology" and click **Search**.
   - **Expected**: Dr. Asha Patel is listed; Dr. Vikram Rao (Dermatology) is filtered out.
2. **Query Parameter Pre-population**:
   - Navigate directly to `/patient/doctors?specialisation=Dermatology`.
   - **Expected**: Search form initializes with "Dermatology" and results show Dr. Vikram Rao automatically.
3. **Slot Selection & Booking**:
   - Click **Book Appointment** on Dr. Asha Patel.
   - Choose an available open slot from her schedule.
   - Click **Confirm Booking**.
   - **Expected**: HTTP 201 created. In-page confirmation displays appointment summary, doctor name, and "requested" status. The booked slot disappears from open availability.
4. **Double Booking Prevention**:
   - If two patients attempt to book the exact same slot concurrently.
   - **Expected**: The first succeeds (201); the second receives HTTP 409 `SLOT_TAKEN` with a friendly error and schedule refresh.

---

### Journey 5: Appointment Lifecycle & Management (FR-09, FR-10, UC-06)
1. **Doctor Accept / Reject**:
   - Log in as `dr.asha.patel@example.com`. Navigate to `/doctor/appointments`.
   - View pending appointment in "Requested" tab. Click **Accept**.
   - **Expected**: Status transitions to "Confirmed".
2. **Patient Cancellation**:
   - Log in as patient. Navigate to `/patient/appointments`.
   - If appointment is > 1 hour in future, click **Cancel Appointment**.
   - **Expected**: Status transitions to "Cancelled", associated slot is released back to open.
3. **Rescheduling**:
   - Patient clicks **Reschedule**, chooses a new available slot from same doctor.
   - **Expected**: Status resets to "Requested", old slot released, new slot claimed.
4. **Doctor Complete**:
   - After consultation, doctor marks confirmed appointment as **Complete**.
   - **Expected**: Status transitions to "Completed", enabling record updates and prescription issuance.

---

### Journey 6: In-Consultation Live Chat (FR-12, UC-08)
1. **Room Access Control**:
   - Patient and Doctor for confirmed appointment open `/appointments/:id/chat`.
   - **Expected**: Both join room. Third-party user attempting to open same URL receives 403 `FORBIDDEN`.
2. **Message Exchange**:
   - Doctor sends "Good morning, how can I help you today?".
   - **Expected**: Message immediately appears on patient's screen via Socket.IO with timestamp and monotonic sequence number.
3. **Message History**:
   - Refresh the page.
   - **Expected**: Chat history is retrieved from MongoDB (`GET /api/v1/appointments/:id/messages`) in chronological sequence.

---

### Journey 7: In-Consultation Video Consultation (FR-11, UC-07)
1. **Pre-call Media Device Check**:
   - Navigate to `/appointments/:id/video`.
   - Browser prompts for camera and microphone permissions.
   - **Expected**: Local video preview displays user's video stream; camera and microphone toggle controls function.
2. **WebRTC Peer Connection**:
   - Both Patient and Doctor join the call.
   - **Expected**: WebRTC peer-to-peer connection is established via Socket.IO signaling. Remote audio/video stream renders smoothly.
3. **Call Termination**:
   - Either participant clicks **End Call**.
   - **Expected**: Media streams stopped, VideoSession marked ended, both participants returned safely.

---

### Journey 8: Medical Records Management (FR-13, UC-09)
1. **Patient Own Records View**:
   - Log in as `aarav.sharma@example.com`. Navigate to `/patient/records`.
   - **Expected**: Only Aarav's diagnoses, clinical notes, and treating doctor names are visible. Age is derived dynamically from Date of Birth.
2. **Doctor Treating Access**:
   - Log in as `dr.asha.patel@example.com`. Navigate to `/doctor/records/patient/:aaravId`.
   - **Expected**: Record accessible because Dr. Patel has an appointment with Aarav.
3. **Doctor Non-Treating Block**:
   - Log in as doctor with NO appointments with patient. Attempt to access `/doctor/records/patient/:aaravId`.
   - **Expected**: HTTP 403 `FORBIDDEN`. Patient record is not disclosed.
4. **Adding Clinical Entry**:
   - Treating doctor enters new diagnosis and notes; submits.
   - **Expected**: Entry atomically appended to patient's MedicalRecord document with current timestamp and doctor ID.

---

### Journey 9: Digital Prescriptions & PDF (FR-14 to FR-16, UC-10, UC-11)
1. **Doctor Prescribes Medication**:
   - Log in as treating doctor. Open completed appointment prescription view `/doctor/appointments/:id/prescription`.
   - Add medicine ("Amoxicillin 500mg"), dosage ("1 capsule 3x daily"), and instructions ("Take after meals for 7 days").
   - Click **Issue Prescription**.
   - **Expected**: Prescription saved (HTTP 201). Background request triggers Django ReportLab to generate digital PDF stored safely in MongoDB.
2. **Patient View & Download**:
   - Log in as patient. Navigate to `/patient/prescriptions`.
   - View prescription card with medicines list. Click **Download PDF**.
   - **Expected**: Secure PDF streamed from `GET /api/v1/prescriptions/:id/pdf` with correct headers (`Content-Type: application/pdf`).

---

### Journey 10: AI Symptom Checker (FR-17, UC-12)
1. **Symptom Entry & Validation**:
   - Log in as patient. Navigate to `/patient/symptom-checker`.
   - Add symptoms ("chest pain", "shortness of breath") using Enter key or Add button.
   - **Expected**: Chips rendered with remove buttons; duplicate entries normalized and rejected; max 10 symptoms enforced.
2. **Emergency Urgency Level Handling**:
   - Submit "severe chest pain", "difficulty breathing".
   - **Expected**: Emergency banner rendered prominently at top with red styling and assertive screen-reader alert. Mandatory disclaimer displayed: *"This assessment is informational and does not constitute medical advice."*
3. **Routine Assessment & Doctor Referral**:
   - Submit "mild headache", "runny nose".
   - **Expected**: Suggested specialisation ("General Physician") rendered with a "Find a Doctor" link pre-filtering to that specialisation.
4. **History Scrolling**:
   - View previous checks below current form. Expand card to review past recommendations.

---

### Journey 11: Real-Time Notifications (FR-18, UC-13)
1. **Notification Delivery**:
   - Trigger an action (e.g., patient requests an appointment with doctor).
   - **Expected**: Navbar notification bell displays unread badge counter.
2. **Notification View & Mark as Read**:
   - Click bell or navigate to `/notifications`.
   - Click unread notification card.
   - **Expected**: Marked as read via `PATCH /notifications/:id/read`. Direct link opens relevant appointment.

---

### Journey 12: Administrative User Management & Deactivation (FR-19, UC-14)
1. **Admin Access Only**:
   - Non-admin visiting `/admin/users` is redirected with 403.
   - Admin logging in opens `/admin/users` with semantic data table of doctors and patients.
2. **Search & Filter**:
   - Search by name or email, filter by Role (Doctor/Patient) and Status (Active/Inactive).
   - **Expected**: Matching accounts displayed; pagination resets to page 1.
3. **Account Deactivation Modal**:
   - Click **Deactivate** on an active account.
   - **Expected**: Modal dialog appears with focus trapped on "Cancel". Warning states that active session will terminate immediately and existing clinical appointments remain untouched.
   - Confirm deactivation.
   - **Expected**: Account `isActive` set to `false`. If deactivated user attempts to call any API endpoint with their existing JWT, they receive immediate 403 `ACCOUNT_DISABLED`.

---

## 4. Non-Functional & Security Audit (NFR-01 to NFR-12)

| NFR | Requirement | Verification Method | Status |
|---|---|---|---|
| **NFR-01** | Performance & Response Times | API requests respond under 500ms locally; PDF generation in Django executes under 200ms. | Verified |
| **NFR-02** | Scalability & Microservices | Django decoupled from Angular; Express acts as secure API gateway. | Verified |
| **NFR-03** | Reliability & Error Handling | Graceful 502/503 fallback if Django microservice is down; prescriptions saved even if initial PDF fails. | Verified |
| **NFR-04** | Security & Password Hashing | Passwords hashed with bcrypt (salt rounds = 10); passwords never logged or returned in responses. | Verified |
| **NFR-05** | Role-Based Access Control (RBAC) | Strict JWT verification + role checking on every protected endpoint; guards protect client routes. | Verified |
| **NFR-06** | Data Integrity & Concurrency | Atomic `Slot.findOneAndUpdate` and partial unique compound indexes prevent double booking. | Verified |
| **NFR-07** | Network Security | CORS restricted to `CLIENT_URL`; Helmet security headers enabled; sensitive endpoints set `Cache-Control: no-store`. | Verified |
| **NFR-08** | Medical Privacy (AGENTS.md Sec 8) | Patients access only own records; doctors access only treated patients; zero client-side caching of sensitive clinical data. | Verified |
| **NFR-09** | Usability & Accessibility | WCAG 2.1 AA keyboard navigation, modal focus traps, `aria-live` polite/assertive regions, responsive layout. | Verified |
| **NFR-10** | Microservice Inter-Service Security | Internal HTTP calls from Express to Django require secret `X-Service-Key` header with timing-safe validation. | Verified |
| **NFR-11** | Medical Safety & Disclaimers | Mandatory medical disclaimer displayed prominently on every symptom check and historical card. | Verified |
| **NFR-12** | Maintainability & Test Coverage | Over 770 automated unit and integration tests across all services; standalone Angular 21 components and signals. | Verified |

---

## 5. Sign-Off & Verification Checklist

- [x] Backend Jest test suite passes (17 suites, 375 tests, 0 failures)
- [x] Frontend Vitest test suite passes (42 suites, 339 tests, 0 failures, 0 skipped)
- [x] Django test suite passes (4 modules, 60 tests, 0 failures)
- [x] Frontend production build compiles cleanly (`npm run build`)
- [x] Demo data seeder script executes idempotently with strict safety guards
- [x] All 14 features verified against functional requirements FR-01 through FR-19
