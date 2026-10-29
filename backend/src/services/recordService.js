const mongoose = require('mongoose');
const MedicalRecord = require('../models/MedicalRecord');
const { User } = require('../models/User');
const Appointment = require('../models/Appointment');
const AppError = require('../utils/AppError');

/**
 * Calculates patient's age in whole years from dateOfBirth.
 * The date of birth itself is never stored or returned in responses.
 */
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return Math.max(0, age);
}

/**
 * Formats a MedicalRecord entry subdocument for API output.
 * Ensures doctor details are restricted strictly to { id, name }.
 */
function serializeEntry(entry) {
  const doctor = entry.updatedBy;
  const doctorId = (doctor?._id || doctor || '').toString();
  const doctorName = doctor && typeof doctor === 'object' && doctor.name ? doctor.name : 'Doctor';

  return {
    id: entry._id.toString(),
    diagnosis: entry.diagnosis,
    notes: entry.notes,
    updatedAt:
      entry.updatedAt instanceof Date ? entry.updatedAt.toISOString() : new Date(entry.updatedAt).toISOString(),
    updatedBy: {
      id: doctorId,
      name: doctorName,
    },
  };
}

/**
 * Verifies that a doctor is authorized to view or append to a patient's medical record.
 * A doctor is authorized if they share at least one appointment with status 'confirmed' or 'completed'.
 *
 * Anti-enumeration rule:
 * If the patient does not exist, is not role 'patient', or has no qualifying appointment,
 * the function returns identical 404 NOT_FOUND ("Patient not found") in all three cases.
 */
async function verifyDoctorAccess(doctorId, patientId) {
  if (!patientId || !mongoose.isObjectIdOrHexString(patientId.toString())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid patient ID');
  }

  const patient = await User.findById(patientId);
  if (!patient || patient.role !== 'patient' || !patient.isActive) {
    throw new AppError(404, 'NOT_FOUND', 'Patient not found');
  }

  // Doctor must have a confirmed or completed appointment with this patient
  const qualifyingAppointment = await Appointment.findOne({
    doctor: doctorId,
    patient: patientId,
    status: { $in: ['confirmed', 'completed'] },
  });

  if (!qualifyingAppointment) {
    throw new AppError(404, 'NOT_FOUND', 'Patient not found');
  }

  return { patient };
}

/**
 * Builds the patient summary object, deriving age and excluding all sensitive PII.
 */
function buildPatientSummary(patient) {
  return {
    id: (patient._id || patient.id).toString(),
    name: patient.name,
    age: calculateAge(patient.dateOfBirth),
  };
}

/**
 * Fetches and paginates a patient's medical record, ordered newest first.
 * If no record document exists yet, returns a virtual empty record without writing to the database.
 */
async function getPatientRecord(patient, { page = 1, limit = 10 } = {}) {
  const patientId = patient._id || patient.id;

  const doc = await MedicalRecord.findOne({ patient: patientId }).populate({
    path: 'entries.updatedBy',
    select: 'name',
  });

  const allEntries = doc && Array.isArray(doc.entries) ? doc.entries : [];

  // Order newest first by updatedAt descending
  const sorted = [...allEntries].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const total = sorted.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const skip = (page - 1) * limit;
  const paginated = sorted.slice(skip, skip + limit);

  return {
    record: {
      patient: buildPatientSummary(patient),
      entries: paginated.map(serializeEntry),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    },
  };
}

/**
 * Retrieves the medical record for an authorized doctor.
 */
async function getRecordForDoctor(doctorId, patientId, queryParams) {
  const { patient } = await verifyDoctorAccess(doctorId, patientId);
  return getPatientRecord(patient, queryParams);
}

/**
 * Atomically appends a new entry to the patient's medical record.
 * If the record document does not exist, it is created lazily using an atomic upsert.
 * Concurrency safe: simultaneous first entries create one record containing both entries.
 */
async function addRecordEntry(doctor, patientId, { diagnosis, notes }) {
  const { patient } = await verifyDoctorAccess(doctor._id || doctor.id, patientId);

  const newEntry = {
    diagnosis: diagnosis.trim(),
    notes: notes.trim(),
    updatedAt: new Date(),
    updatedBy: doctor._id || doctor.id,
  };

  const updatedRecord = await MedicalRecord.findOneAndUpdate(
    { patient: patient._id || patient.id },
    {
      $setOnInsert: { patient: patient._id || patient.id },
      $push: { entries: newEntry },
    },
    {
      upsert: true,
      returnDocument: 'after',
      runValidators: true,
    }
  );

  const createdEntry = updatedRecord.entries[updatedRecord.entries.length - 1];

  return {
    entry: {
      id: createdEntry._id.toString(),
      diagnosis: createdEntry.diagnosis,
      notes: createdEntry.notes,
      updatedAt: createdEntry.updatedAt.toISOString(),
      updatedBy: {
        id: (doctor._id || doctor.id).toString(),
        name: doctor.name,
      },
    },
  };
}

module.exports = {
  calculateAge,
  serializeEntry,
  verifyDoctorAccess,
  buildPatientSummary,
  getPatientRecord,
  getRecordForDoctor,
  addRecordEntry,
};
