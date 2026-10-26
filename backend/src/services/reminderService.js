const Appointment = require('../models/Appointment');
const { createNotification, templates } = require('./notificationService');

let timer = null;

/**
 * Checks for confirmed appointments starting within the configured reminder window
 * and creates reminder notifications for both patient and doctor.
 * Marked with reminderSent: true so reminders are never duplicated across restarts.
 */
async function checkAndSendReminders() {
  try {
    const reminderMinutes = parseInt(process.env.APPOINTMENT_REMINDER_MINUTES || '60', 10);
    const now = new Date();
    const reminderWindow = new Date(now.getTime() + reminderMinutes * 60 * 1000);

    const appointments = await Appointment.find({
      status: 'confirmed',
      reminderSent: { $ne: true },
      dateTime: { $gte: now, $lte: reminderWindow },
    })
      .populate('patient', '_id name')
      .populate('doctor', '_id name');

    for (const appt of appointments) {
      const patientId = appt.patient ? (appt.patient._id || appt.patient) : null;
      const doctorId = appt.doctor ? (appt.doctor._id || appt.doctor) : null;
      const patientName = appt.patient && appt.patient.name ? appt.patient.name : '';
      const doctorName = appt.doctor && appt.doctor.name ? appt.doctor.name : '';

      try {
        const promises = [];
        if (patientId) {
          promises.push(
            createNotification({
              recipient: patientId,
              type: 'appointment_reminder',
              message: templates.appointmentReminder(doctorName),
              appointment: appt._id,
            })
          );
        }
        if (doctorId) {
          promises.push(
            createNotification({
              recipient: doctorId,
              type: 'appointment_reminder',
              message: templates.appointmentReminderDoctor(patientName),
              appointment: appt._id,
            })
          );
        }
        await Promise.all(promises);
        await Appointment.findByIdAndUpdate(appt._id, { reminderSent: true });
      } catch (err) {
        console.error(`Failed to send reminder for appointment ${appt._id}:`, err);
      }
    }
  } catch (err) {
    console.error('Error in checkAndSendReminders:', err);
  }
}

/**
 * Starts the background reminder interval.
 */
function startReminderJob(intervalMs = 60000) {
  if (timer) return timer;
  checkAndSendReminders();
  timer = setInterval(checkAndSendReminders, intervalMs);
  if (timer.unref) {
    timer.unref();
  }
  return timer;
}

/**
 * Stops the background reminder interval.
 */
function stopReminderJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  checkAndSendReminders,
  startReminderJob,
  stopReminderJob,
};
