// backend/tests/prescriptions.test.js
// Comprehensive test suite for FR-14, FR-15, and FR-16: Digital Prescriptions & PDF (UC-10, UC-11)
// Covers: Prescription model, input validation, Django PDF client, error mapping to 502,
// POST /prescriptions (doctor create, completed status check, single prescription rule 409,
// zero data loss on Django failure, patient notification), GET /prescriptions (patient and doctor listing,
// ?appointmentId= filter, pagination, no-store, PII protection), GET /prescriptions/:id/pdf
// (patient & doctor download, anti-enumeration 404, on-demand PDF recovery, safe headers),
// and admin 403 / unauthenticated 401 access control.

process.env.JWT_SECRET = "test-secret-for-prescriptions-tests";
process.env.JWT_EXPIRES_IN = "1d";
process.env.AI_SERVICE_URL = "http://localhost:8000";
process.env.AI_SERVICE_KEY = "test-ai-service-key";

// Disable login rate limiter in tests
jest.mock("../src/middleware/rateLimiters", () => ({
  createLoginLimiter: () => (req, res, next) => next(),
}));

const request = require("supertest");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const app = require("../src/app");
const { User, Patient, Doctor, Admin } = require("../src/models/User");
const Slot = require("../src/models/Slot");
const Appointment = require("../src/models/Appointment");
const Prescription = require("../src/models/Prescription");
const { Notification } = require("../src/models/Notification");
const pdfService = require("../src/services/pdfService");
const { connectTestDB, clearTestDB, closeTestDB } = require("./helpers/db");

jest.setTimeout(30000);

const MOCK_PDF_BYTES = Buffer.from(
  "%PDF-1.4\n%mock prescription binary content for testing\n%%EOF",
);

beforeAll(async () => {
  await connectTestDB();
  await User.init();
  await Slot.init();
  await Appointment.init();
  await Prescription.init();
  await Notification.init();
});

beforeEach(async () => {
  await clearTestDB();
  jest.restoreAllMocks();

  // Default global fetch mock for Django PDF service
  jest.spyOn(global, "fetch").mockImplementation(async (url, options) => {
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/pdf" }),
      arrayBuffer: async () => MOCK_PDF_BYTES,
    };
  });
});

afterAll(async () => {
  await closeTestDB();
});

// ---------- Helpers ----------

const PASSWORD = "password123";
let userSeq = 0;

function patientData(overrides = {}) {
  userSeq += 1;
  return {
    role: "patient",
    name: `Patient ${userSeq}`,
    email: `patient_${userSeq}_${Date.now()}@example.com`,
    phone: `+9112345${String(userSeq).padStart(5, "0")}`,
    password: PASSWORD,
    dateOfBirth: "1995-05-20",
    address: "456 Health Ave, Mumbai",
    ...overrides,
  };
}

function doctorData(overrides = {}) {
  userSeq += 1;
  return {
    role: "doctor",
    name: `Dr. Mehta ${userSeq}`,
    email: `doctor_${userSeq}_${Date.now()}@example.com`,
    phone: `+9198765${String(userSeq).padStart(5, "0")}`,
    password: PASSWORD,
    specialisations: ["General Medicine"],
    qualification: "MBBS, MD",
    ...overrides,
  };
}

const registerUser = (body) =>
  request(app).post("/api/v1/auth/register").send(body);
const loginUser = (email, password = PASSWORD) =>
  request(app).post("/api/v1/auth/login").send({ email, password });

async function createPatientAndLogin(overrides = {}) {
  const data = patientData(overrides);
  const regRes = await registerUser(data);
  expect(regRes.status).toBe(201);
  const logRes = await loginUser(data.email, data.password);
  expect(logRes.status).toBe(200);
  return { token: logRes.body.token, user: logRes.body.user, rawData: data };
}

async function createDoctorAndLogin(overrides = {}) {
  const data = doctorData(overrides);
  const regRes = await registerUser(data);
  expect(regRes.status).toBe(201);
  const logRes = await loginUser(data.email, data.password);
  expect(logRes.status).toBe(200);
  return { token: logRes.body.token, user: logRes.body.user, rawData: data };
}

async function createAdminAndLogin() {
  userSeq += 1;
  const email = `admin_${userSeq}_${Date.now()}@example.com`;
  await Admin.create({
    name: "Admin User",
    email,
    phone: `+9111111${String(userSeq).padStart(5, "0")}`,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
  });
  const res = await loginUser(email, PASSWORD);
  expect(res.status).toBe(200);
  return { token: res.body.token, user: res.body.user };
}

