const doctorService = require('../services/doctorService');
const AppError = require('../utils/AppError');

// GET /api/v1/doctors
// Lists and searches active doctors for patients.
async function listDoctors(req, res) {
  const result = await doctorService.listDoctors(req.query);
  res.json(result);
}

// GET /api/v1/doctors/me/availability
// The logged-in doctor lists their own future slots.
async function getMyAvailability(req, res) {
  const result = await doctorService.getMyAvailability(req.user.id);
  res.json(result);
}

// PUT /api/v1/doctors/me/availability
// The logged-in doctor sets or updates their future availability slots.
async function updateMyAvailability(req, res) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Request body must be an object containing a slots array'
    );
  }
  if (!Array.isArray(req.body.slots)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'slots must be an array');
  }

  const result = await doctorService.updateMyAvailability(req.user.id, req.body.slots);
  res.json(result);
}

// GET /api/v1/doctors/:id/availability
// A logged-in patient views one doctor's open availability slots.
async function getDoctorAvailability(req, res) {
  const result = await doctorService.getDoctorAvailability(req.params.id);
  res.json(result);
}

module.exports = {
  listDoctors,
  getMyAvailability,
  updateMyAvailability,
  getDoctorAvailability,
};
