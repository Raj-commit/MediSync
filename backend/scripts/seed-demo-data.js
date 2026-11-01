// backend/scripts/seed-demo-data.js
// Idempotent demo data seeder for local development and testing.
// Requires SEED_DEMO_DATA=true and refuses to run in production or against non-local databases.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { User, Patient, Doctor } = require('../src/models/User');
const Slot = require('../src/models/Slot');
const Appointment = require('../src/models/Appointment');
const MedicalRecord = require('../src/models/MedicalRecord');
const Prescription = require('../src/models/Prescription');

const BCRYPT_ROUNDS = 10;
const DEMO_PASSWORD = 'DemoPassword123!';

async function seedDemoData() {
  // 1. Safety Guard: Production Check
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data in production (NODE_ENV=production).');
  }

  // 2. Safety Guard: Explicit Opt-In
  if (process.env.SEED_DEMO_DATA !== 'true') {
    throw new Error(
      'Demo data seeding requires explicit opt-in. Set SEED_DEMO_DATA=true in your environment.'
    );
  }

  // 3. Safety Guard: Local Database Verification
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/medisync';
  const isLocal =
    uri.includes('127.0.0.1') ||
    uri.includes('localhost') ||
    uri.includes('medisync_test');

  if (!isLocal) {
    throw new Error(
      `Refusing to seed demo data on a non-local or remote database: ${uri}`
    );
  }

  await mongoose.connect(uri);
  console.log(`Connected to local MongoDB at: ${uri}`);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  // 4. Synthetic Doctors (2 doctors)
  const doctorsData = [
    {
      role: 'doctor',
      name: 'Dr. Asha Patel',
      email: 'dr.asha.patel@example.com',
      phone: '+919820011111',
      specialisations: ['General Medicine', 'Cardiology'],
      qualification: 'MBBS, MD (Medicine)',
      isActive: true,
    },
    {
      role: 'doctor',
      name: 'Dr. Vikram Rao',
      email: 'dr.vikram.rao@example.com',
      phone: '+919820022222',
      specialisations: ['Dermatology'],
      qualification: 'MBBS, DVD',
      isActive: true,
    },
  ];

  const doctors = [];
  for (const docData of doctorsData) {
    let doc = await User.findOne({ email: docData.email });
    if (!doc) {
      doc = await Doctor.create({ ...docData, passwordHash });
      console.log(`Created doctor: ${doc.name} (${doc.email})`);
    } else {
      console.log(`Existing doctor found: ${doc.name} (${doc.email})`);
    }
    doctors.push(doc);
  }

  // 5. Synthetic Patients (2 patients)
  const patientsData = [
    {
      role: 'patient',
      name: 'Aarav Sharma',
      email: 'aarav.sharma@example.com',
      phone: '+919820033333',
      dateOfBirth: new Date('1990-05-15'),
      address: '42 Marine Drive, Nariman Point, Mumbai',
      isActive: true,
    },
    {
      role: 'patient',
      name: 'Diya Mehta',
      email: 'diya.mehta@example.com',
      phone: '+919820044444',
      dateOfBirth: new Date('1998-11-20'),
      address: '15 Linking Road, Bandra West, Mumbai',
      isActive: true,
    },
  ];

  const patients = [];
  for (const patData of patientsData) {
    let pat = await User.findOne({ email: patData.email });
    if (!pat) {
      pat = await Patient.create({ ...patData, passwordHash });
      console.log(`Created patient: ${pat.name} (${pat.email})`);
    } else {
      console.log(`Existing patient found: ${pat.name} (${pat.email})`);
    }
    patients.push(pat);
  }

  // 6. Availability Slots (Booked and Open for both doctors)
  // Use consistent deterministic future offsets so re-running is predictable
  const now = Date.now();
  const dayMs = 24 * 3600 * 1000;
  const slotDurationMs = 30 * 60 * 1000;

  // Doctor 1: Slot 1 (booked for tomorrow), Slot 2 (open tomorrow)
  const d1Slot1Start = new Date(now + 1 * dayMs);
  d1Slot1Start.setUTCHours(10, 0, 0, 0);
  const d1Slot1End = new Date(d1Slot1Start.getTime() + slotDurationMs);

  const d1Slot2Start = new Date(now + 1 * dayMs);
  d1Slot2Start.setUTCHours(11, 0, 0, 0);
  const d1Slot2End = new Date(d1Slot2Start.getTime() + slotDurationMs);

  // Doctor 2: Slot 3 (booked for 2 days ahead), Slot 4 (open 2 days ahead)
  const d2Slot1Start = new Date(now + 2 * dayMs);
  d2Slot1Start.setUTCHours(14, 0, 0, 0);
  const d2Slot1End = new Date(d2Slot1Start.getTime() + slotDurationMs);

  const d2Slot2Start = new Date(now + 2 * dayMs);
  d2Slot2Start.setUTCHours(15, 0, 0, 0);
  const d2Slot2End = new Date(d2Slot2Start.getTime() + slotDurationMs);

  const slotsToSeed = [
    { doctor: doctors[0]._id, startTime: d1Slot1Start, endTime: d1Slot1End, isBooked: true },
    { doctor: doctors[0]._id, startTime: d1Slot2Start, endTime: d1Slot2End, isBooked: false },
    { doctor: doctors[1]._id, startTime: d2Slot1Start, endTime: d2Slot1End, isBooked: true },
    { doctor: doctors[1]._id, startTime: d2Slot2Start, endTime: d2Slot2End, isBooked: false },
  ];

  const seededSlots = [];
  for (const sData of slotsToSeed) {
    let slot = await Slot.findOne({ doctor: sData.doctor, startTime: sData.startTime });
    if (!slot) {
      slot = await Slot.create(sData);
      console.log(`Created slot for doctor ${sData.doctor}: ${sData.startTime.toISOString()} (isBooked=${sData.isBooked})`);
    } else {
      console.log(`Existing slot found for doctor ${sData.doctor}: ${sData.startTime.toISOString()}`);
    }
    seededSlots.push(slot);
  }

  // 7. Appointments (2 confirmed appointments)
  const appointmentsData = [
    {
      patient: patients[0]._id,
      doctor: doctors[0]._id,
      slot: seededSlots[0]._id,
      dateTime: d1Slot1Start,
      endTime: d1Slot1End,
      status: 'confirmed',
      reminderSent: false,
      chatSeq: 0,
    },
    {
      patient: patients[1]._id,
      doctor: doctors[1]._id,
      slot: seededSlots[2]._id,
      dateTime: d2Slot1Start,
      endTime: d2Slot1End,
      status: 'confirmed',
      reminderSent: false,
      chatSeq: 0,
    },
  ];

  const appointments = [];
  for (const apptData of appointmentsData) {
    let appt = await Appointment.findOne({ slot: apptData.slot });
    if (!appt) {
      appt = await Appointment.create(apptData);
      console.log(`Created confirmed appointment: ${appt._id} (Doctor: ${apptData.doctor}, Patient: ${apptData.patient})`);
    } else {
      console.log(`Existing appointment found: ${appt._id}`);
    }
    appointments.push(appt);
  }

  // 8. Synthetic Medical Records (1 record per patient, with diagnosis & notes)
  const recordsData = [
    {
      patient: patients[0]._id,
      diagnosis: 'Essential Hypertension',
      notes: 'Routine blood pressure evaluation. BP 130/85 mmHg. Patient advised low-sodium diet and 30 minutes of aerobic exercise 5 days a week.',
      updatedBy: doctors[0]._id,
    },
    {
      patient: patients[1]._id,
      diagnosis: 'Contact Dermatitis',
      notes: 'Mild erythematous rash on left forearm. Advised to avoid suspected chemical detergent and apply prescribed topical hydrocortisone cream.',
      updatedBy: doctors[1]._id,
    },
  ];

  for (const recData of recordsData) {
    let record = await MedicalRecord.findOne({ patient: recData.patient });
    if (!record) {
      record = await MedicalRecord.create({
        patient: recData.patient,
        entries: [
          {
            diagnosis: recData.diagnosis,
            notes: recData.notes,
            updatedBy: recData.updatedBy,
            updatedAt: new Date(),
          },
        ],
      });
      console.log(`Created medical record for patient: ${recData.patient}`);
    } else {
      console.log(`Existing medical record found for patient: ${recData.patient}`);
    }
  }

  // 9. Synthetic Prescriptions (1 prescription per appointment)
  const prescriptionsData = [
    {
      appointment: appointments[0]._id,
      patient: patients[0]._id,
      doctor: doctors[0]._id,
      issuedDate: new Date().toISOString().slice(0, 10),
      items: [
        {
          medicine: 'Amlodipine 5mg',
          dosage: '1 tablet daily',
          instructions: 'Take once daily in the morning with water after breakfast.',
        },
      ],
      pdfUrl: `/api/v1/prescriptions/${appointments[0]._id}/pdf`,
      pdfStatus: 'pending',
    },
    {
      appointment: appointments[1]._id,
      patient: patients[1]._id,
      doctor: doctors[1]._id,
      issuedDate: new Date().toISOString().slice(0, 10),
      items: [
        {
          medicine: 'Hydrocortisone 1% Cream',
          dosage: 'Apply thin layer twice daily',
          instructions: 'Apply to affected area for 7 days. Discontinue if irritation worsens.',
        },
      ],
      pdfUrl: `/api/v1/prescriptions/${appointments[1]._id}/pdf`,
      pdfStatus: 'pending',
    },
  ];

  for (const rxData of prescriptionsData) {
    let rx = await Prescription.findOne({ appointment: rxData.appointment });
    if (!rx) {
      rx = await Prescription.create(rxData);
      console.log(`Created prescription for appointment: ${rx.appointment}`);
    } else {
      console.log(`Existing prescription found for appointment: ${rx.appointment}`);
    }
  }

  console.log('\n--- Demo Data Seeding Summary ---');
  console.log(`Password for all demo accounts: ${DEMO_PASSWORD}`);
  console.log('Doctor 1: dr.asha.patel@example.com (Cardiology, General Medicine)');
  console.log('Doctor 2: dr.vikram.rao@example.com (Dermatology)');
  console.log('Patient 1: aarav.sharma@example.com (Appointment with Dr. Patel, Medical Record, Prescription)');
  console.log('Patient 2: diya.mehta@example.com (Appointment with Dr. Rao, Medical Record, Prescription)');
  console.log('--------------------------------\n');
}

seedDemoData()
  .then(() => {
    console.log('Demo data seed completed successfully.');
  })
  .catch((err) => {
    console.error(`Demo data seed failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
