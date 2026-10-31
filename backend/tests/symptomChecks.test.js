// backend/tests/symptomChecks.test.js
// Comprehensive test suite for FR-17: AI Symptom Checker API & Storage (UC-12)
// Covers:
// - Dedicated Django client: success, timeout, network failure, non-success status,
//   malformed JSON, missing fields, invalid urgency, invalid specialisation, missing disclaimer,
//   oversized payload rejection (> 64 KiB).
// - Express API POST /api/v1/symptom-checks: 201 Created, snake_case-to-camelCase mapping,
//   strict input validation, patient identity enforcement, zero record on Django failure,
//   disclaimer preservation, Cache-Control: no-store, no PII leakage.
// - Express API GET /api/v1/symptom-checks: patient-scoped history, newest-first ordering,
//   pagination metadata, query parameter validation, Cache-Control: no-store.
// - Access Control: 401 unauthenticated, 403 doctor, 403 admin.
// - Rate limiting: per authenticated patient key (not IP), 429 TOO_MANY_REQUESTS.

process.env.JWT_SECRET = "test-secret-for-symptom-checker-tests";
process.env.JWT_EXPIRES_IN = "1d";
process.env.AI_SERVICE_URL = "http://localhost:8000";
process.env.AI_SERVICE_KEY = "test-ai-service-key";

// Disable rate limiters on app routes during integration tests
jest.mock("../src/middleware/rateLimiters", () => {
  const actual = jest.requireActual("../src/middleware/rateLimiters");
  return {
    ...actual,
    createLoginLimiter: () => (req, res, next) => next(),
    createSymptomCheckLimiter: () => (req, res, next) => next(),
  };
});

const request = require("supertest");
const express = require("express");
const bcrypt = require("bcryptjs");
const app = require("../src/app");
const { User, Patient, Doctor, Admin } = require("../src/models/User");
const SymptomCheckResult = require("../src/models/SymptomCheckResult");
const symptomCheckService = require("../src/services/symptomCheckService");
const { createSymptomCheckLimiter } = jest.requireActual(
  "../src/middleware/rateLimiters",
);
const errorHandler = require("../src/middleware/errorHandler");
const { connectTestDB, clearTestDB, closeTestDB } = require("./helpers/db");

jest.setTimeout(30000);

const VALID_DJANGO_RESPONSE = {
  assessment:
    "Your reported symptoms are commonly associated with upper respiratory tract infections.",
  possible_conditions: ["Common Cold", "Viral Pharyngitis"],
  urgency_level: "routine",
  suggested_specialisation: "General Physician",
  general_advice: [
    "Get adequate rest and stay hydrated.",
    "Monitor temperature regularly.",
  ],
  disclaimer: symptomCheckService.MANDATORY_DISCLAIMER,
};

beforeAll(async () => {
  await connectTestDB();
  await User.init();
  await SymptomCheckResult.init();
});

beforeEach(async () => {
  await clearTestDB();
  jest.restoreAllMocks();

  // Default global fetch mock for Django symptom checker
  jest.spyOn(global, "fetch").mockImplementation(async (url, options) => {
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify(VALID_DJANGO_RESPONSE),
      body: {
        getReader() {
          const encoder = new TextEncoder();
          const bytes = encoder.encode(JSON.stringify(VALID_DJANGO_RESPONSE));
          let read = false;
          return {
            async read() {
              if (read) return { done: true, value: undefined };
              read = true;
              return { done: false, value: bytes };
            },
            async cancel() {},
          };
        },
      },
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
    name: `Dr. Smith ${userSeq}`,
    email: `doctor_${userSeq}_${Date.now()}@example.com`,
    phone: `+9154321${String(userSeq).padStart(5, "0")}`,
    password: PASSWORD,
    specialisations: ["General Physician"],
    qualification: "MBBS, MD",
    ...overrides,
  };
}

function adminData(overrides = {}) {
  userSeq += 1;
  return {
    role: "admin",
    name: `Admin ${userSeq}`,
    email: `admin_${userSeq}_${Date.now()}@example.com`,
    phone: `+9199999${String(userSeq).padStart(5, "0")}`,
    password: PASSWORD,
    ...overrides,
  };
}

async function createPatientAndLogin(overrides = {}) {
  const data = patientData(overrides);
  const passwordHash = await bcrypt.hash(data.password, 10);
  const patient = await Patient.create({ ...data, passwordHash });

  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: data.email, password: data.password });

  return { user: patient, token: res.body.token, rawData: data };
}

