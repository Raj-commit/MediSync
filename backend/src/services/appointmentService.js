const { Doctor } = require('../models/User');
const Slot = require('../models/Slot');
const Appointment = require('../models/Appointment');
const { validateAppointmentInput } = require('../utils/validateAppointment');
const AppError = require('../utils/AppError');

/**
 * Books an open slot for a patient.
 * Rules, checked in this order after JWT and role:
 * 1. Input is valid (400 VALIDATION_ERROR)
 * 2. Slot is in the future (400 VALIDATION_ERROR)
 * 3. Doctor exists, has role 'doctor', and is active (404 NOT_FOUND)
 * 4. Doctor has such a slot (404 NOT_FOUND)
 * 5. Slot is not already booked (409 SLOT_TAKEN)
 * 6. Atomically claim slot and create appointment with status 'requested'
 * 7. If appointment creation fails after slot claim, release slot rollback
 */
async function bookAppointment(patientId, input) {
  const { doctorId, slotId } = validateAppointmentInput(input);

  // Look up the requested slot
  const slot = await Slot.findById(slotId);

  // Check: slot must be in the future
  const now = new Date();
  if (slot && slot.startTime.getTime() <= now.getTime()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Cannot book a slot in the past');
  }

  // Check: doctor exists, is a doctor, and is active
  const doctor = await Doctor.findOne({
    _id: doctorId,
    role: 'doctor',
    isActive: true,
  }).select('_id name');

  if (!doctor) {
    throw new AppError(404, 'NOT_FOUND', 'Doctor not found');
  }

  // Check: doctor has such a slot
  if (!slot || slot.doctor.toString() !== doctorId) {
    throw new AppError(404, 'NOT_FOUND', 'Slot not found for this doctor');
  }

  // Check: slot is not already booked
  if (slot.isBooked) {
    throw new AppError(409, 'SLOT_TAKEN', 'This slot is already booked');
  }

  // Atomically claim the slot to guarantee no double booking
  const claimedSlot = await Slot.findOneAndUpdate(
    { _id: slotId, doctor: doctorId, isBooked: false },
    { isBooked: true },
    { new: true }
  );

  if (!claimedSlot) {
    throw new AppError(409, 'SLOT_TAKEN', 'This slot is already booked');
  }

  // Create the appointment document with rollback on failure
  let appointment;
  try {
    appointment = await Appointment.create({
      patient: patientId,
      doctor: doctor._id,
      slot: claimedSlot._id,
      dateTime: claimedSlot.startTime,
      endTime: claimedSlot.endTime,
      status: 'requested',
    });
  } catch (err) {
    // Rollback: release the claimed slot so it is not orphaned/lost
    try {
      await Slot.findByIdAndUpdate(slotId, { isBooked: false });
    } catch (releaseErr) {
      console.error('Failed to release slot after appointment creation failure:', releaseErr);
    }

    // If duplicate key error from unique partial index on { doctor, dateTime }, report SLOT_TAKEN 409
    if (err && err.code === 11000) {
      throw new AppError(409, 'SLOT_TAKEN', 'This slot is already booked');
    }
    throw err;
  }

  return {
    appointment: {
      id: appointment._id.toString(),
      doctor: {
        id: doctor._id.toString(),
        name: doctor.name,
      },
      dateTime: appointment.dateTime.toISOString(),
      endTime: appointment.endTime.toISOString(),
      status: appointment.status,
    },
  };
}

module.exports = {
  bookAppointment,
};