async function createAppointmentDirect({
  patientId,
  doctorId,
  status = "completed",
}) {
  const start = new Date(Date.now() - 3600 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  const slot = await Slot.create({
    doctor: doctorId,
    startTime: start,
    endTime: end,
    isBooked: true,
  });

  return Appointment.create({
    patient: patientId,
    doctor: doctorId,
    slot: slot._id,
    dateTime: start,
    endTime: end,
    status,
  });
}

function validPrescriptionItems() {
  return [
    {
      medicine: "Amoxicillin",
      dosage: "500mg",
      instructions: "Take 1 capsule three times daily after meals",
    },
    {
      medicine: "Paracetamol",
      dosage: "650mg",
      instructions: "Take 1 tablet every 6 hours as needed for fever",
    },
  ];
}

// ==============================================================================
// 1. Prescription Model Tests
// ==============================================================================
describe("Prescription Model", () => {
  it("enforces unique index on appointment field (at most 1 prescription per appointment)", async () => {
    const doctor = await createDoctorAndLogin();
    const patient = await createPatientAndLogin();
    const appointment = await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
    });

    await Prescription.create({
      appointment: appointment._id,
      patient: patient.user.id,
      doctor: doctor.user.id,
      issuedDate: "2026-10-29",
      items: validPrescriptionItems(),
      pdfUrl: `/api/v1/prescriptions/test/pdf`,
      pdfStatus: "ready",
    });

    // Attempting a second prescription with the same appointment ID must fail with duplicate key
    await expect(
      Prescription.create({
        appointment: appointment._id,
        patient: patient.user.id,
        doctor: doctor.user.id,
        issuedDate: "2026-10-29",
        items: validPrescriptionItems(),
        pdfUrl: `/api/v1/prescriptions/test2/pdf`,
        pdfStatus: "ready",
      }),
    ).rejects.toThrow();
  });

  it("rejects prescription with empty items array or more than 50 items", async () => {
    const doctor = await createDoctorAndLogin();
    const patient = await createPatientAndLogin();
    const appointment = await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
    });

    // 0 items
    await expect(
      Prescription.create({
        appointment: appointment._id,
        patient: patient.user.id,
        doctor: doctor.user.id,
        issuedDate: "2026-10-29",
        items: [],
        pdfUrl: "/api/v1/prescriptions/test/pdf",
      }),
    ).rejects.toThrow();

    // 51 items
    const tooManyItems = Array.from({ length: 51 }, (_, i) => ({
      medicine: `Med ${i}`,
      dosage: "10mg",
      instructions: "daily",
    }));

    await expect(
      Prescription.create({
        appointment: appointment._id,
        patient: patient.user.id,
        doctor: doctor.user.id,
        issuedDate: "2026-10-29",
        items: tooManyItems,
        pdfUrl: "/api/v1/prescriptions/test/pdf",
      }),
    ).rejects.toThrow();
  });

  it("pdfData field is select: false by default and not returned in normal queries", async () => {
    const doctor = await createDoctorAndLogin();
    const patient = await createPatientAndLogin();
    const appointment = await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
    });

    const created = await Prescription.create({
      appointment: appointment._id,
      patient: patient.user.id,
      doctor: doctor.user.id,
      issuedDate: "2026-10-29",
      items: validPrescriptionItems(),
      pdfUrl: "/api/v1/prescriptions/test/pdf",
      pdfStatus: "ready",
      pdfData: MOCK_PDF_BYTES,
    });

    const queried = await Prescription.findById(created._id);
    expect(queried.pdfData).toBeUndefined();

    // Explicitly requested with +pdfData
    const queriedWithPdf = await Prescription.findById(created._id).select(
      "+pdfData",
    );
    expect(queriedWithPdf.pdfData).toBeDefined();
    expect(queriedWithPdf.pdfData.subarray(0, 5).toString("ascii")).toBe(
      "%PDF-",
    );
  });
});