async function createDoctorAndLogin(overrides = {}) {
  const data = doctorData(overrides);
  const passwordHash = await bcrypt.hash(data.password, 10);
  const doctor = await Doctor.create({ ...data, passwordHash });

  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: data.email, password: data.password });

  return { user: doctor, token: res.body.token, rawData: data };
}

async function createAdminAndLogin(overrides = {}) {
  const data = adminData(overrides);
  const passwordHash = await bcrypt.hash(data.password, 10);
  const admin = await Admin.create({ ...data, passwordHash });

  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: data.email, password: data.password });

  return { user: admin, token: res.body.token, rawData: data };
}

// ==============================================================================
// 1. Django Client Unit Tests (symptomCheckService.js)
// ==============================================================================
describe("Django Symptom Checker Client (symptomCheckService)", () => {
  it("1. sends request to Django with X-Service-Key and symptoms only, returning camelCase assessment", async () => {
    let capturedUrl = "";
    let capturedOptions = {};

    jest.spyOn(global, "fetch").mockImplementation(async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify(VALID_DJANGO_RESPONSE),
        body: {
          getReader() {
            let read = false;
            return {
              async read() {
                if (read) return { done: true, value: undefined };
                read = true;
                return {
                  done: false,
                  value: new TextEncoder().encode(
                    JSON.stringify(VALID_DJANGO_RESPONSE),
                  ),
                };
              },
              async cancel() {},
            };
          },
        },
      };
    });

    const result = await symptomCheckService.callDjangoSymptomChecker([
      "fever",
      "cough",
    ]);

    expect(capturedUrl).toBe("http://localhost:8000/api/symptom-checker/check");
    expect(capturedOptions.method).toBe("POST");
    expect(capturedOptions.headers["X-Service-Key"]).toBe(
      "test-ai-service-key",
    );
    expect(capturedOptions.headers["Content-Type"]).toBe("application/json");

    const sentBody = JSON.parse(capturedOptions.body);
    expect(Object.keys(sentBody)).toEqual(["symptoms"]);
    expect(sentBody.symptoms).toEqual(["fever", "cough"]);

    // Verify mapped camelCase fields
    expect(result.assessment).toBe(VALID_DJANGO_RESPONSE.assessment);
    expect(result.possibleConditions).toEqual(
      VALID_DJANGO_RESPONSE.possible_conditions,
    );
    expect(result.urgencyLevel).toBe("routine");
    expect(result.suggestedSpecialisation).toBe("General Physician");
    expect(result.generalAdvice).toEqual(VALID_DJANGO_RESPONSE.general_advice);
    expect(result.disclaimer).toBe(symptomCheckService.MANDATORY_DISCLAIMER);
  });

  it("2. maps request timeout to 502 SYMPTOM_SERVICE_UNAVAILABLE", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    });

    try {
      await symptomCheckService.callDjangoSymptomChecker(["headache"]);
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(502);
      expect(err.code).toBe("SYMPTOM_SERVICE_UNAVAILABLE");
    }
  });

  it("3. maps network disconnect / rejection to 502 SYMPTOM_SERVICE_UNAVAILABLE", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8000");
    });

    try {
      await symptomCheckService.callDjangoSymptomChecker(["fever"]);
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(502);
      expect(err.code).toBe("SYMPTOM_SERVICE_UNAVAILABLE");
    }
  });

  it("4. maps non-success Django responses (400, 403, 500) to 502 SYMPTOM_SERVICE_UNAVAILABLE", async () => {
    for (const status of [400, 403, 500]) {
      jest.spyOn(global, "fetch").mockImplementation(async () => ({
        ok: false,
        status,
        headers: new Headers({ "content-type": "application/json" }),
      }));

      try {
        await symptomCheckService.callDjangoSymptomChecker(["cough"]);
        throw new Error("Should have thrown");
      } catch (err) {
        expect(err.status).toBe(502);
        expect(err.code).toBe("SYMPTOM_SERVICE_UNAVAILABLE");
      }
    }
  });

  it("5. maps malformed JSON or HTML error response to 502 SYMPTOM_SERVICE_UNAVAILABLE", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => "<html>500 Server Error</html>",
      body: {
        getReader() {
          let read = false;
          return {
            async read() {
              if (read) return { done: true, value: undefined };
              read = true;
              return {
                done: false,
                value: new TextEncoder().encode("<html>500 Server Error</html>"),
              };
            },
            async cancel() {},
          };
        },
      },
    }));

    try {
      await symptomCheckService.callDjangoSymptomChecker(["fever"]);
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(502);
      expect(err.code).toBe("SYMPTOM_SERVICE_UNAVAILABLE");
    }
  });

  it("6. maps missing required fields in Django response to 502 SYMPTOM_SERVICE_UNAVAILABLE", async () => {
    const incomplete = { ...VALID_DJANGO_RESPONSE };
    delete incomplete.assessment;

    jest.spyOn(global, "fetch").mockImplementation(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify(incomplete),
      body: {
        getReader() {
          let read = false;
          return {
            async read() {
              if (read) return { done: true, value: undefined };
              read = true;
              return {
                done: false,
                value: new TextEncoder().encode(JSON.stringify(incomplete)),
              };
            },
            async cancel() {},
          };
        },
      },
    }));

    try {
      await symptomCheckService.callDjangoSymptomChecker(["cough"]);
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(502);
      expect(err.code).toBe("SYMPTOM_SERVICE_UNAVAILABLE");
    }
  });

  it("7. maps invalid urgency_level value to 502 SYMPTOM_SERVICE_UNAVAILABLE", async () => {
    const invalidUrgency = {
      ...VALID_DJANGO_RESPONSE,
      urgency_level: "extreme_critical",
    };

    jest.spyOn(global, "fetch").mockImplementation(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify(invalidUrgency),
      body: {
        getReader() {
          let read = false;
          return {
            async read() {
              if (read) return { done: true, value: undefined };
              read = true;
              return {
                done: false,
                value: new TextEncoder().encode(JSON.stringify(invalidUrgency)),
              };
            },
            async cancel() {},
          };
        },
      },
    }));

    try {
      await symptomCheckService.callDjangoSymptomChecker(["cough"]);
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(502);
      expect(err.code).toBe("SYMPTOM_SERVICE_UNAVAILABLE");
    }
  });

  it("8. maps invalid suggested_specialisation to 502 SYMPTOM_SERVICE_UNAVAILABLE", async () => {
    const invalidSpec = {
      ...VALID_DJANGO_RESPONSE,
      suggested_specialisation: "Unregistered Specialisation",
    };

    jest.spyOn(global, "fetch").mockImplementation(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify(invalidSpec),
      body: {
        getReader() {
          let read = false;
          return {
            async read() {
              if (read) return { done: true, value: undefined };
              read = true;
              return {
                done: false,
                value: new TextEncoder().encode(JSON.stringify(invalidSpec)),
              };
            },
            async cancel() {},
          };
        },
      },
    }));

    try {
      await symptomCheckService.callDjangoSymptomChecker(["cough"]);
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(502);
      expect(err.code).toBe("SYMPTOM_SERVICE_UNAVAILABLE");
    }
  });

  it("9. maps missing or empty disclaimer to 502 SYMPTOM_SERVICE_UNAVAILABLE", async () => {
    const emptyDisclaimer = {
      ...VALID_DJANGO_RESPONSE,
      disclaimer: "   ",
    };

    jest.spyOn(global, "fetch").mockImplementation(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify(emptyDisclaimer),
      body: {
        getReader() {
          let read = false;
          return {
            async read() {
              if (read) return { done: true, value: undefined };
              read = true;
              return {
                done: false,
                value: new TextEncoder().encode(
                  JSON.stringify(emptyDisclaimer),
                ),
              };
            },
            async cancel() {},
          };
        },
      },
    }));

    try {
      await symptomCheckService.callDjangoSymptomChecker(["cough"]);
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(502);
      expect(err.code).toBe("SYMPTOM_SERVICE_UNAVAILABLE");
    }
  });

  it("10. rejects oversized response while streaming (> 64 KiB) with 502 SYMPTOM_SERVICE_UNAVAILABLE", async () => {
    let cancelled = false;
    const largeChunk = new Uint8Array(40000); // 40 KB chunk

    jest.spyOn(global, "fetch").mockImplementation(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      body: {
        getReader() {
          let chunkCount = 0;
          return {
            async read() {
              chunkCount += 1;
              if (chunkCount <= 2) {
                // 2 x 40 KB = 80 KB > 64 KB cap
                return { done: false, value: largeChunk };
              }
              return { done: true, value: undefined };
            },
            async cancel() {
              cancelled = true;
            },
          };
        },
      },
    }));

    try {
      await symptomCheckService.callDjangoSymptomChecker(["fever"]);
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(502);
      expect(err.code).toBe("SYMPTOM_SERVICE_UNAVAILABLE");
      expect(cancelled).toBe(true);
    }
  });
});

