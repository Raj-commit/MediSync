const { Doctor } = require('../models/User');
const Slot = require('../models/Slot');
const Appointment = require('../models/Appointment');
const {
  validateAppointmentInput,
  validateAppointmentsQuery,
  validateAppointmentId,
  validateAppointmentAction,
} = require('../utils/validateAppointment');
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

/**
 * Lists appointments for the logged-in patient or doctor.
 * Filters by status, when (upcoming | past), with pagination.
 * Excludes sensitive fields and strictly populates public identity (id, name).
 */
async function getAppointments(user, queryParams) {
  const { status, when, page, limit } = validateAppointmentsQuery(queryParams);

  const filter = {};
  if (user.role === 'patient') {
    filter.patient = user._id || user.id;
  } else if (user.role === 'doctor') {
    filter.doctor = user._id || user.id;
  } else {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this');
  }

  if (status) {
    filter.status = status;
  }

  const now = new Date();
  let sort = { dateTime: -1 }; // default: newest first
  if (when === 'upcoming') {
    filter.dateTime = { $gte: now };
    sort = { dateTime: 1 }; // soonest first
  } else if (when === 'past') {
    filter.dateTime = { $lt: now };
    sort = { dateTime: -1 }; // most recent past first
  }

  const skip = (page - 1) * limit;
  const populateField = user.role === 'patient' ? 'doctor' : 'patient';

  const [total, docs] = await Promise.all([
    Appointment.countDocuments(filter),
    Appointment.find(filter)
      .populate(populateField, '_id name')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const appointments = docs.map((doc) => {
    const item = {
      id: doc._id.toString(),
      dateTime: doc.dateTime.toISOString(),
      endTime: doc.endTime.toISOString(),
      status: doc.status,
    };
    if (user.role === 'patient') {
      item.doctor = doc.doctor
        ? {
            id: (doc.doctor._id || doc.doctor).toString(),
            name: doc.doctor.name || '',
          }
        : null;
    } else {
      item.patient = doc.patient
        ? {
            id: (doc.patient._id || doc.patient).toString(),
            name: doc.patient.name || '',
          }
        : null;
    }
    return item;
  });

  return {
    appointments,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}

/**
 * Manages an appointment based on action (cancel, reschedule, accept, reject, complete).
 * In Step 2: implements 'cancel' (patient only).
 */
async function manageAppointment(user, appointmentId, body) {
  validateAppointmentId(appointmentId);
  const validated = validateAppointmentAction(body);
  const { action } = validated;

  if (action === 'cancel') {
    if (user.role !== 'patient') {
      throw new AppError(403, 'FORBIDDEN', 'Only patients can cancel appointments');
    }

    // Patient can only cancel their own appointment.
    // If not found or belongs to another patient, return 404 NOT_FOUND.
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patient: user._id || user.id,
    });

    if (!appointment) {
      throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
    }

    // Status checks
    if (appointment.status === 'cancelled') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Appointment is already cancelled');
    }
    if (appointment.status === 'completed') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Cannot cancel a completed appointment');
    }
    if (appointment.status !== 'requested' && appointment.status !== 'confirmed') {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Cannot cancel an appointment with status "${appointment.status}"`
      );
    }

    // Time check: cannot cancel past or ongoing appointment
    const now = new Date();
    if (appointment.dateTime.getTime() <= now.getTime()) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Cannot cancel a past or ongoing appointment');
    }

    // Atomically transition status from requested|confirmed to cancelled
    const updated = await Appointment.findOneAndUpdate(
      { _id: appointment._id, status: { $in: ['requested', 'confirmed'] } },
      { status: 'cancelled' },
      { new: true }
    ).populate('doctor', '_id name');

    if (!updated) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Appointment is already cancelled');
    }

    // Release the booked slot so it becomes open again
    if (appointment.slot) {
      await Slot.findByIdAndUpdate(appointment.slot, { isBooked: false });
    }

    return {
      appointment: {
        id: updated._id.toString(),
        doctor: updated.doctor
          ? {
              id: (updated.doctor._id || updated.doctor).toString(),
              name: updated.doctor.name || '',
            }
          : null,
        dateTime: updated.dateTime.toISOString(),
        endTime: updated.endTime.toISOString(),
        status: updated.status,
      },
    };
  }

  if (action === 'accept' || action === 'reject') {
    if (user.role !== 'doctor') {
      throw new AppError(403, 'FORBIDDEN', `Only doctors can ${action} appointments`);
    }

    // Doctor can only accept/reject appointments that belong to them
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      doctor: user._id || user.id,
    });

    if (!appointment) {
      throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
    }

    if (action === 'accept') {
      if (appointment.status === 'confirmed') {
        throw new AppError(400, 'VALIDATION_ERROR', 'Appointment is already confirmed');
      }
      if (appointment.status === 'cancelled') {
        throw new AppError(400, 'VALIDATION_ERROR', 'Cannot accept a cancelled appointment');
      }
      if (appointment.status === 'completed') {
        throw new AppError(400, 'VALIDATION_ERROR', 'Cannot accept a completed appointment');
      }
      if (appointment.status !== 'requested') {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Cannot accept an appointment with status "${appointment.status}"`
        );
      }

      const now = new Date();
      if (appointment.dateTime.getTime() <= now.getTime()) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Cannot accept a past or ongoing appointment');
      }

      let updated;
      try {
        updated = await Appointment.findOneAndUpdate(
          { _id: appointment._id, status: 'requested' },
          { status: 'confirmed' },
          { new: true }
        ).populate('patient', '_id name');
      } catch (err) {
        if (err && err.code === 11000) {
          throw new AppError(
            409,
            'SLOT_TAKEN',
            'Another appointment is already confirmed for this time slot'
          );
        }
        throw err;
      }

      if (!updated) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Appointment could not be accepted');
      }

      return {
        appointment: {
          id: updated._id.toString(),
          patient: updated.patient
            ? {
                id: (updated.patient._id || updated.patient).toString(),
                name: updated.patient.name || '',
              }
            : null,
          dateTime: updated.dateTime.toISOString(),
          endTime: updated.endTime.toISOString(),
          status: updated.status,
        },
      };
    }

    // action === 'reject'
    if (appointment.status === 'cancelled') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Appointment is already cancelled');
    }
    if (appointment.status === 'confirmed') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Cannot reject an already confirmed appointment');
    }
    if (appointment.status === 'completed') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Cannot reject a completed appointment');
    }
    if (appointment.status !== 'requested') {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Cannot reject an appointment with status "${appointment.status}"`
      );
    }

    const updated = await Appointment.findOneAndUpdate(
      { _id: appointment._id, status: 'requested' },
      { status: 'cancelled' },
      { new: true }
    ).populate('patient', '_id name');

    if (!updated) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Appointment could not be rejected');
    }

    // Free the slot so it becomes open again
    if (appointment.slot) {
      await Slot.findByIdAndUpdate(appointment.slot, { isBooked: false });
    }

    return {
      appointment: {
        id: updated._id.toString(),
        patient: updated.patient
          ? {
              id: (updated.patient._id || updated.patient).toString(),
              name: updated.patient.name || '',
            }
          : null,
        dateTime: updated.dateTime.toISOString(),
        endTime: updated.endTime.toISOString(),
        status: updated.status,
      },
    };
  }

  // Future steps will handle reschedule, complete
  throw new AppError(400, 'VALIDATION_ERROR', `Action "${action}" is not yet implemented`);
}

module.exports = {
  manageAppointment,
  getAppointments,
  bookAppointment,
};