// ==============================================================================
// 2. Django PDF Client Unit Tests (pdfService)
// ==============================================================================
describe("Django PDF Client (pdfService)", () => {
  it("sends exact endpoint, headers, and 5 fields to Django without leaking personal info", async () => {
    let capturedUrl = "";
    let capturedOptions = {};

    jest.spyOn(global, "fetch").mockImplementation(async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/pdf" }),
        arrayBuffer: async () => MOCK_PDF_BYTES,
      };
    });

    const result = await pdfService.generatePrescriptionPdf({
      prescriptionId: "presc-123",
      patientName: "Jane Patient",
      doctorName: "Dr. Sarah Connor",
      issuedDate: "2026-10-29",
      items: [
        { medicine: "Amoxicillin", dosage: "500mg", instructions: "Twice daily" },
      ],
    });

    expect(result).toBeInstanceOf(Buffer);
    expect(capturedUrl).toBe("http://localhost:8000/api/prescriptions/pdf");
    expect(capturedOptions.method).toBe("POST");
    expect(capturedOptions.headers["X-Service-Key"]).toBe("test-ai-service-key");
    expect(capturedOptions.headers["Content-Type"]).toBe("application/json");

    const sentBody = JSON.parse(capturedOptions.body);
    expect(Object.keys(sentBody).sort()).toEqual(
      ["doctorName", "issuedDate", "items", "patientName", "prescriptionId"].sort()
    );
    expect(sentBody.prescriptionId).toBe("presc-123");
    expect(sentBody.patientName).toBe("Jane Patient");
    expect(sentBody.doctorName).toBe("Dr. Sarah Connor");
    expect(sentBody.issuedDate).toBe("2026-10-29");
    expect(sentBody.items).toHaveLength(1);
  });

  it("maps missing AI_SERVICE_KEY to 502 PDF_SERVICE_UNAVAILABLE without crashing", async () => {
    const originalKey = process.env.AI_SERVICE_KEY;
    delete process.env.AI_SERVICE_KEY;

    try {
      await pdfService.generatePrescriptionPdf({
        prescriptionId: "p1",
        patientName: "P",
        doctorName: "D",
        issuedDate: "2026-10-29",
        items: validPrescriptionItems(),
      });
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(502);
      expect(err.code).toBe("PDF_SERVICE_UNAVAILABLE");
      expect(err.message).toBe("Prescription PDF service is temporarily unavailable. Please try again later.");
    } finally {
      process.env.AI_SERVICE_KEY = originalKey;
    }
  });

  it("maps Django 400, 403, and 500 errors to 502 without leaking internal error text", async () => {
    for (const status of [400, 403, 500]) {
      jest.spyOn(global, "fetch").mockImplementationOnce(async () => ({
        ok: false,
        status,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            message: "Internal Django Secret Error",
            code: "DJANGO_FAIL",
          }),
      }));

      try {
        await pdfService.generatePrescriptionPdf({
          prescriptionId: "p1",
          patientName: "P",
          doctorName: "D",
          issuedDate: "2026-10-29",
          items: validPrescriptionItems(),
        });
        throw new Error("Should have thrown");
      } catch (err) {
        expect(err.status).toBe(502);
        expect(err.code).toBe("PDF_SERVICE_UNAVAILABLE");
        expect(err.message).toBe("Prescription PDF service is temporarily unavailable. Please try again later.");
      }
    }
  });

  it("maps network disconnect / fetch rejection to 502 PDF_SERVICE_UNAVAILABLE", async () => {
    jest
      .spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:8000"));

    try {
      await pdfService.generatePrescriptionPdf({
        prescriptionId: "p1",
        patientName: "P",
        doctorName: "D",
        issuedDate: "2026-10-29",
        items: validPrescriptionItems(),
      });
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(502);
      expect(err.code).toBe("PDF_SERVICE_UNAVAILABLE");
      expect(err.message).toBe("Prescription PDF service is temporarily unavailable. Please try again later.");
    }
  });

  it("maps non-PDF content type to 502 PDF_SERVICE_UNAVAILABLE", async () => {
    jest.spyOn(global, "fetch").mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      arrayBuffer: async () =>
        Buffer.from("<html><body>Error Page</body></html>"),
    }));

    try {
      await pdfService.generatePrescriptionPdf({
        prescriptionId: "p1",
        patientName: "P",
        doctorName: "D",
        issuedDate: "2026-10-29",
        items: validPrescriptionItems(),
      });
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(502);
      expect(err.code).toBe("PDF_SERVICE_UNAVAILABLE");
    }
  });

  it("maps payload missing %PDF- marker to 502 PDF_SERVICE_UNAVAILABLE", async () => {
    jest.spyOn(global, "fetch").mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/pdf" }),
      arrayBuffer: async () => Buffer.from("NOT-A-PDF-CONTENT"),
    }));

    try {
      await pdfService.generatePrescriptionPdf({
        prescriptionId: "p1",
        patientName: "P",
        doctorName: "D",
        issuedDate: "2026-10-29",
        items: validPrescriptionItems(),
      });
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(502);
      expect(err.code).toBe("PDF_SERVICE_UNAVAILABLE");
    }
  });

  it("maps oversized PDF (> 2 MB) to 502 PDF_SERVICE_UNAVAILABLE", async () => {
    const oversizedBuffer = Buffer.alloc(2 * 1024 * 1024 + 10, "%PDF-");

    jest.spyOn(global, "fetch").mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/pdf" }),
      arrayBuffer: async () => oversizedBuffer,
    }));

    try {
      await pdfService.generatePrescriptionPdf({
        prescriptionId: "p1",
        patientName: "P",
        doctorName: "D",
        issuedDate: "2026-10-29",
        items: validPrescriptionItems(),
      });
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(502);
      expect(err.code).toBe("PDF_SERVICE_UNAVAILABLE");
    }
  });
});

