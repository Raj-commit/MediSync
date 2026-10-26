const mongoose = require('mongoose');

const APPOINTMENT_STATUSES = ['requested', 'confirmed', 'completed', 'cancelled'];

const appointmentSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    slot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Slot',
      required: true,
      index: true,
    },
    dateTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: APPOINTMENT_STATUSES,
      default: 'requested',
      required: true,
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Database-level protection against duplicate active appointments for the same doctor at the same start time.
// Note: MongoDB partialFilterExpression does not support the $in operator.
// Therefore, we use separate partial unique indexes for active states ('requested' and 'confirmed').
appointmentSchema.index(
  { doctor: 1, dateTime: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'requested' },
    name: 'unique_requested_doctor_datetime',
  }
);

appointmentSchema.index(
  { doctor: 1, dateTime: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'confirmed' },
    name: 'unique_confirmed_doctor_datetime',
  }
);

// Also index patient for quick lookup in future appointment history / management features
appointmentSchema.index({ patient: 1, dateTime: -1 });
appointmentSchema.index({ doctor: 1, dateTime: -1 });

const Appointment = mongoose.model('Appointment', appointmentSchema);

module.exports = Appointment;
