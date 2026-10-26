const mongoose = require('mongoose');
const { Notification, NOTIFICATION_TYPES } = require('../models/Notification');
const { validateNotificationsQuery } = require('../utils/validateNotification');
const AppError = require('../utils/AppError');

// Template generators: plain text messages with no sensitive PII,
// no emails, no phones, no medical data, and no localized dates or times.
const templates = {
  appointmentRequested: (patientName) =>
    `You have a new appointment request from ${patientName ? patientName.trim() : 'a patient'}.`,
  appointmentRequestSent: (doctorName) =>
    `Your appointment request with Dr. ${doctorName ? doctorName.trim() : 'your doctor'} has been sent.`,
  appointmentConfirmed: (doctorName) =>
    `Dr. ${doctorName ? doctorName.trim() : 'your doctor'} confirmed your appointment.`,
  appointmentRejected: (doctorName) =>
    `Dr. ${doctorName ? doctorName.trim() : 'your doctor'} declined your appointment request.`,
  appointmentCancelled: (patientName) =>
    `Appointment with ${patientName ? patientName.trim() : 'a patient'} was cancelled.`,
  appointmentRescheduled: (patientName) =>
    `Appointment with ${patientName ? patientName.trim() : 'a patient'} was rescheduled.`,
  appointmentCompleted: (doctorName) =>
    `Your consultation with Dr. ${doctorName ? doctorName.trim() : 'your doctor'} has been completed.`,
};

/**
 * Formats a Notification document for API output.
 */
function serializeNotification(doc) {
  return {
    id: doc._id.toString(),
    type: doc.type,
    message: doc.message,
    status: doc.status,
    appointment: doc.appointment ? (doc.appointment._id || doc.appointment).toString() : null,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
  };
}

/**
 * Creates and saves a notification for a user.
 * Reusable by appointments, prescriptions, chat, etc.
 *
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} params.recipient - The user receiving the notification
 * @param {string} params.type - One of NOTIFICATION_TYPES
 * @param {string} params.message - Safe plain-text template message
 * @param {string|mongoose.Types.ObjectId} [params.appointment] - Optional referenced appointment
 * @returns {Promise<Object>} The created Notification document
 */
async function createNotification({ recipient, type, message, appointment }) {
  if (!recipient || !mongoose.isObjectIdOrHexString(recipient.toString())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A valid recipient is required for notifications');
  }

  if (!NOTIFICATION_TYPES.includes(type)) {
    throw new AppError(400, 'VALIDATION_ERROR', `Invalid notification type: "${type}"`);
  }

  if (typeof message !== 'string' || message.trim() === '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Notification message is required');
  }

  if (appointment && !mongoose.isObjectIdOrHexString(appointment.toString())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Appointment must be a valid ObjectId');
  }

  const notification = await Notification.create({
    recipient,
    type,
    message: message.trim(),
    appointment: appointment || undefined,
    status: 'unread',
  });

  return notification;
}

/**
 * Lists notifications for the authenticated user, ordered newest first.
 * Supports status filtering ('unread', 'read') and pagination.
 * Computes unreadCount for the notification badge.
 */
async function getNotifications(user, queryParams) {
  if (user.role !== 'patient' && user.role !== 'doctor') {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this');
  }

  const { status, page, limit } = validateNotificationsQuery(queryParams);

  const recipientId = user._id || user.id;
  const filter = { recipient: recipientId };
  if (status) {
    filter.status = status;
  }

  const skip = (page - 1) * limit;

  const [total, unreadCount, docs] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: recipientId, status: 'unread' }),
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const notifications = docs.map(serializeNotification);

  return {
    notifications,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
    unreadCount,
  };
}

module.exports = {
  createNotification,
  getNotifications,
  serializeNotification,
  templates,
};