// ==============================================================================
// 3. POST /api/v1/prescriptions (Create Prescription)
// ==============================================================================
describe("POST /api/v1/prescriptions", () => {
  it("creates prescription successfully, stores PDF bytes, and notifies patient", async () => {
    const doctor = await createDoctorAndLogin();
    const patient = await createPatientAndLogin();
    const appointment = await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: "completed",
    });

    const res = await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({
        appointmentId: appointment._id.toString(),
        items: validPrescriptionItems(),
      });

    expect(res.status).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.prescription).toBeDefined();

    const p = res.body.prescription;
    expect(p.appointment).toBe(appointment._id.toString());
    expect(p.patient).toEqual({ id: patient.user.id, name: patient.user.name });
    expect(p.doctor).toEqual({ id: doctor.user.id, name: doctor.user.name });
    expect(p.issuedDate).toBe(new Date().toISOString().slice(0, 10));
    expect(p.items).toHaveLength(2);
    expect(p.pdfUrl).toBe(`/api/v1/prescriptions/${p.id}/pdf`);
    expect(p.pdfStatus).toBe("ready");

    // Verify stored in DB with pdfData
    const inDb = await Prescription.findById(p.id).select("+pdfData");
    expect(inDb).not.toBeNull();
    expect(inDb.pdfData).toBeDefined();

    // Verify patient notification
    const notifications = await Notification.find({
      recipient: patient.user.id,
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("prescription_created");
    expect(notifications[0].message).toContain(doctor.user.name);
    // Notification must NOT contain medicine names or dosages
    expect(notifications[0].message).not.toContain("Amoxicillin");
    expect(notifications[0].message).not.toContain("500mg");
  });

  it("preserves prescription with pdfStatus: pending if Django is unavailable (zero data loss)", async () => {
    const doctor = await createDoctorAndLogin();
    const patient = await createPatientAndLogin();
    const appointment = await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: "completed",
    });

    // Simulate Django being completely down
    jest
      .spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("Connection refused"));

    const res = await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({
        appointmentId: appointment._id.toString(),
        items: validPrescriptionItems(),
      });

    // Still returns 201 Created and preserves prescription
    expect(res.status).toBe(201);
    expect(res.body.prescription.pdfStatus).toBe("pending");

    const inDb = await Prescription.findById(res.body.prescription.id);
    expect(inDb).not.toBeNull();
    expect(inDb.pdfStatus).toBe("pending");
    expect(inDb.items).toHaveLength(2);
  });

  it("notification failure does not invalidate or roll back prescription creation", async () => {
    const doctor = await createDoctorAndLogin();
    const patient = await createPatientAndLogin();
    const appointment = await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: "completed",
    });

    // Mock Notification.create to throw
    jest
      .spyOn(Notification, "create")
      .mockRejectedValueOnce(new Error("Notification DB failure"));

    const res = await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({
        appointmentId: appointment._id.toString(),
        items: validPrescriptionItems(),
      });

    expect(res.status).toBe(201);
    expect(res.body.prescription).toBeDefined();

    const inDb = await Prescription.findById(res.body.prescription.id);
    expect(inDb).not.toBeNull();
  });

  it("rejects creation if caller is a patient (403 FORBIDDEN)", async () => {
    const doctor = await createDoctorAndLogin();
    const patient = await createPatientAndLogin();
    const appointment = await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: "completed",
    });

    const res = await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({
        appointmentId: appointment._id.toString(),
        items: validPrescriptionItems(),
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("rejects creation if caller is an admin (403 FORBIDDEN)", async () => {
    const doctor = await createDoctorAndLogin();
    const patient = await createPatientAndLogin();
    const admin = await createAdminAndLogin();
    const appointment = await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: "completed",
    });

    const res = await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        appointmentId: appointment._id.toString(),
        items: validPrescriptionItems(),
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("rejects creation if appointment does not exist (404 NOT_FOUND)", async () => {
    const doctor = await createDoctorAndLogin();
    const fakeAptId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({
        appointmentId: fakeAptId,
        items: validPrescriptionItems(),
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(res.body.message).toBe("Appointment not found");
  });

  it("rejects creation if doctor is not the appointment doctor (404 NOT_FOUND anti-enumeration)", async () => {
    const doctor1 = await createDoctorAndLogin();
    const doctor2 = await createDoctorAndLogin();
    const patient = await createPatientAndLogin();
    const appointment = await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor1.user.id,
      status: "completed",
    });

    // Doctor 2 attempts to prescribe for Doctor 1's appointment
    const res = await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor2.token}`)
      .send({
        appointmentId: appointment._id.toString(),
        items: validPrescriptionItems(),
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(res.body.message).toBe("Appointment not found");
  });

  it("rejects creation if appointment status is requested, confirmed, or cancelled (400 VALIDATION_ERROR)", async () => {
    const doctor = await createDoctorAndLogin();
    const patient = await createPatientAndLogin();

    for (const status of ["requested", "confirmed", "cancelled"]) {
      const apt = await createAppointmentDirect({
        patientId: patient.user.id,
        doctorId: doctor.user.id,
        status,
      });

      const res = await request(app)
        .post("/api/v1/prescriptions")
        .set("Authorization", `Bearer ${doctor.token}`)
        .send({
          appointmentId: apt._id.toString(),
          items: validPrescriptionItems(),
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(res.body.message).toContain("completed");
    }
  });

  it("enforces one prescription per appointment: second request returns 409 PRESCRIPTION_EXISTS", async () => {
    const doctor = await createDoctorAndLogin();
    const patient = await createPatientAndLogin();
    const appointment = await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: "completed",
    });

    // First creation
    const res1 = await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({
        appointmentId: appointment._id.toString(),
        items: validPrescriptionItems(),
      });
    expect(res1.status).toBe(201);

    // Second creation for same appointment
    const res2 = await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({
        appointmentId: appointment._id.toString(),
        items: validPrescriptionItems(),
      });
    expect(res2.status).toBe(409);
    expect(res2.body.code).toBe("PRESCRIPTION_EXISTS");
  });

  it("rejects forbidden or unexpected fields in body (e.g. client injecting patient/doctor names)", async () => {
    const doctor = await createDoctorAndLogin();
    const patient = await createPatientAndLogin();
    const appointment = await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: "completed",
    });

    const res = await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({
        appointmentId: appointment._id.toString(),
        patientName: "Injected Name",
        items: validPrescriptionItems(),
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.message).toContain("patientName");
  });

  it("validates item fields: blanks, excessive length, and unexpected keys", async () => {
    const doctor = await createDoctorAndLogin();
    const patient = await createPatientAndLogin();
    const appointment = await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: "completed",
    });

    // Blank medicine
    let res = await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({
        appointmentId: appointment._id.toString(),
        items: [{ medicine: "   ", dosage: "500mg", instructions: "daily" }],
      });
    expect(res.status).toBe(400);

    // Excessive instructions (> 500 chars)
    res = await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({
        appointmentId: appointment._id.toString(),
        items: [
          { medicine: "Amox", dosage: "500mg", instructions: "x".repeat(501) },
        ],
      });
    expect(res.status).toBe(400);

    // Unexpected key in item
    res = await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({
        appointmentId: appointment._id.toString(),
        items: [
          {
            medicine: "Amox",
            dosage: "500mg",
            instructions: "daily",
            extraPrice: 100,
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("extraPrice");
  });
});

// ==============================================================================
// 4. GET /api/v1/prescriptions (List Prescriptions)
// ==============================================================================
describe("GET /api/v1/prescriptions", () => {
  it("allows patient to list only their own prescriptions with pagination and no-store header", async () => {
    const doctor = await createDoctorAndLogin();
    const patient1 = await createPatientAndLogin();
    const patient2 = await createPatientAndLogin();

    const apt1 = await createAppointmentDirect({
      patientId: patient1.user.id,
      doctorId: doctor.user.id,
      status: "completed",
    });
    const apt2 = await createAppointmentDirect({
      patientId: patient2.user.id,
      doctorId: doctor.user.id,
      status: "completed",
    });

    // Create prescription for patient 1 and patient 2
    await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({
        appointmentId: apt1._id.toString(),
        items: validPrescriptionItems(),
      });

    await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({
        appointmentId: apt2._id.toString(),
        items: validPrescriptionItems(),
      });

    // Patient 1 lists prescriptions
    const res = await request(app)
      .get("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${patient1.token}`);

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.prescriptions).toHaveLength(1);
    expect(res.body.prescriptions[0].patient.id).toBe(patient1.user.id);
    expect(res.body.pagination.total).toBe(1);

    // Verify sensitive PII is absent
    const p = res.body.prescriptions[0];
    expect(p.patient.email).toBeUndefined();
    expect(p.patient.phone).toBeUndefined();
    expect(p.patient.passwordHash).toBeUndefined();
    expect(p.pdfData).toBeUndefined();
  });

  it("allows doctor to list only the prescriptions they issued", async () => {
    const doctor1 = await createDoctorAndLogin();
    const doctor2 = await createDoctorAndLogin();
    const patient = await createPatientAndLogin();

    const apt1 = await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor1.user.id,
      status: "completed",
    });
    const apt2 = await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor2.user.id,
      status: "completed",
    });

    await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor1.token}`)
      .send({
        appointmentId: apt1._id.toString(),
        items: validPrescriptionItems(),
      });

    await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor2.token}`)
      .send({
        appointmentId: apt2._id.toString(),
        items: validPrescriptionItems(),
      });

    // Doctor 1 lists
    const res = await request(app)
      .get("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor1.token}`);

    expect(res.status).toBe(200);
    expect(res.body.prescriptions).toHaveLength(1);
    expect(res.body.prescriptions[0].doctor.id).toBe(doctor1.user.id);
  });

  it("supports ?appointmentId= filter for doctor UI lookup (total: 1 if exists, 0 if not)", async () => {
    const doctor = await createDoctorAndLogin();
    const patient = await createPatientAndLogin();
    const aptWithPresc = await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: "completed",
    });
    const aptWithoutPresc = await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: "completed",
    });

    await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({
        appointmentId: aptWithPresc._id.toString(),
        items: validPrescriptionItems(),
      });

    // Lookup appointment with prescription
    const res1 = await request(app)
      .get(`/api/v1/prescriptions?appointmentId=${aptWithPresc._id.toString()}`)
      .set("Authorization", `Bearer ${doctor.token}`);

    expect(res1.status).toBe(200);
    expect(res1.body.pagination.total).toBe(1);
    expect(res1.body.prescriptions).toHaveLength(1);

    // Lookup appointment without prescription
    const res2 = await request(app)
      .get(
        `/api/v1/prescriptions?appointmentId=${aptWithoutPresc._id.toString()}`,
      )
      .set("Authorization", `Bearer ${doctor.token}`);

    expect(res2.status).toBe(200);
    expect(res2.body.pagination.total).toBe(0);
    expect(res2.body.prescriptions).toHaveLength(0);
  });

  it("rejects unknown query parameter with 400 VALIDATION_ERROR", async () => {
    const doctor = await createDoctorAndLogin();

    const res = await request(app)
      .get("/api/v1/prescriptions?maliciousKey=123")
      .set("Authorization", `Bearer ${doctor.token}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects admin on GET /prescriptions (403 FORBIDDEN)", async () => {
    const admin = await createAdminAndLogin();

    const res = await request(app)
      .get("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${admin.token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });
});

// ==============================================================================
// 5. GET /api/v1/prescriptions/:id/pdf (Download PDF)
// ==============================================================================
describe("GET /api/v1/prescriptions/:id/pdf", () => {
  it("allows patient and issuing doctor to stream raw PDF with safe headers", async () => {
    const doctor = await createDoctorAndLogin();
    const patient = await createPatientAndLogin();
    const appointment = await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: "completed",
    });

    const createRes = await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({
        appointmentId: appointment._id.toString(),
        items: validPrescriptionItems(),
      });
    const prescId = createRes.body.prescription.id;

    // Patient downloads
    const patRes = await request(app)
      .get(`/api/v1/prescriptions/${prescId}/pdf`)
      .set("Authorization", `Bearer ${patient.token}`);

    expect(patRes.status).toBe(200);
    expect(patRes.headers["content-type"]).toBe("application/pdf");
    expect(patRes.headers["content-disposition"]).toContain(
      `filename="prescription_${prescId}.pdf"`,
    );
    expect(patRes.headers["cache-control"]).toBe("no-store");
    expect(patRes.headers["x-content-type-options"]).toBe("nosniff");
    expect(patRes.body.subarray(0, 5).toString("ascii")).toBe("%PDF-");

    // Doctor downloads
    const docRes = await request(app)
      .get(`/api/v1/prescriptions/${prescId}/pdf`)
      .set("Authorization", `Bearer ${doctor.token}`);

    expect(docRes.status).toBe(200);
    expect(docRes.headers["content-type"]).toBe("application/pdf");
  });

  it("re-generates and caches PDF on demand if pdfData was missing during creation", async () => {
    const doctor = await createDoctorAndLogin();
    const patient = await createPatientAndLogin();
    const appointment = await createAppointmentDirect({
      patientId: patient.user.id,
      doctorId: doctor.user.id,
      status: "completed",
    });

    // Create prescription with Django initially down
    jest
      .spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("Network drop"));
    const createRes = await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({
        appointmentId: appointment._id.toString(),
        items: validPrescriptionItems(),
      });
    const prescId = createRes.body.prescription.id;

    // Now Django is recovered
    jest.spyOn(global, "fetch").mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/pdf" }),
      arrayBuffer: async () => MOCK_PDF_BYTES,
    }));

    // Download PDF triggers on-demand generation and caches in MongoDB
    const dlRes = await request(app)
      .get(`/api/v1/prescriptions/${prescId}/pdf`)
      .set("Authorization", `Bearer ${patient.token}`);

    expect(dlRes.status).toBe(200);
    expect(dlRes.headers["content-type"]).toBe("application/pdf");

    // Check DB document is now cached with 'ready'
    const cached = await Prescription.findById(prescId).select("+pdfData");
    expect(cached.pdfStatus).toBe("ready");
    expect(cached.pdfData).toBeDefined();
  });

  it("anti-enumeration: returns 404 NOT_FOUND for non-existent prescription or unowned prescription", async () => {
    const doctor = await createDoctorAndLogin();
    const patient1 = await createPatientAndLogin();
    const patient2 = await createPatientAndLogin();

    const appointment = await createAppointmentDirect({
      patientId: patient1.user.id,
      doctorId: doctor.user.id,
      status: "completed",
    });

    const createRes = await request(app)
      .post("/api/v1/prescriptions")
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({
        appointmentId: appointment._id.toString(),
        items: validPrescriptionItems(),
      });
    const prescId = createRes.body.prescription.id;

    // Unowned: Patient 2 tries to access Patient 1's prescription PDF
    const unownedRes = await request(app)
      .get(`/api/v1/prescriptions/${prescId}/pdf`)
      .set("Authorization", `Bearer ${patient2.token}`);

    expect(unownedRes.status).toBe(404);
    expect(unownedRes.body.code).toBe("NOT_FOUND");
    expect(unownedRes.body.message).toBe("Prescription not found");

    // Non-existent ID
    const fakeId = new mongoose.Types.ObjectId().toString();
    const notFoundRes = await request(app)
      .get(`/api/v1/prescriptions/${fakeId}/pdf`)
      .set("Authorization", `Bearer ${patient1.token}`);

    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body.code).toBe("NOT_FOUND");
    expect(notFoundRes.body.message).toBe("Prescription not found");
  });

  it("rejects invalid ObjectId with 400 VALIDATION_ERROR", async () => {
    const patient = await createPatientAndLogin();

    const res = await request(app)
      .get("/api/v1/prescriptions/not-a-valid-id/pdf")
      .set("Authorization", `Bearer ${patient.token}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects admin on GET /prescriptions/:id/pdf (403 FORBIDDEN)", async () => {
    const admin = await createAdminAndLogin();
    const fakeId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .get(`/api/v1/prescriptions/${fakeId}/pdf`)
      .set("Authorization", `Bearer ${admin.token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });
});
