const mongoose = require("mongoose");

const NOTIFICATION_TYPES = [
  "appointment_requested",
  "appointment_request_sent",
  "appointment_confirmed",
  "appointment_rejected",
  "appointment_cancelled",
  "appointment_rescheduled",
  "appointment_completed",
  "appointment_reminder",
  "prescription_created",
];

const NOTIFICATION_STATUSES = ["unread", "read"];

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    status: {
      type: String,
      enum: NOTIFICATION_STATUSES,
      default: "unread",
      required: true,
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      required: false,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for fast querying of a user's notifications sorted by newest first,
// and counting unread notifications.
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, status: 1 });

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = {
  Notification,
  NOTIFICATION_TYPES,
  NOTIFICATION_STATUSES,
};
