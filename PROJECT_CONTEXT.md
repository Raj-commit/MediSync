# PROJECT_CONTEXT.md: MediSync full brief

Static reference. Read with `AGENTS.md` (rules) and `PROGRESS.md` (current status). This file is self-contained, so an AI with no other history can understand the project from it.

## 1. What MediSync is

MediSync is a web-based telemedicine platform. Patients book doctor appointments, attend online video consultations, and securely store their medical records and digital prescriptions. There are separate interfaces for patients, doctors and administrators, with role-based access. An AI-powered symptom checker and PDF prescription generation are included. The aim is to make healthcare more accessible, organised and convenient in a single platform.

Stack: Angular frontend. Node.js, Express.js and MongoDB backend (authentication, appointments, chat, notifications). Django service for the AI symptom checker and PDF prescriptions. JWT authentication. WebRTC for video.

It is a college group project (Advanced Web Technology). Scope is exactly the features below. Do not add features that are not listed.

## 2. Problem it solves

Offline appointment systems mean long waits, manual registers and no visibility of doctor availability. Remote or mobility-limited patients struggle to reach doctors. Paper records and handwritten prescriptions are hard to retrieve and easy to lose. There is no central, secure store of health information, and no clean way to give patients, doctors and administrators different levels of access.

## 3. Stakeholders

| Actor | Role |
|---|---|
| Patient | Books appointments, attends consultations, views own records and prescriptions, uses symptom checker |
| Doctor | Manages availability and appointments, consults, updates records, writes prescriptions |
| Administrator | Manages patient and doctor accounts |
| AI Symptom Checker (system actor) | The Django service Express calls to assess symptoms |

Patient and Doctor share most behaviour (login, profile, appointments, video, chat, records, notifications), so in the code they are subclasses of one abstract User.

## 4. Functional requirements

| ID | Requirement | Actor | Description |
|---|---|---|---|
| FR-01 | User registration | Patient, Doctor | Register with personal and professional details |
| FR-02 | Login and logout | Patient, Doctor, Admin | Log in and out securely with credentials |
| FR-03 | JWT authentication | System | Issue a JWT on login and validate it for protected resources |
| FR-04 | Role-based access | Patient, Doctor, Admin | Each role has its own interface and permissions |
| FR-05 | Patient profile | Patient | Create, view, update own profile |
| FR-06 | Doctor profile | Doctor | Create, view, update professional profile, including specialisation and qualifications |
| FR-07 | Doctor availability | Doctor | Set and update available time slots |
| FR-08 | Appointment booking | Patient | Search doctors and book an open slot |
| FR-09 | Appointment management | Patient, Doctor | Patient reschedules or cancels. Doctor accepts or rejects |
| FR-10 | Appointment history | Patient, Doctor | View past and upcoming appointments |
| FR-11 | Video consultation | Patient, Doctor | Real-time video over WebRTC |
| FR-12 | Chat | Patient, Doctor | Exchange text messages |
| FR-13 | Medical records | Patient, Doctor | Doctors update records. Patients view their own |
| FR-14 | Create prescription | Doctor | Create a digital prescription after a consultation |
| FR-15 | PDF prescription | System | Generate a downloadable PDF via the Django service |
| FR-16 | View prescriptions | Patient | View and download past prescriptions |
| FR-17 | AI symptom checker | Patient | Enter symptoms, get a preliminary AI assessment via Django |
| FR-18 | Notifications | Patient, Doctor | Appointment confirmations, reminders, updates |
| FR-19 | Admin user management | Admin | View, manage, deactivate patient and doctor accounts |

## 5. Non-functional requirements

No numeric targets were set. If you propose one, label it "proposed target".

