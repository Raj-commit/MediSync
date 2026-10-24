const appointmentService = require('../services/appointmentService');

// POST /api/v1/appointments
// A logged-in patient books an open slot of a doctor.
async function bookAppointment(req, res) {
  const patientId = req.user.id;
  const result = await appointmentService.bookAppointment(patientId, req.body);
  res.status(201).json(result);
}

module.exports = {
  bookAppointment,
};