// ==============================================================================
// 2. Express API POST /api/v1/symptom-checks
// ==============================================================================
describe("POST /api/v1/symptom-checks", () => {
  it("11 & 22. allows authenticated patient to submit symptoms and receive HTTP 201 with full response", async () => {
    const patient = await createPatientAndLogin();

    const res = await request(app)
      .post("/api/v1/symptom-checks")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ symptoms: ["fever", "dry cough", "fatigue"] });

    expect(res.status).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");

    expect(res.body).toHaveProperty("result");
    const { result } = res.body;

    expect(typeof result.id).toBe("string");
    expect(result.symptoms).toEqual(["fever", "dry cough", "fatigue"]);
    expect(result.assessment).toEqual({
      assessment: VALID_DJANGO_RESPONSE.assessment,
      possibleConditions: VALID_DJANGO_RESPONSE.possible_conditions,
      urgencyLevel: "routine",
      suggestedSpecialisation: "General Physician",
      generalAdvice: VALID_DJANGO_RESPONSE.general_advice,
      disclaimer: symptomCheckService.MANDATORY_DISCLAIMER,
    });
    expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt);

    // 18. Mandatory disclaimer present in MongoDB record
    const saved = await SymptomCheckResult.findById(result.id);
    expect(saved).not.toBeNull();
    expect(saved.patient.toString()).toBe(patient.user._id.toString());
    expect(saved.symptomsInput).toEqual(["fever", "dry cough", "fatigue"]);
    expect(saved.aiAssessment.disclaimer).toBe(
      symptomCheckService.MANDATORY_DISCLAIMER,
    );
  });

  it("12. rejects unauthenticated requests with 401 UNAUTHORIZED", async () => {
    const res = await request(app)
      .post("/api/v1/symptom-checks")
      .send({ symptoms: ["fever"] });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("13. rejects non-patient roles (doctor, admin) with 403 FORBIDDEN", async () => {
    const doctor = await createDoctorAndLogin();
    const admin = await createAdminAndLogin();

    const docRes = await request(app)
      .post("/api/v1/symptom-checks")
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({ symptoms: ["fever"] });

    expect(docRes.status).toBe(403);
    expect(docRes.body.code).toBe("FORBIDDEN");

    const adminRes = await request(app)
      .post("/api/v1/symptom-checks")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ symptoms: ["fever"] });

    expect(adminRes.status).toBe(403);
    expect(adminRes.body.code).toBe("FORBIDDEN");
  });

  it("14. enforces patient identity from JWT and rejects patient injection in body", async () => {
    const patient = await createPatientAndLogin();

    const res = await request(app)
      .post("/api/v1/symptom-checks")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({
        symptoms: ["fever"],
        patient: "672400000000000000000001",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.message).toMatch(/Unknown or forbidden field/i);
  });

  it("15 & 16. maps snake_case to camelCase and persists only validated assessment fields", async () => {
    const patient = await createPatientAndLogin();

    const extendedDjangoResponse = {
      ...VALID_DJANGO_RESPONSE,
      internal_trace_id: "django-debug-12345",
      tokens_used: 42,
    };

    jest.spyOn(global, "fetch").mockImplementation(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify(extendedDjangoResponse),
      body: {
        getReader() {
          let read = false;
          return {
            async read() {
              if (read) return { done: true, value: undefined };
              read = true;
              return {
                done: false,
                value: new TextEncoder().encode(
                  JSON.stringify(extendedDjangoResponse),
                ),
              };
            },
            async cancel() {},
          };
        },
      },
    }));

    const res = await request(app)
      .post("/api/v1/symptom-checks")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ symptoms: ["sore throat"] });

    expect(res.status).toBe(201);
    expect(res.body.result.assessment).toHaveProperty("possibleConditions");
    expect(res.body.result.assessment).toHaveProperty("urgencyLevel");
    expect(res.body.result.assessment).toHaveProperty(
      "suggestedSpecialisation",
    );
    expect(res.body.result.assessment).toHaveProperty("generalAdvice");
    expect(res.body.result.assessment).not.toHaveProperty("internal_trace_id");
    expect(res.body.result.assessment).not.toHaveProperty("tokens_used");

    const saved = await SymptomCheckResult.findById(res.body.result.id).lean();
    expect(saved.aiAssessment.internal_trace_id).toBeUndefined();
    expect(saved.aiAssessment.tokens_used).toBeUndefined();
  });

  it("17. creates NO database record when Django service fails", async () => {
    const patient = await createPatientAndLogin();

    jest.spyOn(global, "fetch").mockImplementation(async () => {
      throw new Error("Django service is unreachable");
    });

    const res = await request(app)
      .post("/api/v1/symptom-checks")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ symptoms: ["chest pain"] });

    expect(res.status).toBe(502);
    expect(res.body.code).toBe("SYMPTOM_SERVICE_UNAVAILABLE");

    const count = await SymptomCheckResult.countDocuments();
    expect(count).toBe(0);
  });

  it("validates input: rejects empty array, > 10 items, blank string, and non-string types", async () => {
    const patient = await createPatientAndLogin();

    // Empty array
    let res = await request(app)
      .post("/api/v1/symptom-checks")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ symptoms: [] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");

    // Over 10 symptoms
    res = await request(app)
      .post("/api/v1/symptom-checks")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({
        symptoms: [
          "s1",
          "s2",
          "s3",
          "s4",
          "s5",
          "s6",
          "s7",
          "s8",
          "s9",
          "s10",
          "s11",
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");

    // Blank string
    res = await request(app)
      .post("/api/v1/symptom-checks")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ symptoms: ["   "] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");

    // Non-string item (object injection)
    res = await request(app)
      .post("/api/v1/symptom-checks")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ symptoms: [{ $ne: null }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("never leaks patient PII (email, phone, address, passwordHash) in the response", async () => {
    const patient = await createPatientAndLogin();

    const res = await request(app)
      .post("/api/v1/symptom-checks")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ symptoms: ["mild cough"] });

    expect(res.status).toBe(201);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain(patient.rawData.email);
    expect(bodyStr).not.toContain(patient.rawData.phone);
    expect(bodyStr).not.toContain(patient.rawData.address);
    expect(bodyStr).not.toContain("passwordHash");
  });
});

// ==============================================================================
// 3. Express API GET /api/v1/symptom-checks (Patient History)
// ==============================================================================
describe("GET /api/v1/symptom-checks", () => {
  it("allows patient to list only their own past results, newest first, with pagination", async () => {
    const patient1 = await createPatientAndLogin();
    const patient2 = await createPatientAndLogin();

    // Create 2 results for patient 1 with 10ms gap for deterministic sorting
    await SymptomCheckResult.create({
      patient: patient1.user._id,
      symptomsInput: ["fever"],
      aiAssessment: {
        assessment: "Older check",
        possibleConditions: ["Cold"],
        urgencyLevel: "routine",
        suggestedSpecialisation: "General Physician",
        generalAdvice: ["Rest"],
        disclaimer: symptomCheckService.MANDATORY_DISCLAIMER,
      },
      checkedAt: new Date(Date.now() - 5000),
    });

    await SymptomCheckResult.create({
      patient: patient1.user._id,
      symptomsInput: ["headache", "dizziness"],
      aiAssessment: {
        assessment: "Newer check",
        possibleConditions: ["Migraine"],
        urgencyLevel: "urgent",
        suggestedSpecialisation: "Neurology",
        generalAdvice: ["Hydrate"],
        disclaimer: symptomCheckService.MANDATORY_DISCLAIMER,
      },
      checkedAt: new Date(),
    });

    // Create 1 result for patient 2
    await SymptomCheckResult.create({
      patient: patient2.user._id,
      symptomsInput: ["rash"],
      aiAssessment: {
        assessment: "Patient 2 check",
        possibleConditions: ["Dermatitis"],
        urgencyLevel: "routine",
        suggestedSpecialisation: "Dermatology",
        generalAdvice: ["Moisturize"],
        disclaimer: symptomCheckService.MANDATORY_DISCLAIMER,
      },
      checkedAt: new Date(),
    });

    // Patient 1 lists results
    const res = await request(app)
      .get("/api/v1/symptom-checks?page=1&limit=10")
      .set("Authorization", `Bearer ${patient1.token}`);

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.results.length).toBe(2);
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
    });

    // Newest first check
    expect(res.body.results[0].assessment.assessment).toBe("Newer check");
    expect(res.body.results[1].assessment.assessment).toBe("Older check");

    // Verify patient 1 does NOT see patient 2's data
    const allAssessments = res.body.results.map((r) => r.assessment.assessment);
    expect(allAssessments).not.toContain("Patient 2 check");
  });

  it("rejects invalid query parameters with 400 VALIDATION_ERROR", async () => {
    const patient = await createPatientAndLogin();

    const res = await request(app)
      .get("/api/v1/symptom-checks?unknownKey=123")
      .set("Authorization", `Bearer ${patient.token}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects doctor and admin access to GET /api/v1/symptom-checks with 403 FORBIDDEN", async () => {
    const doctor = await createDoctorAndLogin();
    const admin = await createAdminAndLogin();

    const docRes = await request(app)
      .get("/api/v1/symptom-checks")
      .set("Authorization", `Bearer ${doctor.token}`);
    expect(docRes.status).toBe(403);
    expect(docRes.body.code).toBe("FORBIDDEN");

    const adminRes = await request(app)
      .get("/api/v1/symptom-checks")
      .set("Authorization", `Bearer ${admin.token}`);
    expect(adminRes.status).toBe(403);
    expect(adminRes.body.code).toBe("FORBIDDEN");
  });
});

// ==============================================================================
// 4. Rate Limiter Middleware Tests
// ==============================================================================
describe("Symptom Check Rate Limiter", () => {
  it("19 & 20. enforces rate limit per authenticated patient ID (not shared IP) and returns 429 TOO_MANY_REQUESTS", async () => {
    const limiter = createSymptomCheckLimiter({ limit: 2, windowMs: 60000 });

    const callLimiter = (userId) =>
      new Promise((resolve) => {
        const req = {
          user: { id: userId, role: "patient" },
          headers: {},
        };
        const res = {
          setHeader: jest.fn(),
          getHeader: jest.fn(),
          append: jest.fn(),
        };
        limiter(req, res, (err) => resolve(err));
      });

    // Patient 1: 2 requests pass
    const err1 = await callLimiter("patient-1");
    expect(err1).toBeUndefined();

    const err2 = await callLimiter("patient-1");
    expect(err2).toBeUndefined();

    // Patient 1: 3rd request blocked with 429 TOO_MANY_REQUESTS
    const err3 = await callLimiter("patient-1");
    expect(err3).toBeDefined();
    expect(err3.status).toBe(429);
    expect(err3.code).toBe("TOO_MANY_REQUESTS");
    expect(err3.message).toBe(
      "Too many symptom check requests. Please try again later.",
    );

    // Patient 2 (different patient): not blocked
    const errPatient2 = await callLimiter("patient-2");
    expect(errPatient2).toBeUndefined();
  });
});