| ID | Quality | Requirement |
|---|---|---|
| NFR-01 | Security | JWT authentication restricts protected resources to verified users |
| NFR-02 | Performance | Normal requests (dashboard, appointment details) respond in reasonable time |
| NFR-03 | Reliability | Records and prescriptions are stored and retrieved without data loss |
| NFR-04 | Availability | Available for scheduled appointments and consultations, minimal downtime |
| NFR-05 | Usability | Simple, intuitive interfaces for users of varying technical comfort |
| NFR-06 | Scalability | Handles growing users, doctors and appointments |
| NFR-07 | Maintainability | Modular, so changes do not ripple into unrelated modules |
| NFR-08 | Privacy | Patient medical information restricted to users authorised by role |
| NFR-09 | Data integrity | Records and prescriptions stay accurate and are not altered without authorisation |
| NFR-10 | Compatibility | Works on common modern browsers |
| NFR-11 | Accessibility | Basic accessibility practices |
| NFR-12 | Responsiveness | Angular UI adapts to desktop and mobile |

## 6. Use cases

UC-01 Register, UC-02 Login, UC-03 Manage Profile, UC-04 Book Appointment, UC-05 Manage Appointment, UC-06 View Appointment History, UC-07 Video Consultation, UC-08 Chat, UC-09 View or Update Medical Records, UC-10 Create Prescription, UC-11 Generate PDF Prescription (always included by UC-10), UC-12 Check Symptoms, UC-13 Receive Notifications, UC-14 Manage Users.

Chat can optionally extend Video Consultation.

### Login (UC-02)
1. User enters email and password and submits.
2. System validates credentials against the stored user.
3. If valid, system issues a JWT and redirects to the role-specific dashboard.
- Alternate: invalid credentials, show an error and stay on the login page.

### Book Appointment (UC-04)
Precondition: patient is logged in.
1. Patient searches doctors by specialisation or name.
2. Patient picks a doctor and views available slots.
3. Patient selects a slot and confirms.
4. System checks the slot is still open.
5. If open, system creates the appointment and notifies patient and doctor.
- Alternate: slot just taken, system returns `409 Conflict`, shows an error, patient picks another slot.

### Create Prescription (UC-10, includes UC-11)
Precondition: the consultation appointment exists and has taken place.
1. Doctor opens the appointment and chooses Create Prescription.
2. Doctor enters medicines, dosage and instructions, then submits.
3. System saves the prescription.
4. System generates a PDF through the Django service.
5. System notifies the patient.
- Alternate: a required field is blank, show a validation error.

## 7. Key flows

**Booking sequence.** Patient selects doctor and slot in the Angular app. Angular sends `POST /appointments` to Express. Express checks slot availability in MongoDB. If available: insert the appointment, send an asynchronous notification to the doctor, return `201 Created`, show a confirmation. If not: return `409 Conflict`, show a "slot taken" error. Patient and doctor are notified in parallel.

**Appointment lifecycle.** `requested`, `confirmed`, `completed`, `cancelled`. A doctor rejecting a request is stored as `cancelled` (proposed mapping).

**AI symptom check.** Angular sends symptoms to Express. Express forwards them to Django with the `X-Service-Key` header. Django returns an assessment. Express stores a SymptomCheckResult and returns it. The UI always shows a disclaimer that this is not a diagnosis.

**PDF prescription.** Express sends the saved prescription to Django. Django returns a PDF. Express stores it and saves its location as `pdfUrl`.

## 8. Data model summary

User (abstract: userId, name, contact, passwordHash, role) with subclasses Patient (dateOfBirth, address, derived age), Doctor (specialisations, qualification, availability) and Administrator.

Appointment links one patient and one doctor. Each appointment can have at most one VideoSession and one Prescription, and many ChatMessages. ChatMessage is identified by appointment plus a sequence number. Each patient has exactly one MedicalRecord, and many doctors can update many records. A Prescription contains one or more Medicines (a medicine exists independently of any prescription). Each Patient has many SymptomCheckResults. Each User receives many Notifications.

Full field lists are in `AGENTS.md` section 5.
