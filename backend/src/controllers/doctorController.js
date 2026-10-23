const doctorService = require('../services/doctorService');

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

module.exports = {
  listDoctors,
  getMyAvailability,
};
