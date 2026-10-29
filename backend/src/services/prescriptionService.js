const mongoose = require('mongoose');
const Prescription = require('../models/Prescription');
const Appointment = require('../models/Appointment');
const { generatePrescriptionPdf } = require('./pdfService');
const { createNotification, templates } = require('./notificationService');
const {
  validatePrescriptionInput,
  validatePrescriptionId,
  validatePrescriptionsQuery,
} = require('../utils/validatePrescription');
const AppError = require('../utils/AppError');

/**
 * Serializes a Prescription document for API output.
 * Ensures patient and doctor are formatted strictly as { id, name },
 * no personal contact details (email, phone, address) or passwordHash are leaked,
 * and pdfData binary bytes are never included.
 */
function serializePrescription(doc) {
  const patient = doc.patient;
  const doctor = doc.doctor;
  const appointment = doc.appointment;

  return {
    id: doc._id.toString(),
    appointment: (appointment?._id || appointment || '').toString(),
    patient: {
      id: (patient?._id || patient || '').toString(),
      name: patient && typeof patient === 'object' && patient.name ? patient.name : 'Patient',
    },
    doctor: {
      id: (doctor?._id || doctor || '').toString(),
      name: doctor && typeof doctor === 'object' && doctor.name ? doctor.name : 'Doctor',
    },
    issuedDate: doc.issuedDate,
    items: doc.items.map((item) => ({
      medicine: item.medicine,
      dosage: item.dosage,
      instructions: item.instructions,
    })),
    pdfUrl: doc.pdfUrl,
    pdfStatus: doc.pdfStatus || 'pending',
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
  };
}

/**
 * Creates a digital prescription for a completed consultation.
 *
 * Rules, checked in this order after JWT and role:
 * 1. Admin gets 403 FORBIDDEN.
 * 2. Only the doctor of the appointment can create (403 for patients).
 * 3. Validate body syntax and limits (400 VALIDATION_ERROR).
 * 4. Appointment exists and belongs to this doctor; if not, 404 NOT_FOUND (anti-enumeration).
 * 5. Appointment status must be 'completed' (400 VALIDATION_ERROR).
 * 6. At most one prescription per appointment; duplicate gets 409 PRESCRIPTION_EXISTS.
 * 7. Save to MongoDB before calling Django (zero data loss).
 * 8. Attempt Django PDF generation; if it fails, preserve prescription with pdfStatus 'pending'.
 * 9. Non-blocking patient notification with privacy-safe template.
 */
async function createPrescription(user, body) {
  if (user.role === 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Admins cannot access prescriptions');
  }

  if (user.role !== 'doctor') {
    throw new AppError(403, 'FORBIDDEN', 'Only doctors can create prescriptions');
  }

  const { appointmentId, items } = validatePrescriptionInput(body);

  const appointment = await Appointment.findById(appointmentId)
    .populate('patient', 'name')
    .populate('doctor', 'name');

  // Anti-enumeration: 404 if appointment does not exist OR caller is not the appointment's doctor
  if (!appointment || appointment.doctor._id.toString() !== user.id.toString()) {
    throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
  }

  // Appointment must be completed
  if (appointment.status !== 'completed') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Prescription can only be created for completed appointments (current status: "${appointment.status}")`
    );
  }

  // Check if a prescription already exists for this appointment
  const existing = await Prescription.findOne({ appointment: appointment._id });
  if (existing) {
    throw new AppError(409, 'PRESCRIPTION_EXISTS', 'A prescription has already been issued for this appointment');
  }

  const prescriptionId = new mongoose.Types.ObjectId();
  const issuedDate = new Date().toISOString().slice(0, 10);
  const pdfUrl = `/api/v1/prescriptions/${prescriptionId.toString()}/pdf`;

  // Step 1: Save prescription metadata to MongoDB first (guarantees no clinical data loss)
  let prescription;
  try {
    prescription = await Prescription.create({
      _id: prescriptionId,
      appointment: appointment._id,
      patient: appointment.patient._id,
      doctor: appointment.doctor._id,
      issuedDate,
      items,
      pdfUrl,
      pdfStatus: 'pending',
    });
  } catch (err) {
    if (err && err.code === 11000) {
      throw new AppError(409, 'PRESCRIPTION_EXISTS', 'A prescription has already been issued for this appointment');
    }
    throw err;
  }

  // Step 2: Attempt immediate PDF generation from Django
  try {
    const pdfBytes = await generatePrescriptionPdf({
      prescriptionId: prescription._id.toString(),
      patientName: appointment.patient?.name || 'Patient',
      doctorName: appointment.doctor?.name || 'Doctor',
      issuedDate,
      items,
    });

    prescription.pdfData = pdfBytes;
    prescription.pdfStatus = 'ready';
    await prescription.save();
  } catch (pdfErr) {
    // Non-blocking: Prescription remains saved safely in MongoDB.
    // GET /prescriptions/:id/pdf will generate it on-demand when requested.
    console.warn('Initial PDF generation deferred (will retry on download):', pdfErr.message);
  }

  // Step 3: Notify the patient (non-blocking)
  try {
    await createNotification({
      recipient: appointment.patient._id,
      type: 'prescription_created',
      message: templates.prescriptionCreated(appointment.doctor?.name),
      appointment: appointment._id,
    });
  } catch (notifErr) {
    console.error('Failed to send prescription notification:', notifErr.message);
  }

  // Populate references for clean serialization
  await prescription.populate('patient', 'name');
  await prescription.populate('doctor', 'name');

  return serializePrescription(prescription);
}

module.exports = {
  createPrescription,
  serializePrescription,
};
