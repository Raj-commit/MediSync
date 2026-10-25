const appointmentService = require('../services/appointmentService');

// POST /api/v1/appointments
// A logged-in patient books an open slot of a doctor.
async function bookAppointment(req, res) {
  const patientId = req.user.id;
  const result = await appointmentService.bookAppointment(patientId, req.body);
  res.status(201).json(result);
}

// GET /api/v1/appointments
// A logged-in patient or doctor lists their own appointments with optional filtering and pagination.
async function getAppointments(req, res) {
  const result = await appointmentService.getAppointments(req.user, req.query);
  res.status(200).json(result);
}

module.exports = {
  getAppointments,
  bookAppointment,
};
